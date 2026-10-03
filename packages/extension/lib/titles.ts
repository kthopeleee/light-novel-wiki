const SEPARATORS = /\s+[|\-–—·:»]\s+|\s+::\s+/;
const CHAPTER_WORDS = /\b(chapter|ch\.?|episode|ep\.?|part|vol(ume)?\.?|prologue|epilogue|interlude|side story)\b|^\d+$/i;
const SITE_WORDS = /\b(read|online|free|novels?|light novels?|web ?novels?|translations?)\b/i;

/**
 * Guesses the novel's name from a chapter page's title, e.g.
 * "Chapter 12: Rain - The Lantern Archive | SomeSite" → "The Lantern Archive".
 * Falls back to the novel's part of the address ("…/lantern-archive/" → "Lantern Archive").
 */
export function guessNovelTitle(pageTitle: string, prefix: string, hostname: string): string {
  const site = hostname.replace(/^www\./, "").split(".")[0]?.toLowerCase() ?? "";
  const candidates = pageTitle
    .split(SEPARATORS)
    .map((s) => s.trim())
    .filter((s) => s.length > 1)
    .filter((s) => !CHAPTER_WORDS.test(s))
    .filter((s) => !(site && s.toLowerCase().replace(/[^a-z0-9]/g, "").includes(site.replace(/[^a-z0-9]/g, ""))))
    .filter((s) => !SITE_WORDS.test(s));
  if (candidates.length > 0) return candidates.sort((a, b) => b.length - a.length)[0]!;
  return titleFromPrefix(prefix) || pageTitle.trim() || "Untitled novel";
}

function titleFromPrefix(prefix: string): string {
  const last = new URL(prefix).pathname.split("/").filter(Boolean).at(-1) ?? "";
  return decodeURIComponent(last)
    .replace(/^\d+-/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}
