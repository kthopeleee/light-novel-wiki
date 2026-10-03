import type { Character, NovelWiki } from "@lnw/schema";
import { Breadcrumb, Fact, Facts, LinkList, Paragraphs, RelationshipLine } from "../../components/common";
import { href } from "../../router";
import { Spoiler } from "../../spoilers";
import { ROLE_LABEL, ROLE_ORDER } from "../../wiki";

export function CharacterCard({ wiki, character: c }: { wiki: NovelWiki; character: Character }) {
  return (
    <a className={`card card--link role-edge role-${c.role}`} href={href("n", wiki.id, "characters", c.id)}>
      <h3>{c.name}</h3>
      {c.aliases.length > 0 && <p className="muted small">Also: {c.aliases.join(", ")}</p>}
      {c.description && <p className="clamp">{c.description}</p>}
      {c.firstAppearance !== undefined && (
        <p className="muted small">First appears in chapter {c.firstAppearance}</p>
      )}
    </a>
  );
}

export function CharacterList({ wiki }: { wiki: NovelWiki }) {
  return (
    <div className="stack">
      {ROLE_ORDER.map((role) => {
        const group = wiki.characters.filter((c) => c.role === role);
        if (group.length === 0) return null;
        return (
          <section key={role}>
            <h2>
              {ROLE_LABEL[role].many} <span className="count">{group.length}</span>
            </h2>
            <ul className="card-grid">
              {group.map((c) => (
                <li key={c.id}>
                  <CharacterCard wiki={wiki} character={c} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export function CharacterDetail({ wiki, character: c }: { wiki: NovelWiki; character: Character }) {
  const openRelationships = c.relationships.filter((r) => !r.spoiler);
  const spoilerRelationships = c.relationships.filter((r) => r.spoiler);
  const owned = wiki.items.filter((i) => i.owner === c.id).map((i) => i.id);
  const leads = wiki.factions.filter((f) => f.leader === c.id).map((f) => f.id);
  const hasSpoilers = c.spoilers.length > 0 || c.fate !== undefined || spoilerRelationships.length > 0;

  return (
    <article className="entry stack">
      <div>
        <Breadcrumb to={href("n", wiki.id, "characters")} label="Characters" />
        <h2 className="entry__title">{c.name}</h2>
      </div>
      <Facts>
        <Fact label="Role">
          <span className={`role-dot role-${c.role}`} aria-hidden="true" />
          {ROLE_LABEL[c.role].one}
        </Fact>
        {c.aliases.length > 0 && <Fact label="Also called">{c.aliases.join(", ")}</Fact>}
        {c.firstAppearance !== undefined && <Fact label="First appears">Chapter {c.firstAppearance}</Fact>}
        {c.affiliations.length > 0 && (
          <Fact label="Affiliations">
            <LinkList wiki={wiki} kind="factions" ids={c.affiliations} />
          </Fact>
        )}
        {leads.length > 0 && (
          <Fact label="Leads">
            <LinkList wiki={wiki} kind="factions" ids={leads} />
          </Fact>
        )}
        {owned.length > 0 && (
          <Fact label="Items & skills">
            <LinkList wiki={wiki} kind="items" ids={owned} />
          </Fact>
        )}
      </Facts>

      {c.description && (
        <section>
          <Paragraphs text={c.description} />
        </section>
      )}

      {openRelationships.length > 0 && (
        <section>
          <h3>Relationships</h3>
          <ul className="rel-list">
            {openRelationships.map((r, i) => (
              <li key={i}>
                <RelationshipLine wiki={wiki} rel={r} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {hasSpoilers && (
        <section>
          <h3>Spoilers</h3>
          <Spoiler label={`Spoilers about ${c.name}`}>
            {spoilerRelationships.length > 0 && (
              <ul className="rel-list">
                {spoilerRelationships.map((r, i) => (
                  <li key={i}>
                    <RelationshipLine wiki={wiki} rel={r} />
                  </li>
                ))}
              </ul>
            )}
            {c.spoilers.length > 0 && (
              <ul>
                {c.spoilers.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            )}
            {c.fate && (
              <p>
                <strong>Fate:</strong> {c.fate}
              </p>
            )}
          </Spoiler>
        </section>
      )}
    </article>
  );
}
