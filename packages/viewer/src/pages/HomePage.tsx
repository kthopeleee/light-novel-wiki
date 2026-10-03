import { Chips, ErrorBox, Loading, useDocumentTitle } from "../components/common";
import type { WikiDataSource } from "../data/source";
import { href } from "../router";
import { useAsync } from "../useAsync";
import { formatDate, STATUS_LABEL } from "../wiki";

export function HomePage({ source, siteTitle }: { source: WikiDataSource; siteTitle: string }) {
  const state = useAsync(() => source.listNovels(), [source]);
  useDocumentTitle([siteTitle]);

  if (state.status === "loading") return <Loading />;
  if (state.status === "error") return <ErrorBox error={state.error} />;

  const novels = [...state.data.novels].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <>
      <h1 className="page-title">Your novels</h1>
      {novels.length === 0 ? (
        <div className="empty">
          <p>No wikis yet.</p>
          <p className="muted">Open a novel in your browser and press “Turn into wiki” in the extension.</p>
        </div>
      ) : (
        <ul className="card-grid card-grid--wide">
          {novels.map((n) => (
            <li key={n.id}>
              <a className="card card--link novel-card" href={href("n", n.id)}>
                <h2>
                  {n.title}
                  {n.sample && <span className="badge">Sample</span>}
                </h2>
                {n.author && <p className="muted small">{n.author}</p>}
                <p className="clamp">{n.premise}</p>
                <Chips items={n.genres} />
                <p className="muted small">
                  {STATUS_LABEL[n.status]} · {n.chapterCount} chapters · updated {formatDate(n.updatedAt)}
                </p>
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
