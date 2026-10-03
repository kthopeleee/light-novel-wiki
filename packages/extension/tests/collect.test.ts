import { describe, expect, it, vi } from "vitest";
import {
  findChapterLinks,
  findNextLink,
  MIN_LIST_LINKS,
  NEEDS_JAVASCRIPT,
  runCollector,
  type CollectDeps,
  type CollectPlan,
  type FetchResult,
  type LinkInfo,
} from "../lib/collect";
import { chapterPage, spaShell, tocPage } from "./fixture-pages.mjs";

const SITE = "https://fixture.test";
const PREFIX = `${SITE}/harbor-ledger/`;
const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");
const linksOf = (html: string, pageUrl: string): LinkInfo[] =>
  [...parse(html).querySelectorAll("a[href]")].map((a) => ({
    href: new URL(a.getAttribute("href")!, pageUrl).toString(),
    text: a.textContent ?? "",
  }));
const chapterUrl = (n: number) => `${PREFIX}chapter-${n}`;

describe("findChapterLinks", () => {
  it("finds every chapter on a table of contents, in order, and nothing else", () => {
    const links = findChapterLinks(linksOf(tocPage(40), PREFIX), PREFIX, PREFIX);
    expect(links).toHaveLength(40);
    expect(links[0]).toBe(chapterUrl(1));
    expect(links[39]).toBe(chapterUrl(40));
  });

  it("puts a newest-first list back in reading order", () => {
    const reversed = linksOf(tocPage(10), PREFIX).reverse();
    expect(findChapterLinks(reversed, PREFIX, PREFIX)[0]).toBe(chapterUrl(1));
  });

  it("finds too few links on a chapter page to treat it as a list", () => {
    const links = findChapterLinks(linksOf(chapterPage(5), chapterUrl(5)), PREFIX, chapterUrl(5));
    expect(links.length).toBeLessThan(MIN_LIST_LINKS);
  });
});

describe("findNextLink", () => {
  it("follows rel=next within the novel", () => {
    expect(findNextLink(parse(chapterPage(3)), chapterUrl(3), PREFIX)).toBe(chapterUrl(4));
  });

  it("falls back to a link that says Next", () => {
    const html = `<p><a href="/harbor-ledger/chapter-7">Next →</a> <a href="/other/1">Next story</a></p>`;
    expect(findNextLink(parse(html), chapterUrl(6), PREFIX)).toBe(chapterUrl(7));
  });

  it("ignores links that leave the novel", () => {
    expect(findNextLink(parse(`<a rel="next" href="https://elsewhere.test/x">Next</a>`), chapterUrl(1), PREFIX)).toBeNull();
  });
});

/** A fake site: chapters 1–40 exist, anything else is a 404. */
function fakeDeps(overrides: Partial<CollectDeps> = {}) {
  const saved = new Map<string, string>();
  const fetched: string[] = [];
  const deps: CollectDeps = {
    fetchPage: async (url): Promise<FetchResult> => {
      fetched.push(url);
      const n = Number(url.match(/chapter-(\d+)$/)?.[1]);
      return n >= 1 && n <= 40 ? { ok: true, html: chapterPage(n) } : { ok: false, status: 404 };
    },
    parse: (html) => parse(html),
    save: async (url, _title, text) => {
      saved.set(url, text);
    },
    alreadySaved: () => false,
    sleep: vi.fn(async () => {}),
    onProgress: () => {},
    gate: async () => true,
    delayMs: 1500,
    ...overrides,
  };
  return { deps, saved, fetched };
}

describe("runCollector", () => {
  it("collects a list, skipping chapters already saved without downloading them", async () => {
    const plan: CollectPlan = { novelId: "n", prefix: PREFIX, mode: "list", urls: [1, 2, 3, 4, 5].map(chapterUrl) };
    const { deps, saved, fetched } = fakeDeps({ alreadySaved: (url) => url === chapterUrl(2) });
    const result = await runCollector(plan, deps);
    expect(result).toMatchObject({ status: "finished", saved: 4, skipped: 1, failed: 0, total: 5, done: 5 });
    expect(fetched).not.toContain(chapterUrl(2));
    expect([...saved.keys()]).toEqual([1, 3, 4, 5].map(chapterUrl));
    expect(deps.sleep).toHaveBeenCalledTimes(3); // a pause between downloads, not before the first
  });

  it("follows Next links until the novel runs out", async () => {
    const plan: CollectPlan = { novelId: "n", prefix: PREFIX, mode: "next", startUrl: chapterUrl(37) };
    const { deps, saved } = fakeDeps();
    const result = await runCollector(plan, deps);
    expect(result.status).toBe("finished");
    expect([...saved.keys()]).toEqual([37, 38, 39, 40].map(chapterUrl));
  });

  it("explains when a site needs JavaScript", async () => {
    const plan: CollectPlan = { novelId: "n", prefix: PREFIX, mode: "list", urls: [1, 2, 3, 4, 5].map(chapterUrl) };
    const { deps, fetched } = fakeDeps({ fetchPage: async (url) => (fetched.push(url), { ok: true, html: spaShell() }) });
    const result = await runCollector(plan, deps);
    expect(result).toMatchObject({ status: "failed", message: NEEDS_JAVASCRIPT });
    expect(fetched).toHaveLength(3); // gives up after three empty pages
  });

  it("explains a JavaScript site in Next-link mode too", async () => {
    const plan: CollectPlan = { novelId: "n", prefix: PREFIX, mode: "next", startUrl: chapterUrl(1) };
    const { deps } = fakeDeps({ fetchPage: async () => ({ ok: true, html: spaShell() }) });
    expect(await runCollector(plan, deps)).toMatchObject({ status: "failed", message: NEEDS_JAVASCRIPT });
  });

  it("stops and explains when the site keeps asking to slow down", async () => {
    const plan: CollectPlan = { novelId: "n", prefix: PREFIX, mode: "list", urls: [1, 2].map(chapterUrl) };
    const { deps, saved } = fakeDeps({ fetchPage: async () => ({ ok: false, status: 429 }) });
    const result = await runCollector(plan, deps);
    expect(result.status).toBe("failed");
    expect(result.message).toContain("slow down");
    expect(saved.size).toBe(0);
    expect(deps.sleep).toHaveBeenCalledWith(30_000); // waited once before giving up
  });

  it("stops when asked, keeping what it has", async () => {
    let calls = 0;
    const plan: CollectPlan = { novelId: "n", prefix: PREFIX, mode: "list", urls: [1, 2, 3, 4].map(chapterUrl) };
    const { deps, saved } = fakeDeps({ gate: async () => ++calls <= 2 });
    const result = await runCollector(plan, deps);
    expect(result.status).toBe("stopped");
    expect(saved.size).toBe(2);
  });
});
