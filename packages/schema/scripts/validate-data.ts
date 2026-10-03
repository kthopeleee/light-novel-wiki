// Checks every file in docs/data/ against the wiki schema. Run with `npm run validate`.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findProblems, parseNovelWiki, parseWikiIndex } from "../src/index";

const dataDir = fileURLToPath(new URL("../../../docs/data/", import.meta.url));
let errors = 0;
let warnings = 0;

const report = (file: string, level: "error" | "warning", message: string) => {
  if (level === "error") errors++;
  else warnings++;
  const indented = message.replace(/^/gm, "    ");
  console[level === "error" ? "error" : "warn"](`${level === "error" ? "✗" : "!"} ${file}\n${indented}`);
};

function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(path.join(dataDir, file), "utf8"));
  } catch (err) {
    report(file, "error", err instanceof Error ? err.message : String(err));
    return undefined;
  }
}

const index = parseWikiIndex(readJson("index.json"));
if (!index.ok) report("index.json", "error", index.error);
const indexedIds = new Set(index.ok ? index.data.novels.map((n) => n.id) : []);

const novelsDir = path.join(dataDir, "novels");
const novelFiles = existsSync(novelsDir) ? readdirSync(novelsDir).filter((f) => f.endsWith(".json")) : [];
const novelIds = new Set<string>();

for (const file of novelFiles) {
  const rel = `novels/${file}`;
  const result = parseNovelWiki(readJson(rel));
  if (!result.ok) {
    report(rel, "error", result.error);
    continue;
  }
  const wiki = result.data;
  novelIds.add(wiki.id);
  if (wiki.id !== file.replace(/\.json$/, "")) {
    report(rel, "error", `id "${wiki.id}" must match the file name`);
  }
  if (!indexedIds.has(wiki.id)) report(rel, "error", "not listed in index.json");
  for (const problem of findProblems(wiki)) report(rel, problem.level, problem.message);
}

for (const id of indexedIds) {
  if (!novelIds.has(id)) report("index.json", "error", `lists "${id}" but novels/${id}.json is missing`);
}

console.log(`\nChecked ${novelFiles.length} novel(s): ${errors} error(s), ${warnings} warning(s).`);
process.exitCode = errors > 0 ? 1 : 0;
