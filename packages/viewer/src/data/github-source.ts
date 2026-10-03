import { parseNovelWiki, toIndexEntry, type NovelWiki, type WikiIndex } from "@lnw/schema";
import { gitBlobSha, type GitHubClient } from "../github/client";
import { emptyIndex, parseIndexText, parseNovelText, type WikiDataSource } from "./source";

/**
 * Reads and writes wiki data straight from the GitHub repo, so a signed-in editor
 * always sees the latest version, even before the public site has rebuilt.
 */
export class GitHubDataSource implements WikiDataSource {
  /** Git sha of each file as we last read or wrote it, to catch edits made elsewhere. */
  private readonly shas = new Map<string, string>();

  constructor(private readonly client: GitHubClient) {}

  async listNovels(): Promise<WikiIndex> {
    const file = await this.client.readFile(this.path("index.json"));
    return file ? parseIndexText(file.text, "index.json") : emptyIndex();
  }

  async getNovel(id: string): Promise<NovelWiki> {
    const rel = `novels/${id}.json`;
    const file = await this.client.readFile(this.path(rel));
    if (!file) throw new Error(`There's no wiki called "${id}".`);
    this.shas.set(rel, file.sha);
    return parseNovelText(file.text, rel);
  }

  async saveNovel(wiki: NovelWiki, message: string): Promise<NovelWiki> {
    const parsed = parseNovelWiki({ ...wiki, updatedAt: new Date().toISOString() });
    if (!parsed.ok) throw new Error(`That change doesn't fit the wiki format:\n${parsed.error}`);
    const next = parsed.data;
    const rel = `novels/${next.id}.json`;

    const current = await this.client.readFile(this.path(rel));
    const seen = this.shas.get(rel);
    if (current && seen && current.sha !== seen) {
      throw new Error(
        "This wiki was changed somewhere else since you opened it. Reload the page to get the latest version, then make your edit again.",
      );
    }

    // Keep the home page's list in step with the novel (title, premise, genres, …).
    const indexFile = await this.client.readFile(this.path("index.json"));
    const index = indexFile ? parseIndexText(indexFile.text, "index.json") : emptyIndex();
    const entry = toIndexEntry(next);
    const position = index.novels.findIndex((n) => n.id === next.id);
    const novels = [...index.novels];
    if (position === -1) novels.push(entry);
    else novels[position] = entry;

    const novelText = toJson(next);
    await this.client.commitFiles(
      [
        { path: this.path(rel), text: novelText },
        { path: this.path("index.json"), text: toJson({ ...index, novels }) },
      ],
      message,
    );
    this.shas.set(rel, await gitBlobSha(novelText));
    return next;
  }

  private path(rel: string) {
    return `${this.client.config.dataPath}/${rel}`;
  }
}

const toJson = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
