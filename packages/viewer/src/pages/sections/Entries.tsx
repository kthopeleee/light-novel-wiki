import { useState } from "react";
import type { Faction, Item, Location, NovelWiki } from "@lnw/schema";
import { Breadcrumb, EntryLink, Fact, Facts, LinkList, Paragraphs } from "../../components/common";
import { NEW_ID, upsertEntry } from "../../editing/edit";
import { AddLink, EditButton, EntryEditor, NotesPanel } from "../../editing/forms";
import { href } from "../../router";
import { Spoiler } from "../../spoilers";
import { ITEM_KIND_LABEL, KIND_LABEL, SECTIONS, type AnyEntry, type EntryKind } from "../../wiki";

/** Locations, factions, items, and glossary terms share one list and one detail page. */
type OtherKind = Exclude<EntryKind, "characters">;

export function EntryList({ wiki, kind }: { wiki: NovelWiki; kind: OtherKind }) {
  const entries = [...(wiki[kind] as AnyEntry[])].sort((a, b) => a.name.localeCompare(b.name));
  const sectionLabel = SECTIONS.find((s) => s.id === kind)?.label.toLowerCase() ?? kind;

  return (
    <div className="stack">
      <div className="list-actions">
        <AddLink to={href("n", wiki.id, kind, NEW_ID)}>Add {KIND_LABEL[kind].toLowerCase()}</AddLink>
      </div>
      {entries.length === 0 && <p className="muted">No {sectionLabel} yet.</p>}
      {kind === "glossary" ? (
        <dl className="glossary">
          {entries.map((t) => (
            <div key={t.id}>
              <dt>
                <a href={href("n", wiki.id, kind, t.id)}>{t.name}</a>
              </dt>
              <dd>{t.description}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <ul className="card-grid">
          {entries.map((e) => (
            <li key={e.id}>
              <a className="card card--link" href={href("n", wiki.id, kind, e.id)}>
                <h3>
                  {e.name}
                  {kind === "items" && <span className="badge">{ITEM_KIND_LABEL[(e as Item).kind]}</span>}
                </h3>
                {e.aliases.length > 0 && <p className="muted small">Also: {e.aliases.join(", ")}</p>}
                {e.description && <p className="clamp">{e.description}</p>}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function EntryDetail({ wiki, kind, entry }: { wiki: NovelWiki; kind: OtherKind; entry: AnyEntry }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <EntryEditor
        wiki={wiki}
        kind={kind}
        entry={entry}
        onDone={(id) => (id ? setEditing(false) : (window.location.hash = href("n", wiki.id, kind)))}
      />
    );
  }

  const sectionLabel = SECTIONS.find((s) => s.id === kind)?.label ?? kind;
  const item = kind === "items" ? (entry as Item) : undefined;
  const faction = kind === "factions" ? (entry as Faction) : undefined;
  const location = kind === "locations" ? (entry as Location) : undefined;
  const members = faction
    ? wiki.characters.filter((c) => c.affiliations.includes(faction.id)).map((c) => c.id)
    : [];

  return (
    <article className="entry stack">
      <div>
        <Breadcrumb to={href("n", wiki.id, kind)} label={sectionLabel} />
        <div className="section-heading">
          <h2 className="entry__title">{entry.name}</h2>
          <EditButton onClick={() => setEditing(true)} />
        </div>
      </div>
      <Facts>
        {item && <Fact label="Type">{ITEM_KIND_LABEL[item.kind]}</Fact>}
        {item?.owner && (
          <Fact label="Belongs to">
            <EntryLink wiki={wiki} kind="characters" id={item.owner} />
          </Fact>
        )}
        {faction?.leader && (
          <Fact label="Leader">
            <EntryLink wiki={wiki} kind="characters" id={faction.leader} />
          </Fact>
        )}
        {members.length > 0 && (
          <Fact label="Members">
            <LinkList wiki={wiki} kind="characters" ids={members} />
          </Fact>
        )}
        {location?.region && <Fact label="Region">{location.region}</Fact>}
        {entry.aliases.length > 0 && <Fact label="Also called">{entry.aliases.join(", ")}</Fact>}
        {entry.firstAppearance !== undefined && <Fact label="First appears">Chapter {entry.firstAppearance}</Fact>}
      </Facts>

      {entry.description && (
        <section>
          <Paragraphs text={entry.description} />
        </section>
      )}

      <NotesPanel
        notes={entry.notes}
        apply={(notes) => upsertEntry(wiki, kind, { ...entry, notes })}
        subject={`${entry.name} (${wiki.title})`}
      />

      {entry.spoilers.length > 0 && (
        <section>
          <h3>Spoilers</h3>
          <Spoiler label={`Spoilers about ${entry.name}`}>
            <ul>
              {entry.spoilers.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </Spoiler>
        </section>
      )}
    </article>
  );
}
