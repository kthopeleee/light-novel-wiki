import { createReadStream, existsSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// GitHub Pages serves the repo's docs/ folder. The built site goes there, next to
// docs/data/, which holds the wiki data and is never touched by the build.
const siteDir = fileURLToPath(new URL("../../docs", import.meta.url));
const dataDir = path.join(siteDir, "data");

function wikiData(): Plugin {
  let isBuild = false;
  return {
    name: "wiki-data",
    configResolved(config) {
      isBuild = config.command === "build";
    },
    buildStart() {
      // Replace the previous build's files, but leave data/ and .nojekyll alone.
      if (!isBuild) return;
      rmSync(path.join(siteDir, "assets"), { recursive: true, force: true });
      rmSync(path.join(siteDir, "index.html"), { force: true });
    },
    configureServer(server) {
      server.watcher.add(dataDir);
      server.watcher.on("all", (_event, file) => {
        if (file.startsWith(dataDir)) server.ws.send({ type: "full-reload" });
      });
      server.middlewares.use("/data", (req, res) => {
        const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
        const file = path.join(dataDir, urlPath);
        // Answer 404 like GitHub Pages would.
        if (!file.startsWith(dataDir + path.sep) || !existsSync(file) || !statSync(file).isFile()) {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  // Relative paths so the site works from any GitHub Pages sub-path.
  base: "./",
  // Routing is hash-based, so unknown paths should 404 (as on GitHub Pages) instead of
  // falling back to index.html.
  appType: "mpa",
  build: {
    outDir: siteDir,
    emptyOutDir: false,
  },
  plugins: [react(), wikiData()],
});
