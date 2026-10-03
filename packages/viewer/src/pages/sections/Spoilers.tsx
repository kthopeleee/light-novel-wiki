import { useState } from "react";
import type { NovelWiki } from "@lnw/schema";
import { Paragraphs } from "../../components/common";
import { EditButton, SpoilersEditor } from "../../editing/forms";
import { href } from "../../router";
import { Spoiler } from "../../spoilers";

export function SpoilersPage({ wiki }: { wiki: NovelWiki }) {
  const [editing, setEditing] = useState(false);
  if (editing) return <SpoilersEditor wiki={wiki} onDone={() => setEditing(false)} />;

  const fates = wiki.characters.filter((c) => c.fate);
  return (
    <div className="stack">
      <div className="section-heading">
        <p className="note">Everything here stays hidden until you click it, unless “Show all spoilers” is on.</p>
        <EditButton onClick={() => setEditing(true)}>Edit spoilers & ending</EditButton>
      </div>

      <section>
        <h2>Major spoilers</h2>
        {wiki.majorSpoilers.length === 0 ? (
          <p className="muted">No major spoilers recorded.</p>
        ) : (
          <ul className="spoiler-list">
            {wiki.majorSpoilers.map((s, i) => (
              <li key={i}>
                {/* The title is part of the spoiler, so only the chapter shows on the cover. */}
                <Spoiler label={s.chapter !== undefined ? `Spoiler from chapter ${s.chapter}` : "Spoiler"}>
                  <p className="spoiler-list__title">{s.title}</p>
                  <p>{s.description}</p>
                </Spoiler>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Ending</h2>
        {wiki.ending ? (
          <Spoiler label="How the story ends">
            <Paragraphs text={wiki.ending} />
          </Spoiler>
        ) : (
          <p className="muted">
            {wiki.status === "ongoing"
              ? "The story is still ongoing, so there's no ending yet."
              : "No ending recorded."}
          </p>
        )}
      </section>

      {fates.length > 0 && (
        <section>
          <h2>Character fates</h2>
          <ul className="rel-list">
            {fates.map((c) => (
              <li key={c.id}>
                <a href={href("n", wiki.id, "characters", c.id)}>{c.name}</a>:{" "}
                <Spoiler inline label="Fate">
                  {c.fate}
                </Spoiler>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
