import {
  parseNovelWiki,
  parseWikiIndex,
  SCHEMA_VERSION,
  type NovelWiki,
  type WikiIndex,
} from "@lnw/schema";

/**
 * Where the viewer reads wikis from. The public site reads its own ./data folder;
 * the extension's private viewer will read a private GitHub repo instead.
 */
export interface WikiDataSource {
  listNovels(): Promise<WikiIndex>;
  getNovel(id: string): Promise<NovelWiki>;
}

export class HttpDataSource implements WikiDataSource {
  private readonly cache = new Map<string, Promise<unknown>>();

  constructor(private readonly baseUrl: string) {}

  listNovels(): Promise<WikiIndex> {
    return this.cached("index.json", async () => {
      const json = await this.fetchJson("index.json");
      // A brand-new repo has no index yet; show an empty home page instead of an error.
      if (json === undefined) return { schemaVersion: SCHEMA_VERSION, novels: [] };
      const result = parseWikiIndex(json);
      if (!result.ok) throw new Error(`index.json doesn't match the wiki format:\n${result.error}`);
      return result.data;
    });
  }

  getNovel(id: string): Promise<NovelWiki> {
    const file = `novels/${encodeURIComponent(id)}.json`;
    return this.cached(file, async () => {
      const json = await this.fetchJson(file);
      if (json === undefined) throw new Error(`There's no wiki called "${id}".`);
      const result = parseNovelWiki(json);
      if (!result.ok) throw new Error(`${file} doesn't match the wiki format:\n${result.error}`);
      return result.data;
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
  private async fetchJson(file: string): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}/${file}`, { cache: "no-cache" });
    if (res.status === 404) return undefined;
    if (!res.ok) throw new Error(`Loading ${file} failed (HTTP ${res.status}).`);
    try {
      return await res.json();
    } catch {
      throw new Error(`${file} isn't valid JSON.`);
    }
  }
}
