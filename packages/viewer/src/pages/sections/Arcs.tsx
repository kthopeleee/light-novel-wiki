import { useState } from "react";
import type { Arc, NovelWiki } from "@lnw/schema";
import { Breadcrumb, Fact, Facts, Paragraphs } from "../../components/common";
import { NEW_ID, upsertArc } from "../../editing/edit";
import { AddLink, ArcEditor, EditButton, NotesPanel } from "../../editing/forms";
import { href } from "../../router";
import { Spoiler } from "../../spoilers";
import { chapterRange, chaptersInArc, sortedArcs } from "../../wiki";

/** Arcs drawn to scale by chapter count. */
export function ArcBar({ wiki }: { wiki: NovelWiki }) {
  return (
    <ol className="arcbar">
      {sortedArcs(wiki).map((arc, i) => (
        <li
          key={arc.id}
          className={`arcbar__seg arc-color-${(i % 4) + 1}`}
          style={{ flexGrow: arc.chapterEnd - arc.chapterStart + 1 }}
        >
          <a href={href("n", wiki.id, "arcs", arc.id)} title={`${arc.name} · ${chapterRange(arc)}`}>
            <span className="arcbar__name">{arc.name}</span>
            <span className="arcbar__range">
              {arc.chapterStart}–{arc.chapterEnd}
            </span>
          </a>
        </li>
      ))}
    </ol>
  );
}

export function ArcList({ wiki }: { wiki: NovelWiki }) {
  return (
    <div className="stack">
      <div className="list-actions">
        <AddLink to={href("n", wiki.id, "arcs", NEW_ID)}>Add arc</AddLink>
      </div>
      {wiki.arcs.length === 0 ? <p className="muted">No arcs yet.</p> : <ArcBar wiki={wiki} />}
      <ol className="arc-list">
        {sortedArcs(wiki).map((arc, i) => (
          <li key={arc.id} className={`card arc-card arc-edge-${(i % 4) + 1}`}>
            <p className="muted small">
              Arc {i + 1} · {chapterRange(arc)}
            </p>
            <h3>
              <a href={href("n", wiki.id, "arcs", arc.id)}>{arc.name}</a>
            </h3>
            {arc.summary && <Paragraphs text={arc.summary} />}
            {arc.spoilers.length > 0 && (
              <Spoiler label="Arc spoilers">
                <ul>
                  {arc.spoilers.map((s, j) => (
                    <li key={j}>{s}</li>
                  ))}
                </ul>
              </Spoiler>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function ArcDetail({ wiki, arc }: { wiki: NovelWiki; arc: Arc }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <ArcEditor
        wiki={wiki}
        arc={arc}
        onDone={(id) => (id ? setEditing(false) : (window.location.hash = href("n", wiki.id, "arcs")))}
      />
    );
  }

  const chapters = chaptersInArc(wiki, arc);
  return (
    <article className="entry stack">
      <div>
        <Breadcrumb to={href("n", wiki.id, "arcs")} label="Arcs" />
        <div className="section-heading">
          <h2 className="entry__title">{arc.name}</h2>
          <EditButton onClick={() => setEditing(true)} />
        </div>
      </div>
      <Facts>
        <Fact label="Chapters">{chapterRange(arc).replace(/^Chapters? /, "")}</Fact>
        {chapters.length > 0 && <Fact label="Summarized">{chapters.length} chapters</Fact>}
      </Facts>
      {arc.summary && (
        <section>
          <Paragraphs text={arc.summary} />
        </section>
      )}
      <NotesPanel
        notes={arc.notes}
        apply={(notes) => upsertArc(wiki, { ...arc, notes })}
        subject={`the ${arc.name} arc (${wiki.title})`}
      />
      {arc.spoilers.length > 0 && (
        <section>
          <h3>Spoilers</h3>
          <Spoiler label="Arc spoilers">
            <ul>
              {arc.spoilers.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </Spoiler>
        </section>
      )}
      {chapters.length > 0 && (
        <section>
          <h3>Chapter by chapter</h3>
          <Spoiler label={`${chapters.length} chapter summaries`}>
            <ul className="chapter-list">
              {chapters.map((ch) => (
                <li key={ch.number}>
                  <strong>
                    Chapter {ch.number}
                    {ch.title ? `: ${ch.title}` : ""}
                  </strong>
                  <p>{ch.summary}</p>
                </li>
              ))}
            </ul>
          </Spoiler>
        </section>
      )}
    </article>
  );
}
