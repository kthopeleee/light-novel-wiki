import { isProbablyReaderable, Readability } from "@mozilla/readability";

/** Shorter than this and it's probably a teaser, a table of contents, or a login wall. */
export const MIN_CHAPTER_CHARS = 1200;
const MAX_LINK_DENSITY = 0.35;
const MIN_PARAGRAPHS = 4;

export type Extracted = { title: string; text: string; words: number };

/**
 * Pulls the chapter text out of a page. Returns null when the page doesn't look like a
 * chapter. `force` relaxes the checks for when the reader asks to save a page by hand.
 */
export function extractChapter(doc: Document, { force = false } = {}): Extracted | null {
  if (!force && !isProbablyReaderable(doc, { minContentLength: 140, minScore: 20 })) return null;
  const article = new Readability(doc.cloneNode(true) as Document, { charThreshold: force ? 100 : 500 }).parse();
  if (!article?.content) return null;
  const { text, linkDensity } = htmlToText(article.content);
  if (!text) return null;
  if (!force) {
    if (text.length < MIN_CHAPTER_CHARS) return null;
    if (linkDensity > MAX_LINK_DENSITY) return null;
    if (text.split("\n\n").length < MIN_PARAGRAPHS) return null;
  }
  return { title: cleanTitle(article.title || doc.title), text, words: countWords(text) };
}

const BLOCKS = "p,div,section,article,header,footer,h1,h2,h3,h4,h5,h6,li,blockquote,pre,hr,tr,figure,figcaption";

/** Plain text with a blank line between paragraphs, plus how much of it was link text. */
export function htmlToText(html: string): { text: string; linkDensity: number } {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style,noscript,template").forEach((el) => el.remove());
  const total = (doc.body.textContent ?? "").replace(/\s+/g, "").length;
  let linked = 0;
  doc.querySelectorAll("a").forEach((a) => {
    linked += (a.textContent ?? "").replace(/\s+/g, "").length;
  });
  doc.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  doc.querySelectorAll(BLOCKS).forEach((el) => el.append("\n\n"));
  return { text: normalizeText(doc.body.textContent ?? ""), linkDensity: total ? linked / total : 0 };
}

export function normalizeText(text: string): string {
  return text
    .replace(/ /g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t\r\f\v]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const CJK = /[぀-ヿ㐀-鿿가-힯]/g;

/** Words for spaced languages; each character counts as a word in Japanese, Chinese, and Korean. */
export function countWords(text: string): number {
  const cjk = text.match(CJK)?.length ?? 0;
  const spaced = text.replace(CJK, " ").split(/\s+/).filter(Boolean).length;
  return cjk + spaced;
}

export function cleanTitle(title: string): string {
  return title.replace(/\s+/g, " ").trim().slice(0, 200) || "Untitled chapter";
}

/** Small fast hash, to tell whether a page's text changed since it was last sent. */
export function textHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}
