import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  deleteChapter,
  deleteNovel,
  getChapterText,
  getNovel,
  listChapters,
  listNovels,
  updateNovel,
  type ChapterMeta,
  type ChapterOrder,
  type LibraryNovel,
} from "../../lib/library";
import { send } from "../../lib/messages";
import { useLibraryChanges } from "../../lib/useLibraryChanges";
import { CollectPage } from "./Collect";
import { ImportBook } from "./Import";

function useHash(): string {
  const [hash, setHash] = useState(() => location.hash);
  useEffect(() => {
    const onChange = () => setHash(location.hash);
    addEventListener("hashchange", onChange);
    return () => removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

export function Library() {
  const hash = useHash();
  const [, novelId, subpage] = /^#\/novel\/([^/]+)(\/collect)?$/.exec(hash) ?? [];
  useEffect(() => {
    document.title = "Library · Light Novel Wiki";
  }, []);
  return (
    <div className="page">
      <header className="page-header">
        <a className="brand" href="#/">
          <span aria-hidden="true">📖</span> Light Novel Wiki · Library
        </a>
      </header>
      <main className="container">
        {novelId && subpage ? (
          <CollectPage key={`${novelId}/collect`} id={decodeURIComponent(novelId)} />
        ) : novelId ? (
          <NovelDetail key={novelId} id={decodeURIComponent(novelId)} />
        ) : (
          <NovelList />
        )}
      </main>
    </div>
  );
}

const SOURCE_LABEL: Record<LibraryNovel["source"], string> = {
  web: "Saved as you read",
  epub: "EPUB file",
  pdf: "PDF file",
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

function NovelList() {
  const [novels, setNovels] = useState<LibraryNovel[] | null>(null);
  const load = useCallback(async () => setNovels(await listNovels()), []);
  useEffect(() => {
    void load();
  }, [load]);
  useLibraryChanges(load);

  if (!novels) return <p className="muted">Loading…</p>;
  return (
    <div className="stack">
      <h1>Your library</h1>
      {novels.length === 0 ? (
        <div className="empty">
          <p>Nothing saved yet.</p>
          <p className="muted">
            Open a chapter of a novel, click the 📖 Light Novel Wiki button in your browser's toolbar, and choose
            “Start saving”. Every chapter you read after that is saved here. Or import an ebook below.
          </p>
        </div>
      ) : (
        <ul className="card-list">
          {novels.map((n) => (
            <li key={n.id}>
              <a className="card card--link" href={`#/novel/${encodeURIComponent(n.id)}`}>
                <h2>
                  {n.title}
                  {n.source === "web" && !n.enabled && <span className="badge">Paused</span>}
                </h2>
                <p className="muted small">
                  {SOURCE_LABEL[n.source]}
                  {n.sitePrefix ? ` · ${new URL(n.sitePrefix).hostname}` : ""}
                </p>
                <p className="small">
                  {n.chapterCount} {n.chapterCount === 1 ? "chapter" : "chapters"} · {n.wordCount.toLocaleString()}{" "}
                  words · updated {formatDate(n.updatedAt)}
                </p>
              </a>
            </li>
          ))}
        </ul>
      )}
      <ImportBook />
    </div>
  );
}

function NovelDetail({ id }: { id: string }) {
  const [novel, setNovel] = useState<LibraryNovel | null | undefined>(undefined);
  const [chapters, setChapters] = useState<ChapterMeta[]>([]);

  const load = useCallback(async () => {
    const found = (await getNovel(id)) ?? null;
    setNovel(found);
    setChapters(found ? await listChapters(found) : []);
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);
  useLibraryChanges(load);

  if (novel === undefined) return <p className="muted">Loading…</p>;
  if (novel === null) {
    return (
      <div className="empty">
        <p>That novel isn't in your library.</p>
        <a href="#/">Back to the library</a>
      </div>
    );
  }

  const remove = async () => {
    if (!confirm(`Delete “${novel.title}” and all ${novel.chapterCount} saved chapters from this computer?`)) return;
    await deleteNovel(novel.id);
    await send({ type: "sync-sites" });
    location.hash = "#/";
  };

  return (
    <div className="stack">
      <p className="breadcrumb">
        <a href="#/">← Library</a>
      </p>
      <div>
        <h1>{novel.title}</h1>
        <p className="muted">
          {SOURCE_LABEL[novel.source]} · {novel.chapterCount} {novel.chapterCount === 1 ? "chapter" : "chapters"} ·{" "}
          {novel.wordCount.toLocaleString()} words
        </p>
      </div>

      <NovelSettings novel={novel} onSaved={load} />

      {novel.source === "web" && (
        <div className="row">
          <a className="button" href={`#/novel/${encodeURIComponent(novel.id)}/collect`}>
            Collect all chapters…
          </a>
          <span className="muted small">For stories published free by their authors.</span>
        </div>
      )}

      <section>
        <h2>Chapters</h2>
        {chapters.length === 0 ? (
          <p className="muted">
            No chapters yet.{novel.source === "web" ? " Open a chapter of this novel and it'll appear here." : ""}
          </p>
        ) : (
          <ol className="chapter-list">
            {chapters.map((c) => (
              <ChapterRow key={c.key} novel={novel} chapter={c} onDeleted={load} />
            ))}
          </ol>
        )}
      </section>

      <section className="danger-zone">
        <button type="button" className="button button--danger" onClick={remove}>
          Delete this novel from the library
        </button>
      </section>
    </div>
  );
}

function NovelSettings({ novel, onSaved }: { novel: LibraryNovel; onSaved: () => Promise<void> }) {
  const [title, setTitle] = useState(novel.title);
  const [prefix, setPrefix] = useState(novel.sitePrefix ?? "");
  const [order, setOrder] = useState<ChapterOrder>(novel.order);
  const [status, setStatus] = useState<string | null>(null);
  const dirty = title !== novel.title || prefix !== (novel.sitePrefix ?? "") || order !== novel.order;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (novel.source === "web") {
      try {
        if (new URL(prefix).origin !== new URL(novel.sitePrefix!).origin) {
          setStatus("The chapter address must stay on the same site.");
          return;
        }
      } catch {
        setStatus("That isn't a web address.");
        return;
      }
    }
    await updateNovel(novel.id, { title: title.trim() || novel.title, order, ...(novel.source === "web" ? { sitePrefix: prefix } : {}) });
    setStatus("Saved.");
    await onSaved();
  };

  const toggle = async () => {
    await updateNovel(novel.id, { enabled: !novel.enabled });
    await send({ type: "sync-sites" });
    await onSaved();
  };

  return (
    <form className="card form" onSubmit={save}>
      <div className="form-grid">
        <label className="field">
          <span className="field__label">Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">Chapter order</span>
          <select value={order} onChange={(e) => setOrder(e.target.value as ChapterOrder)}>
            {novel.source === "web" ? (
              <>
                <option value="url">By address (chapter-2 before chapter-10)</option>
                <option value="saved">In the order I read them</option>
              </>
            ) : (
              <option value="file">As in the file</option>
            )}
          </select>
        </label>
      </div>
      {novel.source === "web" && (
        <label className="field">
          <span className="field__label">Chapters are at</span>
          <input value={prefix} onChange={(e) => setPrefix(e.target.value)} spellCheck={false} />
          <span className="field__hint">Pages whose address starts with this are saved as part of this novel.</span>
        </label>
      )}
      <div className="row">
        <button type="submit" className="button button--primary" disabled={!dirty}>
          Save settings
        </button>
        {novel.source === "web" && (
          <button type="button" className="button" onClick={toggle}>
            {novel.enabled ? "Pause saving" : "Resume saving"}
          </button>
        )}
        {status && (
          <span className="muted small" role="status">
            {status}
          </span>
        )}
      </div>
    </form>
  );
}

function ChapterRow({
  novel,
  chapter,
  onDeleted,
}: {
  novel: LibraryNovel;
  chapter: ChapterMeta;
  onDeleted: () => Promise<void>;
}) {
  const [text, setText] = useState<string | null>(null);

  const togglePreview = async () => {
    setText(text === null ? ((await getChapterText(novel.id, chapter.key)) ?? "") : null);
  };
  const remove = async () => {
    if (!confirm(`Delete “${chapter.title}” from the library?`)) return;
    await deleteChapter(novel.id, chapter.key);
    await onDeleted();
  };

  return (
    <li className="chapter-row">
      <div className="chapter-row__main">
        <span className="chapter-row__title">
          {chapter.url ? (
            <a href={chapter.url} target="_blank" rel="noreferrer">
              {chapter.title}
            </a>
          ) : (
            chapter.title
          )}
        </span>
        <span className="muted small">
          {chapter.words.toLocaleString()} words · saved {formatDate(chapter.savedAt)}
        </span>
        <span className="chapter-row__actions">
          <button type="button" className="button button--small" onClick={togglePreview} aria-expanded={text !== null}>
            {text === null ? "Preview" : "Hide"}
          </button>
          <button type="button" className="button button--small" onClick={remove}>
            Delete
          </button>
        </span>
      </div>
      {text !== null && <div className="chapter-text">{text}</div>}
    </li>
  );
}
