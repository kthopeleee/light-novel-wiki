// Auto-collect: downloads every chapter of a novel from a site that publishes them
// freely, politely (one page at a time, with a pause between), into the library.
import { extractChapter } from "./extract";
import { naturalCompare, normalizeUrl } from "./urls";

export type LinkInfo = { href: string; text: string };

/** Fewer chapter links than this and the page is a chapter, not a chapter list. */
export const MIN_LIST_LINKS = 5;

const NAV_TEXT =
  /^(home|index|table of contents|contents|toc|next|previous|prev|first|last|back|log ?in|sign ?in|sign ?up|register|comments?|share|report|bookmark|follow|favou?rite|rate|reviews?|donate|patreon|discord|settings)\b/i;
const CHAPTER_HINT = /chapter|episode|prologue|epilogue|interlude|side ?story|extra|afterword|\d/i;

/** Picks the chapter links out of a page's links, in reading order (oldest first). */
export function findChapterLinks(links: LinkInfo[], prefix: string, pageUrl: string): string[] {
  const page = normalizeUrl(pageUrl);
  const prefixPath = new URL(prefix).pathname;
  const seen = new Set<string>();
  const found: string[] = [];
  for (const link of links) {
    let url: string;
    try {
      url = normalizeUrl(new URL(link.href, pageUrl).toString());
    } catch {
      continue;
    }
    if (!url.startsWith(prefix) || url === page || `${url}/` === prefix || seen.has(url)) continue;
    const text = link.text.replace(/\s+/g, " ").trim();
    if (NAV_TEXT.test(text)) continue;
    const rest = new URL(url).pathname.slice(prefixPath.length);
    if (!CHAPTER_HINT.test(rest) && !CHAPTER_HINT.test(text)) continue;
    seen.add(url);
    found.push(url);
  }
  // Many sites list the newest chapter first.
  if (found.length > 1 && naturalCompare(found[0]!, found.at(-1)!) > 0) found.reverse();
  return found;
}

/** The "Next chapter" link on a chapter page, if it stays within the novel. */
export function findNextLink(doc: Document, pageUrl: string, prefix: string): string | null {
  const page = normalizeUrl(pageUrl);
  const inNovel = (href: string | null) => {
    if (!href) return null;
    try {
      const url = normalizeUrl(new URL(href, pageUrl).toString());
      return url.startsWith(prefix) && url !== page && `${url}/` !== prefix ? url : null;
    } catch {
      return null;
    }
  };
  for (const el of doc.querySelectorAll<HTMLAnchorElement | HTMLLinkElement>('a[rel~="next"], link[rel~="next"]')) {
    const url = inNovel(el.getAttribute("href"));
    if (url) return url;
  }
  for (const a of doc.querySelectorAll("a[href]")) {
    const text = (a.textContent ?? "").replace(/\s+/g, " ").trim();
    const label = `${text} ${a.getAttribute("aria-label") ?? ""} ${a.getAttribute("title") ?? ""}`;
    if (!/\bnext\b|[›»→]\s*$/i.test(label) || /\bnext (page|story|novel)\b/i.test(label)) continue;
    const url = inNovel(a.getAttribute("href"));
    if (url) return url;
  }
  return null;
}

export type CollectPlan =
  | { novelId: string; prefix: string; mode: "list"; urls: string[] }
  | { novelId: string; prefix: string; mode: "next"; startUrl: string };

export type CollectStatus = "running" | "paused" | "finished" | "stopped" | "failed";

export type CollectProgress = {
  status: CollectStatus;
  /** Pages looked at so far. */
  done: number;
  /** Known only when collecting from a chapter list. */
  total?: number;
  saved: number;
  skipped: number;
  failed: number;
  current?: string;
  message?: string;
};

export type FetchResult = { ok: true; html: string } | { ok: false; status: number };

export type CollectDeps = {
  fetchPage: (url: string) => Promise<FetchResult>;
  parse: (html: string, url: string) => Document;
  save: (url: string, title: string, text: string) => Promise<void>;
  alreadySaved: (url: string) => boolean;
  sleep: (ms: number) => Promise<void>;
  onProgress: (progress: CollectProgress) => void;
  /** Checked between pages; resolves when it's fine to continue, or false to stop. */
  gate: () => Promise<boolean>;
  delayMs: number;
};

/** Pages in a row with no chapter text, before deciding the site needs JavaScript. */
const NO_TEXT_LIMIT = 3;
const MAX_PAGES = 5000;
const THROTTLE_STATUS = new Set([429, 503]);

export async function runCollector(plan: CollectPlan, deps: CollectDeps): Promise<CollectProgress> {
  const progress: CollectProgress = { status: "running", done: 0, saved: 0, skipped: 0, failed: 0 };
  if (plan.mode === "list") progress.total = plan.urls.length;
  const report = () => deps.onProgress({ ...progress });
  let noTextInARow = 0;
  let fetchedAny = false;
  const visited = new Set<string>();
  const queue = plan.mode === "list" ? [...plan.urls] : [plan.startUrl];

  const finish = (status: CollectStatus, message?: string) => {
    progress.status = status;
    progress.message = message;
    progress.current = undefined;
    report();
    return { ...progress };
  };

  while (queue.length > 0 && visited.size < MAX_PAGES) {
    const url = queue.shift()!;
    if (visited.has(url)) break; // a "Next" link that loops back
    visited.add(url);
    progress.current = url;
    report();

    // In list mode a saved chapter needs no download. Following "Next" links still needs
    // the page, to find where to go after it.
    if (plan.mode === "list" && deps.alreadySaved(url)) {
      progress.done++;
      progress.skipped++;
      report();
      continue;
    }

    if (!(await deps.gate())) return finish("stopped", "Stopped. Chapters collected so far are saved.");
    if (fetchedAny) await deps.sleep(deps.delayMs);
    fetchedAny = true;

    const result = await fetchWithBackoff(url, deps);
    if (!result.ok) {
      if (THROTTLE_STATUS.has(result.status)) {
        return finish("failed", "The site asked us to slow down. Try again later; chapters already collected are saved.");
      }
      if (plan.mode === "next" && result.status === 404) break; // ran past the last chapter
      progress.done++;
      progress.failed++;
      report();
      continue;
    }

    const doc = deps.parse(result.html, url);
    const chapter = extractChapter(doc);
    if (plan.mode === "next") {
      const next = findNextLink(doc, url, plan.prefix);
      if (next) queue.push(next);
    }
    progress.done++;
    if (!chapter) {
      progress.failed++;
      noTextInARow++;
      report();
      if (noTextInARow >= NO_TEXT_LIMIT && progress.saved === 0 && progress.skipped === 0) {
        return finish("failed", NEEDS_JAVASCRIPT);
      }
      continue;
    }
    noTextInARow = 0;
    if (plan.mode === "next" && deps.alreadySaved(url)) {
      progress.skipped++;
    } else {
      await deps.save(url, chapter.title, chapter.text);
      progress.saved++;
    }
    report();
  }

  if (progress.failed > 0 && progress.saved === 0 && progress.skipped === 0) return finish("failed", NEEDS_JAVASCRIPT);
  return finish("finished");
}

export const NEEDS_JAVASCRIPT =
  "Couldn't find chapter text in the downloaded pages. This site probably loads its chapters with JavaScript, which auto-collect can't read. Use save-as-you-read on this site instead.";

/** One retry after a pause if the site says it's busy. */
async function fetchWithBackoff(url: string, deps: CollectDeps): Promise<FetchResult> {
  const first = await deps.fetchPage(url);
  if (first.ok || !THROTTLE_STATUS.has(first.status)) return first;
  await deps.sleep(Math.max(deps.delayMs * 20, 30_000));
  return deps.fetchPage(url);
}
