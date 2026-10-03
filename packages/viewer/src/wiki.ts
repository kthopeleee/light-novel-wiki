import type {
  Arc,
  Character,
  CharacterRole,
  ChapterSummary,
  Faction,
  Item,
  ItemKind,
  Location,
  NovelWiki,
  Provider,
  Term,
} from "@lnw/schema";

export const ENTRY_KINDS = ["characters", "locations", "factions", "items", "glossary"] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];
export type AnyEntry = Character | Location | Faction | Item | Term;

export const isEntryKind = (value: string): value is EntryKind =>
  (ENTRY_KINDS as readonly string[]).includes(value);

export const KIND_LABEL: Record<EntryKind, string> = {
  characters: "Character",
  locations: "Location",
  factions: "Faction",
  items: "Item / skill",
  glossary: "Term",
};

type Section = { id: string; label: string; hasContent: (wiki: NovelWiki) => boolean };

export const SECTIONS: Section[] = [
  { id: "overview", label: "Overview", hasContent: () => true },
  { id: "characters", label: "Characters", hasContent: (w) => w.characters.length > 0 },
  { id: "arcs", label: "Arcs", hasContent: (w) => w.arcs.length > 0 },
  {
    id: "relationships",
    label: "Relationships",
    hasContent: (w) => w.characters.some((c) => c.relationships.length > 0),
  },
  { id: "timeline", label: "Timeline", hasContent: (w) => w.timeline.length > 0 },
  { id: "locations", label: "Locations", hasContent: (w) => w.locations.length > 0 },
  { id: "factions", label: "Factions", hasContent: (w) => w.factions.length > 0 },
  { id: "items", label: "Items & skills", hasContent: (w) => w.items.length > 0 },
  { id: "glossary", label: "Glossary", hasContent: (w) => w.glossary.length > 0 },
  { id: "spoilers", label: "Spoilers & ending", hasContent: () => true },
];

export const ROLE_ORDER: CharacterRole[] = ["protagonist", "main", "antagonist", "supporting", "minor"];

export const ROLE_LABEL: Record<CharacterRole, { one: string; many: string }> = {
  protagonist: { one: "Protagonist", many: "Protagonist" },
  main: { one: "Main character", many: "Main characters" },
  antagonist: { one: "Antagonist", many: "Antagonists" },
  supporting: { one: "Supporting character", many: "Supporting characters" },
  minor: { one: "Minor character", many: "Minor characters" },
};

export const ITEM_KIND_LABEL: Record<ItemKind, string> = {
  item: "Item",
  artifact: "Artifact",
  skill: "Skill",
  ability: "Ability",
  other: "Other",
};

export const STATUS_LABEL: Record<NovelWiki["status"], string> = {
  ongoing: "Ongoing",
  completed: "Completed",
  unknown: "Status unknown",
};

export const PROVIDER_LABEL: Record<Provider, string> = {
  ollama: "a local model (Ollama)",
  gemini: "Gemini",
  claude: "Claude",
  manual: "hand",
};

export function findEntry(wiki: NovelWiki, kind: EntryKind, id: string): AnyEntry | undefined {
  return (wiki[kind] as AnyEntry[]).find((entry) => entry.id === id);
}

export function sortedArcs(wiki: NovelWiki): Arc[] {
  return [...wiki.arcs].sort((a, b) => a.chapterStart - b.chapterStart);
}

export function arcForChapter(wiki: NovelWiki, chapter: number): Arc | undefined {
  return wiki.arcs.find((arc) => chapter >= arc.chapterStart && chapter <= arc.chapterEnd);
}

export function chaptersInArc(wiki: NovelWiki, arc: Arc): ChapterSummary[] {
  return wiki.chapters
    .filter((ch) => ch.number >= arc.chapterStart && ch.number <= arc.chapterEnd)
    .sort((a, b) => a.number - b.number);
}

export type SearchHit = { kind: EntryKind; entry: AnyEntry };

/** Matches names and aliases first, then descriptions. Never searches spoiler text. */
export function searchWiki(wiki: NovelWiki, query: string, limit = 8): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: (SearchHit & { score: number })[] = [];
  for (const kind of ENTRY_KINDS) {
    for (const entry of wiki[kind] as AnyEntry[]) {
      const names = [entry.name, ...entry.aliases].map((n) => n.toLowerCase());
      let score = 0;
      if (names.includes(q)) score = 4;
      else if (names.some((n) => n.startsWith(q) || n.includes(` ${q}`))) score = 3;
      else if (names.some((n) => n.includes(q))) score = 2;
      else if (entry.description.toLowerCase().includes(q)) score = 1;
      if (score > 0) scored.push({ kind, entry, score });
    }
  }
  return scored
    .sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name))
    .slice(0, limit);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function chapterRange(arc: Arc): string {
  return arc.chapterStart === arc.chapterEnd
    ? `Chapter ${arc.chapterStart}`
    : `Chapters ${arc.chapterStart}–${arc.chapterEnd}`;
}
