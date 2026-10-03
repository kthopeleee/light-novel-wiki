// Pure helpers that turn form drafts into wiki data. No React here.
import {
  uniqueSlug,
  type Arc,
  type Character,
  type CharacterRole,
  type Faction,
  type Item,
  type ItemKind,
  type Location,
  type NovelWiki,
  type SpoilerItem,
  type Term,
  type TimelineEvent,
} from "@lnw/schema";
import type { AnyEntry, EntryKind } from "../wiki";

/** Route id for "add a new entry" pages. Can't clash with a real id, which never has "+". */
export const NEW_ID = "+new";

export const splitList = (text: string) =>
  text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export const splitLines = (text: string) =>
  text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

const optional = (text: string) => text.trim() || undefined;

export function parseChapter(text: string, label = "Chapter"): number | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be a number, like 12 or 12.5.`);
  return value;
}

function requiredChapter(text: string, label: string): number {
  const value = parseChapter(text, label);
  if (value === undefined) throw new Error(`${label} is required.`);
  return value;
}

// ---- Entries (characters, locations, factions, items, glossary) ----

export type RelationshipDraft = { target: string; type: string; description: string; spoiler: boolean };

export type EntryDraft = {
  name: string;
  aliases: string;
  description: string;
  firstAppearance: string;
  spoilers: string;
  role: CharacterRole;
  affiliations: string[];
  relationships: RelationshipDraft[];
  fate: string;
  region: string;
  leader: string;
  itemKind: ItemKind;
  owner: string;
};

export function entryDraft(entry: AnyEntry | undefined): EntryDraft {
  const e = entry as Partial<Character & Location & Faction & Item> | undefined;
  return {
    name: e?.name ?? "",
    aliases: (e?.aliases ?? []).join(", "),
    description: e?.description ?? "",
    firstAppearance: e?.firstAppearance?.toString() ?? "",
    spoilers: (e?.spoilers ?? []).join("\n"),
    role: e?.role ?? "supporting",
    affiliations: e?.affiliations ?? [],
    relationships: (e?.relationships ?? []).map((r) => ({
      target: r.target,
      type: r.type,
      description: r.description ?? "",
      spoiler: r.spoiler,
    })),
    fate: e?.fate ?? "",
    region: e?.region ?? "",
    leader: e?.leader ?? "",
    itemKind: e?.kind ?? "item",
    owner: e?.owner ?? "",
  };
}

/** Throws a readable Error if the draft can't be saved. */
export function entryFromDraft(kind: EntryKind, draft: EntryDraft, id: string, previous?: AnyEntry): AnyEntry {
  const name = draft.name.trim();
  if (!name) throw new Error("Give it a name.");
  const base = {
    id,
    name,
    aliases: splitList(draft.aliases),
    description: draft.description.trim(),
    firstAppearance: parseChapter(draft.firstAppearance, "First appearance"),
    spoilers: splitLines(draft.spoilers),
    notes: previous?.notes,
    editedByHand: true,
  };
  switch (kind) {
    case "characters":
      return {
        ...base,
        role: draft.role,
        affiliations: draft.affiliations,
        relationships: draft.relationships
          .filter((r) => r.target && r.type.trim())
          .map((r) => ({ target: r.target, type: r.type.trim(), description: optional(r.description), spoiler: r.spoiler })),
        fate: optional(draft.fate),
      } satisfies Character;
    case "locations":
      return { ...base, region: optional(draft.region) } satisfies Location;
    case "factions":
      return { ...base, leader: optional(draft.leader) } satisfies Faction;
    case "items":
      return { ...base, kind: draft.itemKind, owner: optional(draft.owner) } satisfies Item;
    case "glossary":
      return base satisfies Term;
  }
}

export function newEntryId(wiki: NovelWiki, kind: EntryKind, name: string): string {
  return uniqueSlug(name, (wiki[kind] as AnyEntry[]).map((e) => e.id));
}

function withEntries(wiki: NovelWiki, kind: EntryKind, entries: AnyEntry[]): NovelWiki {
  return { ...wiki, [kind]: entries } as NovelWiki;
}

export function upsertEntry(wiki: NovelWiki, kind: EntryKind, entry: AnyEntry): NovelWiki {
  const list = wiki[kind] as AnyEntry[];
  const exists = list.some((e) => e.id === entry.id);
  return withEntries(wiki, kind, exists ? list.map((e) => (e.id === entry.id ? entry : e)) : [...list, entry]);
}

/** Deletes an entry and every link to it, so no page points at something that's gone. */
export function removeEntry(wiki: NovelWiki, kind: EntryKind, id: string): NovelWiki {
  const next = withEntries(wiki, kind, (wiki[kind] as AnyEntry[]).filter((e) => e.id !== id));
  if (kind === "characters") {
    return {
      ...next,
      characters: next.characters.map((c) => ({ ...c, relationships: c.relationships.filter((r) => r.target !== id) })),
      factions: next.factions.map((f) => (f.leader === id ? { ...f, leader: undefined } : f)),
      items: next.items.map((i) => (i.owner === id ? { ...i, owner: undefined } : i)),
    };
  }
  if (kind === "factions") {
    return {
      ...next,
      characters: next.characters.map((c) => ({ ...c, affiliations: c.affiliations.filter((a) => a !== id) })),
    };
  }
  return next;
}

// ---- Arcs ----

export type ArcDraft = { name: string; chapterStart: string; chapterEnd: string; summary: string; spoilers: string };

export function arcDraft(arc: Arc | undefined): ArcDraft {
  return {
    name: arc?.name ?? "",
    chapterStart: arc?.chapterStart.toString() ?? "",
    chapterEnd: arc?.chapterEnd.toString() ?? "",
    summary: arc?.summary ?? "",
    spoilers: (arc?.spoilers ?? []).join("\n"),
  };
}

export function arcFromDraft(draft: ArcDraft, id: string, previous?: Arc): Arc {
  const name = draft.name.trim();
  if (!name) throw new Error("Give the arc a name.");
  const chapterStart = requiredChapter(draft.chapterStart, "First chapter");
  const chapterEnd = requiredChapter(draft.chapterEnd, "Last chapter");
  if (chapterEnd < chapterStart) throw new Error("The arc can't end before it starts.");
  return {
    id,
    name,
    chapterStart,
    chapterEnd,
    summary: draft.summary.trim(),
    spoilers: splitLines(draft.spoilers),
    notes: previous?.notes,
    editedByHand: true,
  };
}

export function upsertArc(wiki: NovelWiki, arc: Arc): NovelWiki {
  const exists = wiki.arcs.some((a) => a.id === arc.id);
  return { ...wiki, arcs: exists ? wiki.arcs.map((a) => (a.id === arc.id ? arc : a)) : [...wiki.arcs, arc] };
}

// ---- Timeline events and major spoilers ----

export type EventDraft = { title: string; description: string; chapter: string; spoiler: boolean };

/** Major spoilers have no spoiler flag (they're all hidden), so it's only used for timeline rows. */
export const eventDraft = (e: TimelineEvent | SpoilerItem): EventDraft => ({
  title: e.title,
  description: e.description,
  chapter: e.chapter?.toString() ?? "",
  spoiler: "spoiler" in e ? e.spoiler : false,
});

export const blankEvent = (): EventDraft => ({ title: "", description: "", chapter: "", spoiler: false });

/** Rows with no title are dropped, so an empty row added by mistake doesn't block saving. */
export function eventsFromDrafts(drafts: EventDraft[]): TimelineEvent[] {
  return drafts
    .filter((d) => d.title.trim())
    .map((d) => ({
      title: d.title.trim(),
      description: d.description.trim(),
      chapter: parseChapter(d.chapter),
      spoiler: d.spoiler,
    }));
}

export function spoilersFromDrafts(drafts: EventDraft[]): SpoilerItem[] {
  return eventsFromDrafts(drafts).map(({ title, description, chapter }) => ({ title, description, chapter }));
}
