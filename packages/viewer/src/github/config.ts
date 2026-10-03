import type { RepoConfig } from "./client";

/** Reads the repo the site edits from packages/viewer/.env. Undefined turns editing off. */
export function repoConfigFromEnv(): RepoConfig | undefined {
  const env = import.meta.env;
  const [owner, repo] = String(env.VITE_GITHUB_REPO ?? "").split("/");
  if (!owner || !repo) return undefined;
  return {
    owner,
    repo,
    branch: env.VITE_GITHUB_BRANCH || "main",
    dataPath: env.VITE_GITHUB_DATA_PATH || "docs/data",
    api: env.VITE_GITHUB_API || "https://api.github.com",
  };
}
