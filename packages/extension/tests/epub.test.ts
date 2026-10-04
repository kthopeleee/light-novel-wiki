import { describe, expect, it } from "vitest";
import { ImportError } from "../lib/import/book";
import { parseEpub } from "../lib/import/epub";
import { paragraph } from "./fixture-pages.mjs";
import { CHAPTER_NAMES, makeEpub } from "./make-books.mjs";

describe("parseEpub", () => {
  it.each([3, 2] as const)("reads an EPUB %i: chapters in order, named from its table of contents", (version) => {
    const book = parseEpub(makeEpub({ version }));
    expect(book.title).toBe("The Harbor Ledger");
    expect(book.author).toBe("Sample Author");
    expect(book.chapters.map((c) => c.title)).toEqual(CHAPTER_NAMES);
    expect(book.chapters[0]!.text).toContain(paragraph(1, 0));
    expect(book.chapters[2]!.text).toContain(paragraph(3, 5));
  });

  it("skips the cover, copyright page, and table of contents", () => {
    const text = parseEpub(makeEpub()).chapters.map((c) => c.text).join(" ");
    expect(text).not.toContain("Copyright notice");
    expect(text).not.toContain("Contents");
  });

  it("names chapters from their headings when there's no table of contents", () => {
    expect(parseEpub(makeEpub({ labels: false })).chapters.map((c) => c.title)).toEqual([
      "Chapter 1",
      "Chapter 2",
      "Chapter 3",
    ]);
  });

  it("refuses DRM-protected EPUBs with a clear reason", () => {
    expect(() => parseEpub(makeEpub({ drm: true }))).toThrow(ImportError);
    expect(() => parseEpub(makeEpub({ drm: true }))).toThrow(/DRM/);
  });

  it("still reads EPUBs whose only 'encryption' is font obfuscation", () => {
    expect(parseEpub(makeEpub({ fontObfuscationOnly: true })).chapters).toHaveLength(3);
  });

  it("explains when the file isn't an EPUB at all", () => {
    expect(() => parseEpub(new TextEncoder().encode("not a zip file"))).toThrow(/couldn't be unzipped/);
  });
});
