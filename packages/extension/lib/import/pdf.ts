// Turns a PDF's text into chapters: by its bookmarks when it has them, otherwise by
// "Chapter …" headings, otherwise ten pages at a time. Scanned PDFs (pictures of pages,
// no text) can't be read without OCR.
import { normalizeText } from "../extract";
import { ImportError, MIN_SECTION_CHARS, type ImportedBook } from "./book";

/** The parts of a pdf.js document this needs. Kept small so tests can load PDFs in Node. */
export interface PdfDoc {
  numPages: number;
  getPage(n: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }> }>;
  getOutline(): Promise<OutlineItem[] | null>;
  getDestination(id: string): Promise<unknown[] | null>;
  getPageIndex(ref: unknown): Promise<number>;
  getMetadata(): Promise<{ info?: unknown }>;
}

type OutlineItem = { title: string; dest: string | unknown[] | null };
type TextItem = { str: string; hasEOL?: boolean; transform?: number[] };

const PAGES_PER_CHUNK = 10;
const HEADING = /^(chapter|prologue|epilogue|interlude|afterword|side story)\b[^.!?]{0,70}$/i;

export async function pdfToBook(doc: PdfDoc, fileName: string): Promise<ImportedBook> {
  const pages: string[][] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    pages.push(pageLines(content.items as TextItem[]));
  }
  if (pages.flat().join("").replace(/\s/g, "").length < MIN_SECTION_CHARS) {
    throw new ImportError(
      "This PDF has no text to read. It's probably scanned pictures of pages, which would need OCR first.",
    );
  }

  const info = ((await doc.getMetadata().catch(() => ({ info: undefined }))).info ?? {}) as { Title?: unknown; Author?: unknown };
  const title = (typeof info.Title === "string" && info.Title.trim()) || fileName.replace(/\.pdf$/i, "") || "Untitled book";
  const author = typeof info.Author === "string" && info.Author.trim() ? info.Author.trim() : undefined;

  const chapters = (await byOutline(doc, pages)) ?? byHeadings(pages) ?? byPageChunks(pages);
  return { title, author, chapters };
}

/** A page's text as lines, using pdf.js's end-of-line marks and changes in height. */
function pageLines(items: TextItem[]): string[] {
  const lines: string[] = [];
  let line = "";
  let lastY: number | undefined;
  for (const item of items) {
    if (typeof item.str !== "string") continue;
    const y = item.transform?.[5];
    if (line && lastY !== undefined && y !== undefined && Math.abs(y - lastY) > 1) {
      lines.push(line);
      line = "";
    }
    line += item.str;
    if (y !== undefined) lastY = y;
    if (item.hasEOL) {
      lines.push(line);
      line = "";
    }
  }
  if (line) lines.push(line);
  return lines.map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
}

const joinPages = (pages: string[][]) => normalizeText(pages.map((lines) => lines.join("\n")).join("\n\n"));

async function byOutline(doc: PdfDoc, pages: string[][]): Promise<ImportedBook["chapters"] | null> {
  const outline = await doc.getOutline().catch(() => null);
  if (!outline || outline.length < 2) return null;
  const starts: { title: string; page: number }[] = [];
  for (const item of outline) {
    try {
      const dest = typeof item.dest === "string" ? await doc.getDestination(item.dest) : item.dest;
      if (!dest?.[0]) continue;
      starts.push({ title: item.title.trim(), page: await doc.getPageIndex(dest[0]) });
    } catch {
      // A bookmark that points nowhere; skip it.
    }
  }
  starts.sort((a, b) => a.page - b.page);
  if (starts.length < 2) return null;
  const chapters = starts.map((start, i) => ({
    title: start.title || `Part ${i + 1}`,
    text: joinPages(pages.slice(start.page, starts[i + 1]?.page ?? pages.length)),
  }));
  return keepReal(chapters);
}

function byHeadings(pages: string[][]): ImportedBook["chapters"] | null {
  const chapters: { title: string; lines: string[] }[] = [];
  for (const lines of pages) {
    for (const line of lines) {
      if (HEADING.test(line)) chapters.push({ title: line, lines: [] });
      else chapters.at(-1)?.lines.push(line);
    }
    chapters.at(-1)?.lines.push("");
  }
  // Table-of-contents pages list headings with nothing under them; those get dropped here.
  const real = keepReal(chapters.map((c) => ({ title: c.title, text: normalizeText(c.lines.join("\n")) })));
  return real && real.length >= 2 ? real : null;
}

function byPageChunks(pages: string[][]): ImportedBook["chapters"] {
  const chapters: ImportedBook["chapters"] = [];
  for (let start = 0; start < pages.length; start += PAGES_PER_CHUNK) {
    const end = Math.min(start + PAGES_PER_CHUNK, pages.length);
    chapters.push({ title: `Pages ${start + 1}–${end}`, text: joinPages(pages.slice(start, end)) });
  }
  return chapters.filter((c) => c.text);
}

function keepReal(chapters: ImportedBook["chapters"]): ImportedBook["chapters"] | null {
  const real = chapters.filter((c) => c.text.length >= MIN_SECTION_CHARS);
  return real.length ? real : null;
}
