import { useEffect, useMemo } from "react";
import { GitHubDataSource } from "./data/github-source";
import type { WikiDataSource } from "./data/source";
import { EditorSessionProvider, EditorStatus, useEditorSession } from "./editing/session";
import { GitHubClient, type RepoConfig } from "./github/client";
import { HomePage } from "./pages/HomePage";
import { NovelPage } from "./pages/NovelPage";
import { useRoute } from "./router";

type Props = {
  /** Read-only data for visitors. */
  publicSource: WikiDataSource;
  /** Where edits are saved; undefined turns editing off. */
  repo: RepoConfig | undefined;
  siteTitle: string;
};

export function App({ publicSource, repo, siteTitle }: Props) {
  return (
    <EditorSessionProvider repo={repo}>
      <Shell publicSource={publicSource} siteTitle={siteTitle} />
    </EditorSessionProvider>
  );
}

function Shell({ publicSource, siteTitle }: { publicSource: WikiDataSource; siteTitle: string }) {
  const { session, repo } = useEditorSession();
  // Signed-in editors read GitHub directly, so they see their saves before the site rebuilds.
  const source = useMemo(
    () => (session && repo ? new GitHubDataSource(new GitHubClient(session.token, repo)) : publicSource),
    [session, repo, publicSource],
  );

  const route = useRoute();
  const routeKey = route.join("/");
  // Block body on purpose: newer browsers return a Promise from scrollTo, and React
  // would try to call any returned value as a cleanup function.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [routeKey]);

  const [first, novelId, section, entryId] = route;
  return (
    <div className="app">
      <header className="site-header">
        <div className="container">
          <a className="site-title" href="#/">
            <span aria-hidden="true">📖</span> {siteTitle}
          </a>
          <EditorStatus />
        </div>
      </header>
      <main className="container">
        {first === "n" && novelId ? (
          <NovelPage
            source={source}
            novelId={novelId}
            section={section ?? "overview"}
            entryId={entryId}
            siteTitle={siteTitle}
          />
        ) : (
          <HomePage source={source} siteTitle={siteTitle} />
        )}
      </main>
    </div>
  );
}
