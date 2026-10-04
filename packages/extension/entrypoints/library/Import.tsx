import { useRef, useState } from "react";
import { countWords } from "../../lib/extract";
import { ImportError, type ImportedBook } from "../../lib/import/book";
import { parseEpub } from "../../lib/import/epub";
import { pdfToBook } from "../../lib/import/pdf";
import { createNovel, saveChapter } from "../../lib/library";

type Loaded = { book: ImportedBook; source: "epub" | "pdf" };

const PREVIEW_COUNT = 12;

/** Adds an EPUB or PDF the reader owns to the library, one chapter per section. */
export function ImportBook() {
  const input = useRef<HTMLInputElement>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const read = async (file: File) => {
    setError(null);
    setBusy("Reading the file…");
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const isPdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf";
      const book = isPdf
        ? await pdfToBook(await (await import("../../lib/import/load-pdf")).loadPdf(bytes), file.name)
        : parseEpub(bytes);
      setLoaded({ book, source: isPdf ? "pdf" : "epub" });
      setTitle(book.title);
    } catch (err) {
      setError(err instanceof ImportError ? err.message : `Couldn't read that file. ${String(err)}`);
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  };

  const add = async () => {
    if (!loaded) return;
    setBusy("Adding to your library…");
    try {
      const novel = await createNovel({ title: title.trim() || loaded.book.title, source: loaded.source });
      for (const [i, chapter] of loaded.book.chapters.entries()) {
        await saveChapter(novel.id, { key: `file:${i + 1}`, title: chapter.title, text: chapter.text, position: i });
      }
      location.hash = `#/novel/${encodeURIComponent(novel.id)}`;
    } catch (err) {
      setError(`Couldn't add it to the library. ${String(err)}`);
      setBusy(null);
    }
  };

  if (loaded) {
    const { book } = loaded;
    const words = book.chapters.reduce((sum, c) => sum + countWords(c.text), 0);
    return (
      <section className="card form">
        <h2>Import this book?</h2>
        <label className="field">
          <span className="field__label">Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <p className="small" data-testid="import-summary">
          {book.author ? `By ${book.author} · ` : ""}
          {book.chapters.length} {book.chapters.length === 1 ? "chapter" : "chapters"} · {words.toLocaleString()} words
        </p>
        <ol className="chapter-list small">
          {book.chapters.slice(0, PREVIEW_COUNT).map((c, i) => (
            <li key={i}>{c.title}</li>
          ))}
        </ol>
        {book.chapters.length > PREVIEW_COUNT && (
          <p className="muted small">…and {book.chapters.length - PREVIEW_COUNT} more.</p>
        )}
        {error && <p className="field__error">{error}</p>}
        <div className="row">
          <button type="button" className="button button--primary" onClick={() => void add()} disabled={!!busy}>
            {busy ?? "Add to library"}
          </button>
          <button type="button" className="button" onClick={() => setLoaded(null)} disabled={!!busy}>
            Cancel
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="card form">
      <div>
        <h2>Import an ebook</h2>
        <p className="muted small">
          An EPUB or PDF you own. EPUBs need to be DRM-free, and PDFs need real text (scanned pages can't be read).
          The file stays on this computer.
        </p>
      </div>
      <div className="row">
        <label className="button">
          <input
            ref={input}
            type="file"
            accept=".epub,.pdf,application/epub+zip,application/pdf"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void read(file);
            }}
          />
          Choose a file…
        </label>
        {busy && <span className="muted small">{busy}</span>}
      </div>
      {error && (
        <p className="callout" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
