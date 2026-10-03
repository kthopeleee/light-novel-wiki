// The reader's saved novels and chapters, kept in IndexedDB inside the extension.
// Nothing here leaves the computer.
import { uniqueSlug } from "@lnw/schema/slug";
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { countWords } from "./extract";
import { bestMatch, naturalCompare, normalizeUrl } from "./urls";

export type NovelSource = "web" | "epub" | "pdf";
export type ChapterOrder = "url" | "saved" | "file";

export type LibraryNovel = {
  id: string;
  title: string;
  source: NovelSource;
  /** Web novels: every chapter's address starts with this. */
  sitePrefix?: string;
  /** Web novels: whether pages are saved as you read. */
  enabled: boolean;
  order: ChapterOrder;
  chapterCount: number;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ChapterMeta = {
  novelId: string;
  /** Normalized URL for web chapters; "file:<n>" for chapters from an ebook. */
  key: string;
  url?: string;
  title: string;
  words: number;
  /** Position in an imported file. */
  position?: number;
  firstSavedAt: string;
  savedAt: string;
};

type ChapterText = { novelId: string; key: string; text: string };

interface LibrarySchema extends DBSchema {
  novels: { key: string; value: LibraryNovel };
  chapters: { key: [string, string]; value: ChapterMeta; indexes: { byNovel: string } };
  texts: { key: [string, string]; value: ChapterText; indexes: { byNovel: string } };
}

let opening: Promise<IDBPDatabase<LibrarySchema>> | undefined;

function db() {
  opening ??= openDB<LibrarySchema>("lnw-library", 1, {
    upgrade(database) {
      database.createObjectStore("novels", { keyPath: "id" });
      // Chapter lists stay small to load; the full text lives in its own store.
      database.createObjectStore("chapters", { keyPath: ["novelId", "key"] }).createIndex("byNovel", "novelId");
      database.createObjectStore("texts", { keyPath: ["novelId", "key"] }).createIndex("byNovel", "novelId");
    },
  });
  return opening;
}

const now = () => new Date().toISOString();

export async function listNovels(): Promise<LibraryNovel[]> {
  const novels = await (await db()).getAll("novels");
  return novels.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getNovel(id: string): Promise<LibraryNovel | undefined> {
  return (await db()).get("novels", id);
}

export async function findNovelForUrl(url: string): Promise<LibraryNovel | undefined> {
  const web = (await listNovels()).filter((n) => n.source === "web");
  return bestMatch(url, web);
}

export async function createNovel(input: {
  title: string;
  source: NovelSource;
  sitePrefix?: string;
}): Promise<LibraryNovel> {
  const database = await db();
  const ids = await database.getAllKeys("novels");
  const stamp = now();
  const novel: LibraryNovel = {
    id: uniqueSlug(input.title, ids),
    title: input.title.trim() || "Untitled novel",
    source: input.source,
    sitePrefix: input.sitePrefix,
    enabled: input.source === "web",
    order: input.source === "web" ? "url" : "file",
    chapterCount: 0,
    wordCount: 0,
    createdAt: stamp,
    updatedAt: stamp,
  };
  await database.put("novels", novel);
  return novel;
}

export async function updateNovel(
  id: string,
  changes: Partial<Pick<LibraryNovel, "title" | "sitePrefix" | "enabled" | "order">>,
): Promise<LibraryNovel> {
  const database = await db();
  const novel = await database.get("novels", id);
  if (!novel) throw new Error("That novel isn't in the library anymore.");
  const next = { ...novel, ...changes, updatedAt: now() };
  await database.put("novels", next);
  return next;
}

export async function deleteNovel(id: string): Promise<void> {
  const database = await db();
  const tx = database.transaction(["novels", "chapters", "texts"], "readwrite");
  for (const store of ["chapters", "texts"] as const) {
    for (const key of await tx.objectStore(store).index("byNovel").getAllKeys(id)) {
      await tx.objectStore(store).delete(key);
    }
  }
  await tx.objectStore("novels").delete(id);
  await tx.done;
}

export type SaveResult = { isNew: boolean; changed: boolean; chapterCount: number };

/** Saves or updates one chapter and keeps the novel's totals in step. */
export async function saveChapter(
  novelId: string,
  chapter: { key: string; url?: string; title: string; text: string; position?: number },
): Promise<SaveResult> {
  const database = await db();
  const tx = database.transaction(["novels", "chapters", "texts"], "readwrite");
  const novel = await tx.objectStore("novels").get(novelId);
  if (!novel) throw new Error("That novel isn't in the library anymore.");
  const id: [string, string] = [novelId, chapter.key];
  const existing = await tx.objectStore("chapters").get(id);
  const existingText = await tx.objectStore("texts").get(id);

  if (existing && existingText?.text === chapter.text && existing.title === chapter.title) {
    await tx.done;
    return { isNew: false, changed: false, chapterCount: novel.chapterCount };
  }

  const stamp = now();
  const words = countWords(chapter.text);
  await tx.objectStore("chapters").put({
    novelId,
    key: chapter.key,
    url: chapter.url,
    title: chapter.title,
    words,
    position: chapter.position,
    firstSavedAt: existing?.firstSavedAt ?? stamp,
    savedAt: stamp,
  });
  await tx.objectStore("texts").put({ novelId, key: chapter.key, text: chapter.text });
  const updated: LibraryNovel = {
    ...novel,
    chapterCount: novel.chapterCount + (existing ? 0 : 1),
    wordCount: novel.wordCount + words - (existing?.words ?? 0),
    updatedAt: stamp,
  };
  await tx.objectStore("novels").put(updated);
  await tx.done;
  return { isNew: !existing, changed: true, chapterCount: updated.chapterCount };
}

export async function saveWebChapter(novelId: string, url: string, title: string, text: string) {
  const key = normalizeUrl(url);
  return saveChapter(novelId, { key, url: key, title, text });
}

export async function deleteChapter(novelId: string, key: string): Promise<void> {
  const database = await db();
  const tx = database.transaction(["novels", "chapters", "texts"], "readwrite");
  const existing = await tx.objectStore("chapters").get([novelId, key]);
  const novel = await tx.objectStore("novels").get(novelId);
  if (existing && novel) {
    await tx.objectStore("chapters").delete([novelId, key]);
    await tx.objectStore("texts").delete([novelId, key]);
    await tx.objectStore("novels").put({
      ...novel,
      chapterCount: Math.max(0, novel.chapterCount - 1),
      wordCount: Math.max(0, novel.wordCount - existing.words),
      updatedAt: now(),
    });
  }
  await tx.done;
}

/** Chapters in reading order: by address, by when they were first saved, or by position in the file. */
export async function listChapters(novel: LibraryNovel): Promise<ChapterMeta[]> {
  const chapters = await (await db()).getAllFromIndex("chapters", "byNovel", novel.id);
  return sortChapters(chapters, novel.order);
}

export function sortChapters(chapters: ChapterMeta[], order: ChapterOrder): ChapterMeta[] {
  const sorted = [...chapters];
  if (order === "saved") sorted.sort((a, b) => a.firstSavedAt.localeCompare(b.firstSavedAt));
  else if (order === "file") sorted.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  else sorted.sort((a, b) => naturalCompare(a.key, b.key));
  return sorted;
}

export async function getChapterText(novelId: string, key: string): Promise<string | undefined> {
  return (await (await db()).get("texts", [novelId, key]))?.text;
}

export async function hasChapter(novelId: string, url: string): Promise<boolean> {
  return !!(await (await db()).getKey("chapters", [novelId, normalizeUrl(url)]));
}
