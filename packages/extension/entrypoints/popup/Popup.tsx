import { useCallback, useEffect, useState, type FormEvent } from "react";
import { browser } from "wxt/browser";
import { findNovelForUrl, hasChapter, updateNovel, type LibraryNovel } from "../../lib/library";
import { send, type CaptureReply, type Message, type PendingNovel, type SetupReply } from "../../lib/messages";
import { guessNovelTitle } from "../../lib/titles";
import { isWebPage, proposePrefix, sitePattern } from "../../lib/urls";
import { useLibraryChanges } from "../../lib/useLibraryChanges";

type TabInfo = { id: number; url: string; title: string };

type View =
  | { kind: "loading" }
  | { kind: "not-web" }
  | { kind: "new"; tab: TabInfo }
  | { kind: "novel"; tab: TabInfo; novel: LibraryNovel; pageSaved: boolean; hasAccess: boolean };

async function currentTab(): Promise<TabInfo | null> {
  // The automated tests open the popup as a normal page and point it at a tab.
  const forced = new URLSearchParams(location.search).get("tabId");
  const tab = forced
    ? await browser.tabs.get(Number(forced))
    : (await browser.tabs.query({ active: true, currentWindow: true }))[0];
  if (tab?.id === undefined || !tab.url) return null;
  return { id: tab.id, url: tab.url, title: tab.title ?? "" };
}

export function Popup() {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [note, setNote] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const tab = await currentTab();
    if (!tab || !isWebPage(tab.url)) return setView({ kind: "not-web" });
    const novel = await findNovelForUrl(tab.url);
    if (!novel) return setView({ kind: "new", tab });
    const [pageSaved, hasAccess] = await Promise.all([
      hasChapter(novel.id, tab.url),
      browser.permissions.contains({ origins: [sitePattern(tab.url)] }),
    ]);
    setView({ kind: "novel", tab, novel, pageSaved, hasAccess });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useLibraryChanges(refresh);

  return (
    <main className="popup-body">
      <header className="popup-header">
        <span className="brand">
          <span aria-hidden="true">📖</span> Light Novel Wiki
        </span>
        <button type="button" className="button button--small" onClick={() => openLibrary()}>
          Library
        </button>
      </header>
      {view.kind === "loading" && <p className="muted">Loading…</p>}
      {view.kind === "not-web" && <p className="muted">Open a chapter of a novel to start saving it.</p>}
      {view.kind === "new" && <StartForm tab={view.tab} onNote={setNote} onDone={refresh} />}
      {view.kind === "novel" && <NovelStatus view={view} onNote={setNote} onChange={refresh} />}
      {note && (
        <p className="note" role="status">
          {note}
        </p>
      )}
    </main>
  );
}

function StartForm({
  tab,
  onNote,
  onDone,
}: {
  tab: TabInfo;
  onNote: (note: string | null) => void;
  onDone: () => Promise<void>;
}) {
  const [prefix, setPrefix] = useState(() => proposePrefix(tab.url));
  const [title, setTitle] = useState(() => guessNovelTitle(tab.title, proposePrefix(tab.url), new URL(tab.url).hostname));
  const [busy, setBusy] = useState(false);
  const prefixError = prefixProblem(prefix, tab.url);

  const start = (e: FormEvent) => {
    e.preventDefault();
    if (prefixError) return;
    const pending: PendingNovel = { title: title.trim(), sitePrefix: prefix.trim(), tabId: tab.id };
    setBusy(true);
    onNote(null);
    // The permission request has to happen right away, inside the click. Everything else
    // is finished by the background, in case the popup closes while the browser asks.
    void browser.storage.local.set({ pendingNovel: pending });
    browser.permissions
      .request({ origins: [sitePattern(pending.sitePrefix)] })
      .then(async (granted) => {
        if (!granted) {
          onNote("The extension needs access to this site to save its chapters. Nothing was saved.");
          await browser.storage.local.remove("pendingNovel");
          return;
        }
        const reply = await send<SetupReply>({ type: "finish-setup" });
        onNote(reply?.novelId ? "Saving is on. Chapters you open on this site are saved as you read." : null);
        await onDone();
      })
      .catch((err: unknown) => onNote(`Couldn't start saving: ${String(err)}`))
      .finally(() => setBusy(false));
  };

  return (
    <form className="form" onSubmit={start}>
      <h1 className="popup-title">Save this novel as you read</h1>
      <p className="muted small">Every chapter you open is saved on this computer, ready to turn into a wiki.</p>
      <label className="field">
        <span className="field__label">Novel</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="field">
        <span className="field__label">Its chapters are at</span>
        <input value={prefix} onChange={(e) => setPrefix(e.target.value)} spellCheck={false} />
        <span className={prefixError ? "field__error" : "field__hint"}>
          {prefixError ?? "Pages whose address starts with this are saved."}
        </span>
      </label>
      <button type="submit" className="button button--primary" disabled={busy || !title.trim() || !!prefixError}>
        {busy ? "Starting…" : "Start saving"}
      </button>
    </form>
  );
}

function prefixProblem(prefix: string, pageUrl: string): string | null {
  try {
    const url = new URL(prefix.trim());
    if (!/^https?:$/.test(url.protocol)) return "Use an http or https address.";
    if (!pageUrl.startsWith(url.origin)) return "This has to be on the same site as the current page.";
    return null;
  } catch {
    return "That isn't a web address.";
  }
}

function NovelStatus({
  view,
  onNote,
  onChange,
}: {
  view: Extract<View, { kind: "novel" }>;
  onNote: (note: string | null) => void;
  onChange: () => Promise<void>;
}) {
  const { tab, novel, pageSaved, hasAccess } = view;
  const [busy, setBusy] = useState(false);

  const saveNow = async () => {
    setBusy(true);
    onNote(null);
    try {
      await browser.scripting.executeScript({ target: { tabId: tab.id }, files: ["/content-scripts/reader.js"] });
      const reply = (await browser.tabs.sendMessage(tab.id, { type: "capture-now" } satisfies Message)) as
        | CaptureReply
        | undefined;
      onNote(reply?.saved ? "Saved this page." : "Couldn't find any text to save on this page.");
      await onChange();
    } catch (err) {
      onNote(`Couldn't read this page: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async () => {
    await updateNovel(novel.id, { enabled: !novel.enabled });
    await send({ type: "sync-sites" });
    await onChange();
  };

  const grant = () => {
    browser.permissions
      .request({ origins: [sitePattern(tab.url)] })
      .then(async (granted) => {
        if (granted) await send({ type: "sync-sites" });
        await onChange();
      })
      .catch(() => {});
  };

  return (
    <section className="form">
      <div>
        <h1 className="popup-title">{novel.title}</h1>
        <p className="muted small">
          {novel.chapterCount} {novel.chapterCount === 1 ? "chapter" : "chapters"} saved ·{" "}
          {novel.wordCount.toLocaleString()} words
        </p>
      </div>
      {!hasAccess ? (
        <div className="callout">
          <p>The extension can't read this site right now.</p>
          <button type="button" className="button button--primary" onClick={grant}>
            Allow access to {new URL(tab.url).hostname}
          </button>
        </div>
      ) : pageSaved ? (
        <p className="status status--ok">✓ This chapter is saved.</p>
      ) : (
        <div className="callout">
          <p>{novel.enabled ? "This page isn't saved. It may not look like a chapter yet." : "Saving is paused."}</p>
          <button type="button" className="button" onClick={saveNow} disabled={busy}>
            {busy ? "Saving…" : "Save this page"}
          </button>
        </div>
      )}
      <div className="row">
        <button type="button" className="button button--small" onClick={toggle}>
          {novel.enabled ? "Pause saving" : "Resume saving"}
        </button>
        <button type="button" className="button button--small" onClick={() => openLibrary(novel.id)}>
          See chapters
        </button>
      </div>
    </section>
  );
}

function openLibrary(novelId?: string) {
  const url = browser.runtime.getURL(`/library.html${novelId ? `#/novel/${encodeURIComponent(novelId)}` : ""}`);
  void browser.tabs.create({ url });
  window.close();
}
