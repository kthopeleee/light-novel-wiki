import { describe, expect, it } from "vitest";
import { sortChapters, type ChapterMeta } from "../lib/library";
import { guessNovelTitle } from "../lib/titles";

describe("guessNovelTitle", () => {
  it.each([
    ["Chapter 12: Rain - The Harbor Ledger | FixtureReads", "https://fixturereads.com/harbor-ledger/", "fixturereads.com", "The Harbor Ledger"],
    ["The Harbor Ledger - Chapter 3 - RoyalRoad", "https://www.royalroad.com/fiction/1/", "www.royalroad.com", "The Harbor Ledger"],
    ["Read Light novels for free", "https://novels-reader.pages.dev/cote/", "novels-reader.pages.dev", "Cote"],
    ["Ch. 5", "https://ex.com/12345-night-market-notes/", "ex.com", "Night Market Notes"],
  ])("%s → %s", (pageTitle, prefix, host, expected) => {
    expect(guessNovelTitle(pageTitle, prefix, host)).toBe(expected);
  });
});

describe("sortChapters", () => {
  const chapter = (key: string, firstSavedAt: string, position?: number): ChapterMeta => ({
    novelId: "n",
    key,
    title: key,
    words: 1,
    position,
    firstSavedAt,
    savedAt: firstSavedAt,
  });
  const chapters = [
    chapter("https://ex.com/n/chapter-10", "2026-01-01T00:00:01Z", 2),
    chapter("https://ex.com/n/chapter-2", "2026-01-01T00:00:03Z", 0),
    chapter("https://ex.com/n/chapter-9", "2026-01-01T00:00:02Z", 1),
  ];

  it("orders by address, by reading order, or by file position", () => {
    expect(sortChapters(chapters, "url").map((c) => c.key.split("-").pop())).toEqual(["2", "9", "10"]);
    expect(sortChapters(chapters, "saved").map((c) => c.key.split("-").pop())).toEqual(["10", "9", "2"]);
    expect(sortChapters(chapters, "file").map((c) => c.key.split("-").pop())).toEqual(["2", "9", "10"]);
  });
});
