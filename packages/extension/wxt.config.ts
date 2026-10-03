import { defineConfig } from "wxt";

// LNW_TEST=1 builds a copy that may read localhost pages without asking, so the automated
// end-to-end tests don't get stuck on a permission prompt. Never ship that build.
const testBuild = process.env.LNW_TEST === "1";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  // MV3 everywhere, including Firefox, so both use the same scripting and permissions APIs.
  manifestVersion: 3,
  outDir: testBuild ? ".output-test" : ".output",
  manifest: ({ browser }) => ({
    name: "Light Novel Wiki",
    description:
      "Saves the chapters you read so they can become a wiki of characters, arcs, and spoilers. Chapter text stays on your computer.",
    permissions: ["storage", "unlimitedStorage", "scripting", "activeTab"],
    // Access is asked for one site at a time, when you start saving a novel there.
    optional_host_permissions: ["*://*/*"],
    host_permissions: testBuild ? ["http://localhost/*"] : [],
    action: { default_title: "Light Novel Wiki" },
    ...(browser === "firefox"
      ? {
          browser_specific_settings: {
            gecko: {
              id: "light-novel-wiki@kthopeleee.github.io",
              strict_min_version: "128.0",
              data_collection_permissions: { required: ["none"] },
            },
          },
        }
      : {}),
  }),
});
