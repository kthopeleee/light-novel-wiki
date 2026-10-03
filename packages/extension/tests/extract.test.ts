import { describe, expect, it } from "vitest";
import { countWords, extractChapter, htmlToText, normalizeText, textHash } from "../lib/extract";
import { chapterPage, homePage, paragraph, tocPage } from "./fixture-pages.mjs";

const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");

describe("extractChapter", () => {
  it("keeps the chapter and drops navigation, sidebars, and comments", () => {
    const result = extractChapter(parse(chapterPage(3)));
    expect(result).not.toBeNull();
    expect(result!.text).toContain(paragraph(3, 0));
    expect(result!.text).toContain(paragraph(3, 13));
    expect(result!.text).not.toContain("Other story");
    expect(result!.text).not.toContain("Log in");
    expect(result!.text).not.toContain("Can't wait for the next one");
    expect(result!.title).toContain("Chapter 3");
  });

  it("separates paragraphs with a blank line", () => {
    const result = extractChapter(parse(chapterPage(1)))!;
    expect(result.text.split("\n\n").length).toBeGreaterThanOrEqual(14);
  });

  it("ignores a table of contents and a home page", () => {
    expect(extractChapter(parse(tocPage(60)))).toBeNull();
    expect(extractChapter(parse(homePage()))).toBeNull();
  });

  it("ignores teasers that are too short", () => {
    expect(extractChapter(parse(chapterPage(2, { paragraphs: 2 })))).toBeNull();
  });

  it("saves a short page anyway when asked by hand", () => {
    expect(extractChapter(parse(chapterPage(2, { paragraphs: 2 })), { force: true })?.text).toContain(paragraph(2, 1));
  });
});

describe("text helpers", () => {
  it("turns markup into readable text", () => {
    const { text, linkDensity } = htmlToText("<p>One&nbsp;line<br>and   more</p><p>Two <a href='#'>link</a></p>");
    expect(text).toBe("One line\nand more\n\nTwo link");
    expect(linkDensity).toBeGreaterThan(0);
  });

  it("collapses extra blank lines", () => {
    expect(normalizeText("a\n\n\n\n b ")).toBe("a\n\nb");
  });

  it("counts words, and characters in Japanese, Chinese, and Korean", () => {
    expect(countWords("The rain picked at the river.")).toBe(6);
    expect(countWords("雨が降る")).toBe(4);
  });

  it("hashes text consistently", () => {
    expect(textHash("abc")).toBe(textHash("abc"));
    expect(textHash("abc")).not.toBe(textHash("abd"));
  });
});
