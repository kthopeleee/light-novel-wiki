import { describe, expect, it } from "vitest";
import { bestMatch, matchesPrefix, naturalCompare, normalizeUrl, proposePrefix, sitePattern } from "../lib/urls";

describe("normalizeUrl", () => {
  it("drops fragments, tracking parameters, and trailing slashes", () => {
    expect(normalizeUrl("https://ex.com/novel/ch-1/?utm_source=x&page=2#top")).toBe("https://ex.com/novel/ch-1?page=2");
    expect(normalizeUrl("https://ex.com/")).toBe("https://ex.com/");
  });
});

describe("proposePrefix", () => {
  it.each([
    ["https://novels-reader.pages.dev/cote/read/v1/7", "https://novels-reader.pages.dev/cote/"],
    ["https://www.royalroad.com/fiction/12345/some-story/chapter/678/a-title", "https://www.royalroad.com/fiction/12345/"],
    ["https://www.scribblehub.com/read/123456-a-story/chapter/789/", "https://www.scribblehub.com/read/123456-a-story/"],
    ["https://example.com/harbor-ledger/chapter-3", "https://example.com/harbor-ledger/"],
    ["https://example.com/chapter-5", "https://example.com/"],
    ["https://example.com/?chapter=5", "https://example.com/"],
    ["http://localhost:4180/harbor-ledger/chapter-1", "http://localhost:4180/harbor-ledger/"],
  ])("%s → %s", (url, prefix) => {
    expect(proposePrefix(url)).toBe(prefix);
  });
});

describe("matching pages to novels", () => {
  const novels = [
    { id: "site", sitePrefix: "https://ex.com/" },
    { id: "ledger", sitePrefix: "https://ex.com/harbor-ledger/" },
  ];

  it("matches chapters and the novel's own index page", () => {
    expect(matchesPrefix("https://ex.com/harbor-ledger/chapter-2#c", "https://ex.com/harbor-ledger/")).toBe(true);
    expect(matchesPrefix("https://ex.com/harbor-ledger", "https://ex.com/harbor-ledger/")).toBe(true);
    expect(matchesPrefix("https://ex.com/harbor-ledgers/x", "https://ex.com/harbor-ledger/")).toBe(false);
  });

  it("prefers the most specific prefix", () => {
    expect(bestMatch("https://ex.com/harbor-ledger/chapter-2", novels)?.id).toBe("ledger");
    expect(bestMatch("https://ex.com/other/chapter-2", novels)?.id).toBe("site");
    expect(bestMatch("https://elsewhere.com/x", novels)).toBeUndefined();
  });
});

describe("sitePattern", () => {
  it("leaves out the port, which Firefox doesn't allow", () => {
    expect(sitePattern("http://localhost:4180/harbor-ledger/")).toBe("http://localhost/*");
    expect(sitePattern("https://www.royalroad.com/fiction/1/")).toBe("https://www.royalroad.com/*");
  });
});

describe("naturalCompare", () => {
  it("orders chapter numbers like a person would", () => {
    const urls = ["/read/v2/1", "/read/v1/10", "/read/v1/2", "/read/v4.5/1", "/read/v4/9", "/read/v5/1"];
    expect([...urls].sort(naturalCompare)).toEqual([
      "/read/v1/2",
      "/read/v1/10",
      "/read/v2/1",
      "/read/v4/9",
      "/read/v4.5/1",
      "/read/v5/1",
    ]);
  });
});
