import { useEffect } from "react";
import type { WikiDataSource } from "./data/source";
import { HomePage } from "./pages/HomePage";
import { NovelPage } from "./pages/NovelPage";
import { useRoute } from "./router";

export function App({ source, siteTitle }: { source: WikiDataSource; siteTitle: string }) {
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
