import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { browser } from "wxt/browser";
import {
  findChapterLinks,
  MIN_LIST_LINKS,
  runCollector,
  type CollectPlan,
  type CollectProgress,
  type FetchResult,
  type LinkInfo,
} from "../../lib/collect";
import { getNovel, listChapters, saveWebChapter, type LibraryNovel } from "../../lib/library";
import { normalizeUrl, sitePattern } from "../../lib/urls";

/** One page every 1.5 seconds, so collecting never feels like a flood to the site. */
const DELAY_MS = __LNW_TEST__ ? 50 : 1500;

export const planKey = (novelId: string) => `collectPlan:${novelId}`;

/** Lets the collector wait while paused, and tells it to stop. */
class Controller {
  paused = false;
  stopped = false;
  private wake: (() => void) | undefined;
  pause() {
    this.paused = true;
  }
  resume() {
    this.paused = false;
    this.wake?.();
  }
  stop() {
    this.stopped = true;
    this.wake?.();
  }
  async gate(): Promise<boolean> {
    while (this.paused && !this.stopped) await new Promise<void>((r) => (this.wake = r));
    return !this.stopped;
  }
}

export function CollectPage({ id }: { id: string }) {
  const [novel, setNovel] = useState<LibraryNovel | null | undefined>(undefined);
  const [plan, setPlan] = useState<CollectPlan | null>(null);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [hasAccess, setHasAccess] = useState(true);
  const [progress, setProgress] = useState<CollectProgress | null>(null);
  const [paused, setPaused] = useState(false);
  const controller = useRef<Controller | null>(null);

  const load = useCallback(async () => {
    const found = (await getNovel(id)) ?? null;
    setNovel(found);
    if (!found) return;
    setSavedKeys(new Set((await listChapters(found)).map((c) => c.key)));
    const stored = (await browser.storage.local.get(planKey(id)))[planKey(id)] as CollectPlan | undefined;
    if (stored) setPlan(stored);
    if (found.sitePrefix) setHasAccess(await browser.permissions.contains({ origins: [sitePattern(found.sitePrefix)] }));
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const running = progress?.status === "running";
  useEffect(() => {
    if (!running) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    addEventListener("beforeunload", warn);
    return () => removeEventListener("beforeunload", warn);
  }, [running]);

  if (novel === undefined) return <p className="muted">Loading…</p>;
  if (novel === null || novel.source !== "web" || !novel.sitePrefix) {
    return (
      <div className="empty">
        <p>Auto-collect works for novels saved from a website.</p>
        <a href="#/">Back to the library</a>
      </div>
    );
  }
  const prefix = novel.sitePrefix;

  const start = async () => {
    if (!plan) return;
    const ctl = new Controller();
    controller.current = ctl;
    setPaused(false);
    const known = new Set(savedKeys);
    const final = await runCollector(plan, {
      fetchPage: fetchPage,
      parse: (html) => new DOMParser().parseFromString(html, "text/html"),
      save: async (url, title, text) => {
        await saveWebChapter(novel.id, url, title, text);
        known.add(normalizeUrl(url));
      },
      alreadySaved: (url) => known.has(normalizeUrl(url)),
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      onProgress: setProgress,
      gate: () => ctl.gate(),
      delayMs: DELAY_MS,
    });
    setSavedKeys(known);
    if (final.status === "finished") await browser.storage.local.remove(planKey(novel.id));
    browser.runtime.sendMessage({ type: "library-changed" }).catch(() => {});
  };

  const grant = () => {
    browser.permissions
      .request({ origins: [sitePattern(prefix)] })
      .then((granted) => setHasAccess(granted))
      .catch(() => {});
  };

  return (
    <div className="stack">
      <p className="breadcrumb">
        <a href={`#/novel/${encodeURIComponent(novel.id)}`}>← {novel.title}</a>
      </p>
      <div>
        <h1>Collect all chapters</h1>
        <p className="muted">
          Downloads the chapters of <strong>{novel.title}</strong> one at a time, with a pause between each, and saves
          them to your library. Use this for stories their authors publish for free (or that you have permission to
          read), like those on Royal Road or Scribble Hub.
        </p>
      </div>

      {!hasAccess && (
        <div className="callout">
          <p>The extension needs access to {new URL(prefix).hostname} to download chapters.</p>
          <button type="button" className="button button--primary" onClick={grant}>
            Allow access
          </button>
        </div>
      )}

      {!progress && <PlanFinder prefix={prefix} plan={plan} onPlan={setPlan} novelId={novel.id} />}

      {plan && !progress && <PlanSummary plan={plan} savedKeys={savedKeys} />}

      {plan && !progress && (
        <div className="row">
          <button type="button" className="button button--primary" onClick={() => void start()} disabled={!hasAccess}>
            Start collecting
          </button>
          <span className="muted small">Keep this tab open while it runs.</span>
        </div>
      )}

      {progress && (
        <ProgressPanel
          progress={progress}
          paused={paused}
          onPause={() => {
            controller.current?.pause();
            setPaused(true);
          }}
          onResume={() => {
            controller.current?.resume();
            setPaused(false);
          }}
          onStop={() => controller.current?.stop()}
          novelId={novel.id}
        />
      )}
    </div>
  );
}

async function fetchPage(url: string): Promise<FetchResult> {
  try {
    const res = await fetch(url, { credentials: "include", cache: "no-cache" });
    return res.ok ? { ok: true, html: await res.text() } : { ok: false, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

/** Finds the chapter list on a page the reader names, if the popup didn't already. */
function PlanFinder({
  prefix,
  plan,
  onPlan,
  novelId,
}: {
  prefix: string;
  plan: CollectPlan | null;
  onPlan: (plan: CollectPlan) => void;
  novelId: string;
}) {
  const [address, setAddress] = useState(plan?.mode === "next" ? plan.startUrl : prefix);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const find = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      const url = normalizeUrl(address.trim());
      if (!url.startsWith(new URL(prefix).origin)) throw new Error("That page is on a different site from this novel.");
      const page = await fetchPage(url);
      if (!page.ok) throw new Error(`Couldn't open that page (HTTP ${page.status || "error"}).`);
      const doc = new DOMParser().parseFromString(page.html, "text/html");
      const links: LinkInfo[] = [...doc.querySelectorAll("a[href]")].map((a) => ({
        href: new URL(a.getAttribute("href")!, url).toString(),
        text: a.textContent ?? "",
      }));
      const urls = findChapterLinks(links, prefix, url);
      const next: CollectPlan =
        urls.length >= MIN_LIST_LINKS ? { novelId, prefix, mode: "list", urls } : { novelId, prefix, mode: "next", startUrl: url };
      await browser.storage.local.set({ [planKey(novelId)]: next });
      onPlan(next);
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card form" onSubmit={find}>
      <label className="field">
        <span className="field__label">{plan ? "Look somewhere else" : "Page with the chapter list"}</span>
        <input value={address} onChange={(e) => setAddress(e.target.value)} spellCheck={false} />
        <span className="field__hint">
          The novel's table of contents works best. A chapter page works too: collecting then follows its “Next
          chapter” links.
        </span>
      </label>
      <div className="row">
        <button type="submit" className="button" disabled={busy}>
          {busy ? "Looking…" : "Find chapters"}
        </button>
        {note && <span className="field__error">{note}</span>}
      </div>
    </form>
  );
}

function PlanSummary({ plan, savedKeys }: { plan: CollectPlan; savedKeys: Set<string> }) {
  if (plan.mode === "next") {
    return (
      <div className="card">
        <p>
          <strong>No chapter list on that page.</strong> Collecting starts at{" "}
          <a href={plan.startUrl} target="_blank" rel="noreferrer">
            {plan.startUrl}
          </a>{" "}
          and follows each chapter's “Next chapter” link until there isn't one.
        </p>
      </div>
    );
  }
  const already = plan.urls.filter((u) => savedKeys.has(normalizeUrl(u))).length;
  const toFetch = plan.urls.length - already;
  const minutes = Math.ceil((toFetch * DELAY_MS) / 60000);
  return (
    <div className="card">
      <p>
        <strong data-testid="found-count">Found {plan.urls.length} chapters.</strong>{" "}
        {already > 0 && `${already} are already saved. `}
        {toFetch > 0 ? `Downloading the other ${toFetch} takes about ${minutes} ${minutes === 1 ? "minute" : "minutes"}.` : "Nothing left to download."}
      </p>
      <p className="muted small">
        From {plan.urls[0]} to {plan.urls.at(-1)}
      </p>
    </div>
  );
}

function ProgressPanel({
  progress,
  paused,
  onPause,
  onResume,
  onStop,
  novelId,
}: {
  progress: CollectProgress;
  paused: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  novelId: string;
}) {
  const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : undefined;
  const running = progress.status === "running";
  return (
    <section className="card form" aria-live="polite">
      <div>
        <h2>
          {running
            ? paused
              ? "Paused"
              : "Collecting…"
            : progress.status === "finished"
              ? "Done"
              : progress.status === "stopped"
                ? "Stopped"
                : "Couldn't finish"}
        </h2>
        <p className="small" data-testid="collect-counts">
          {progress.saved} saved · {progress.skipped} already saved · {progress.failed} without chapter text
          {progress.total ? ` · ${progress.done} of ${progress.total}` : ` · ${progress.done} pages`}
        </p>
      </div>
      {percent !== undefined && (
        <div className="progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
          <div className="progress__bar" style={{ width: `${percent}%` }} />
        </div>
      )}
      {progress.current && <p className="muted small chapter-row__title">{progress.current}</p>}
      {progress.message && <p className={progress.status === "failed" ? "callout" : "muted"}>{progress.message}</p>}
      <div className="row">
        {running && !paused && (
          <button type="button" className="button" onClick={onPause}>
            Pause
          </button>
        )}
        {running && paused && (
          <button type="button" className="button button--primary" onClick={onResume}>
            Resume
          </button>
        )}
        {running && (
          <button type="button" className="button button--danger" onClick={onStop}>
            Stop
          </button>
        )}
        {!running && (
          <a className="button" href={`#/novel/${encodeURIComponent(novelId)}`}>
            See chapters
          </a>
        )}
      </div>
    </section>
  );
}
