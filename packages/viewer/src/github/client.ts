/** Which repo, branch, and folder the wiki data lives in. */
export type RepoConfig = {
  owner: string;
  repo: string;
  branch: string;
  /** Folder in the repo that holds index.json and novels/, e.g. "docs/data". */
  dataPath: string;
  /** API base URL; only changed for tests. */
  api: string;
};

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export type RepoFile = { text: string; sha: string };

/** The handful of GitHub REST calls the wiki needs, using a personal access token. */
export class GitHubClient {
  constructor(
    private readonly token: string,
    readonly config: RepoConfig,
  ) {}

  private get repoPath() {
    return `/repos/${this.config.owner}/${this.config.repo}`;
  }

  whoAmI(): Promise<{ login: string }> {
    return this.request("GET", "/user");
  }

  async checkRepoAccess(): Promise<void> {
    await this.request("GET", this.repoPath);
  }

  /** Reads a file from the branch, or resolves to undefined if it doesn't exist. */
  async readFile(path: string): Promise<RepoFile | undefined> {
    const url = `${this.repoPath}/contents/${encodePath(path)}?ref=${encodeURIComponent(this.config.branch)}`;
    try {
      const meta = await this.request<{ sha: string; content?: string; encoding?: string }>("GET", url);
      if (meta.encoding === "base64" && meta.content) {
        return { text: decodeBase64Utf8(meta.content), sha: meta.sha };
      }
      // Files over 1 MB come back without content, so fetch those raw.
      const text = await this.request<string>("GET", url, undefined, "application/vnd.github.raw+json");
      return { text, sha: meta.sha };
    } catch (err) {
      if (err instanceof GitHubError && err.status === 404) return undefined;
      throw err;
    }
  }

  /** Commits several files at once, so one save is one commit and one site rebuild. */
  async commitFiles(files: { path: string; text: string }[], message: string): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      const ref = await this.request<{ object: { sha: string } }>(
        "GET",
        `${this.repoPath}/git/ref/heads/${encodePath(this.config.branch)}`,
      );
      const parent = await this.request<{ tree: { sha: string } }>(
        "GET",
        `${this.repoPath}/git/commits/${ref.object.sha}`,
      );
      const tree = await this.request<{ sha: string }>("POST", `${this.repoPath}/git/trees`, {
        base_tree: parent.tree.sha,
        tree: files.map((f) => ({ path: f.path, mode: "100644", type: "blob", content: f.text })),
      });
      const commit = await this.request<{ sha: string }>("POST", `${this.repoPath}/git/commits`, {
        message,
        tree: tree.sha,
        parents: [ref.object.sha],
      });
      try {
        await this.request("PATCH", `${this.repoPath}/git/refs/heads/${encodePath(this.config.branch)}`, {
          sha: commit.sha,
        });
        return;
      } catch (err) {
        // 422 means something else was pushed in between; rebuild on top of it.
        if (!(err instanceof GitHubError && err.status === 422) || attempt >= 3) throw err;
      }
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    accept = "application/vnd.github+json",
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.config.api}${path}`, {
        method,
        cache: "no-store",
        headers: {
          Accept: accept,
          Authorization: `Bearer ${this.token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new GitHubError("Couldn't reach GitHub. Check your internet connection and try again.", 0);
    }
    if (!res.ok) throw new GitHubError(await describeError(res), res.status);
    return (accept.includes("raw") ? res.text() : res.json()) as Promise<T>;
  }
}

async function describeError(res: Response): Promise<string> {
  let detail = "";
  try {
    detail = ((await res.json()) as { message?: string }).message ?? "";
  } catch {
    // Not JSON; the status code is enough.
  }
  switch (res.status) {
    case 401:
      return "GitHub didn't accept the token. It may be mistyped, expired, or revoked.";
    case 403:
      return `GitHub refused (${detail || "forbidden"}). Make sure the token has Contents: Read and write for this repository.`;
    case 404:
      return "GitHub couldn't find that. Check that the token has access to this repository.";
    default:
      return `GitHub returned an error (HTTP ${res.status}${detail ? `: ${detail}` : ""}).`;
  }
}

const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

function decodeBase64Utf8(base64: string): string {
  const binary = atob(base64.replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

/** Git's id for a file's contents, so we know the sha of what we just saved without asking. */
export async function gitBlobSha(text: string): Promise<string> {
  const content = new TextEncoder().encode(text);
  const header = new TextEncoder().encode(`blob ${content.byteLength}\0`);
  const bytes = new Uint8Array(header.byteLength + content.byteLength);
  bytes.set(header);
  bytes.set(content, header.byteLength);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
