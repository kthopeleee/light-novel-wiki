// @vitest-environment node
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { ImportError } from "../lib/import/book";
import { pdfToBook, type PdfDoc } from "../lib/import/pdf";
import { paragraph } from "./fixture-pages.mjs";
import { makePdf, pdfPageLines, wrap } from "./make-books.mjs";

GlobalWorkerOptions.workerSrc = pathToFileURL(
  createRequire(import.meta.url).resolve("pdfjs-dist/legacy/build/pdf.worker.mjs"),
).href;

// pdf.js takes over the bytes it's given, so each load gets its own copy.
const load = async (bytes: Uint8Array) =>
  (await getDocument({ data: bytes.slice(), verbosity: 0 }).promise) as unknown as PdfDoc;

/** The first few words of a paragraph, which always land on one line of the page. */
const opening = (n: number, i: number) => paragraph(n, i).split(" ").slice(0, 6).join(" ");

describe("pdfToBook", () => {
  it("splits by bookmarks, and reads the title and author", async () => {
    const pdf = makePdf({
      title: "The Harbor Ledger",
      author: "Sample Author",
      pages: [["The Harbor Ledger", "A made-up book for tests"], pdfPageLines(1), pdfPageLines(1, 4), pdfPageLines(2), pdfPageLines(3)],
      outline: [
        { title: "Chapter One", page: 1 },
        { title: "Chapter Two", page: 3 },
        { title: "Chapter Three", page: 4 },
      ],
    });
    const book = await pdfToBook(await load(pdf), "ledger.pdf");
    expect(book.title).toBe("The Harbor Ledger");
    expect(book.author).toBe("Sample Author");
    expect(book.chapters.map((c) => c.title)).toEqual(["Chapter One", "Chapter Two", "Chapter Three"]);
    expect(book.chapters[0]!.text).toContain(opening(1, 0));
    expect(book.chapters[0]!.text).toContain(opening(1, 4)); // runs on to its second page
    expect(book.chapters[1]!.text).toContain(opening(2, 0));
    expect(book.chapters[1]!.text).not.toContain(opening(3, 0));
  });

  it("splits by 'Chapter' headings when there are no bookmarks, ignoring a contents page", async () => {
    const pdf = makePdf({
      pages: [
        ["Contents", "Chapter 1: Crossing 1", "Chapter 2: Crossing 2"],
        ["Chapter 1: Crossing 1", ...pdfPageLines(1)],
        ["Chapter 2: Crossing 2", ...pdfPageLines(2)],
      ],
    });
    const book = await pdfToBook(await load(pdf), "ledger.pdf");
    expect(book.title).toBe("ledger"); // no metadata: falls back to the file name
    expect(book.chapters.map((c) => c.title)).toEqual(["Chapter 1: Crossing 1", "Chapter 2: Crossing 2"]);
    expect(book.chapters[1]!.text).toContain(opening(2, 0));
  });

  it("falls back to groups of ten pages", async () => {
    const pages = Array.from({ length: 12 }, (_, i) => wrap(paragraph(i, 0)));
    const book = await pdfToBook(await load(makePdf({ pages })), "plain.pdf");
    expect(book.chapters.map((c) => c.title)).toEqual(["Pages 1–10", "Pages 11–12"]);
  });

  it("explains that scanned PDFs have no text", async () => {
    const scanned = makePdf({ pages: [[], [], []] });
    await expect(pdfToBook(await load(scanned), "scan.pdf")).rejects.toThrow(ImportError);
    await expect(pdfToBook(await load(scanned), "scan.pdf")).rejects.toThrow(/scanned/);
  });
});
