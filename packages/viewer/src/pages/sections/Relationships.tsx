import type { NovelWiki } from "@lnw/schema";
import { RelationshipLine } from "../../components/common";
import { RelationshipMap } from "../../components/RelationshipMap";
import { href } from "../../router";
import { Spoiler } from "../../spoilers";

export function Relationships({ wiki }: { wiki: NovelWiki }) {
  const people = wiki.characters.filter((c) => c.relationships.length > 0);
  return (
    <div className="stack">
      <RelationshipMap wiki={wiki} />
      <section>
        <h2>All relationships</h2>
        <div className="rel-groups">
          {people.map((c) => (
            <div key={c.id} className="card">
              <h3>
                <a href={href("n", wiki.id, "characters", c.id)}>{c.name}</a>
              </h3>
              <ul className="rel-list">
                {c.relationships.map((r, i) => (
                  <li key={i}>
                    {r.spoiler ? (
                      <Spoiler inline label="Spoiler relationship">
                        <RelationshipLine wiki={wiki} rel={r} />
                      </Spoiler>
                    ) : (
                      <RelationshipLine wiki={wiki} rel={r} />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
