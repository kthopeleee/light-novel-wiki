import {
  parseNovelWiki,
  parseWikiIndex,
  SCHEMA_VERSION,
  type NovelWiki,
  type WikiIndex,
} from "@lnw/schema";

/**
 * Where the viewer reads wikis from. The public site reads its own ./data folder;
 * a signed-in editor (and later the extension's private viewer) reads GitHub directly.
 */
export interface WikiDataSource {
  listNovels(): Promise<WikiIndex>;
  getNovel(id: string): Promise<NovelWiki>;
  /** Only present when this source can save. Resolves to the wiki as saved. */
  saveNovel?(wiki: NovelWiki, message: string): Promise<NovelWiki>;
}

export const emptyIndex = (): WikiIndex => ({ schemaVersion: SCHEMA_VERSION, novels: [] });

export function parseIndexText(text: string, file: string): WikiIndex {
  const result = parseWikiIndex(parseJson(text, file));
  if (!result.ok) throw new Error(`${file} doesn't match the wiki format:\n${result.error}`);
  return result.data;
}

export function parseNovelText(text: string, file: string): NovelWiki {
  const result = parseNovelWiki(parseJson(text, file));
  if (!result.ok) throw new Error(`${file} doesn't match the wiki format:\n${result.error}`);
  return result.data;
}

function parseJson(text: string, file: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${file} isn't valid JSON.`);
  }
}

export class HttpDataSource implements WikiDataSource {
  private readonly cache = new Map<string, Promise<unknown>>();

  constructor(private readonly baseUrl: string) {}

  listNovels(): Promise<WikiIndex> {
    return this.cached("index.json", async () => {
      const text = await this.fetchText("index.json");
      // A brand-new repo has no index yet; show an empty home page instead of an error.
      return text === undefined ? emptyIndex() : parseIndexText(text, "index.json");
    });
  }

  getNovel(id: string): Promise<NovelWiki> {
    const file = `novels/${encodeURIComponent(id)}.json`;
    return this.cached(file, async () => {
      const text = await this.fetchText(file);
      if (text === undefined) throw new Error(`There's no wiki called "${id}".`);
      return parseNovelText(text, file);
    });
  }

  private cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    let pending = this.cache.get(key) as Promise<T> | undefined;
    if (!pending) {
      pending = load();
      this.cache.set(key, pending);
      pending.catch(() => this.cache.delete(key));
    }
    return pending;
  }

  /** Resolves to undefined when the file doesn't exist. */
  private async fetchText(file: string): Promise<string | undefined> {
    const res = await fetch(`${this.baseUrl}/${file}`, { cache: "no-cache" });
    if (res.status === 404) return undefined;
    if (!res.ok) throw new Error(`Loading ${file} failed (HTTP ${res.status}).`);
    return res.text();
  }
}
