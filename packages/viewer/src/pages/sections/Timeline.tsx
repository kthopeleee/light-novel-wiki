import type { NovelWiki, TimelineEvent } from "@lnw/schema";
import { Spoiler } from "../../spoilers";
import { arcForChapter } from "../../wiki";

const order = (e: TimelineEvent) => e.chapter ?? Number.MAX_SAFE_INTEGER;

export function Timeline({ wiki }: { wiki: NovelWiki }) {
  const events = [...wiki.timeline].sort((a, b) => order(a) - order(b));

  // Group consecutive events under the arc they happen in.
  const groups: { arcName: string | undefined; events: TimelineEvent[] }[] = [];
  for (const event of events) {
    const arcName = event.chapter === undefined ? undefined : arcForChapter(wiki, event.chapter)?.name;
    const last = groups.at(-1);
    if (last && last.arcName === arcName) last.events.push(event);
    else groups.push({ arcName, events: [event] });
  }

  return (
    <div className="stack">
      {groups.map((group, g) => (
        <section key={g}>
          {group.arcName && <h2>{group.arcName}</h2>}
          <ol className="timeline">
            {group.events.map((event, i) => (
              <li key={i}>
                <span className="timeline__chapter">
                  {event.chapter !== undefined ? `Ch. ${event.chapter}` : "—"}
                </span>
                <div className="timeline__body">
                  {event.spoiler ? (
                    <Spoiler label="Spoiler event">
                      <EventText event={event} />
                    </Spoiler>
                  ) : (
                    <EventText event={event} />
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function EventText({ event }: { event: TimelineEvent }) {
  return (
    <>
      <p className="timeline__title">{event.title}</p>
      {event.description && <p className="muted">{event.description}</p>}
    </>
  );
}
