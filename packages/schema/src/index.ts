import { z } from "zod";

export const SCHEMA_VERSION = 1;

/** Lowercase id used for novels and wiki entries, e.g. "alice-kim". */
export const Slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be a lowercase id like "alice-kim"');

/** Fractional numbers are allowed for side chapters like 12.5. */
const ChapterNumber = z.number().nonnegative();

/** Fields shared by characters, locations, factions, items, and glossary terms. */
const entryFields = {
  id: Slug,
  name: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  description: z.string().default(""),
  firstAppearance: ChapterNumber.optional(),
  /** Twists about this entry. The viewer always hides these until revealed. */
  spoilers: z.array(z.string()).default([]),
  /** The reader's own notes. "Update wiki" never touches these. */
  notes: z.string().optional(),
  /** Set when an entry is fixed by hand, so "Update wiki" leaves it alone. */
  editedByHand: z.boolean().optional(),
};

export const CharacterRole = z.enum(["protagonist", "main", "antagonist", "supporting", "minor"]);

export const Relationship = z.object({
  /** Id of the other character. */
  target: Slug,
  /** What the other character is to this one, e.g. "sister", "mentor", "rival". */
  type: z.string().min(1),
  description: z.string().optional(),
  spoiler: z.boolean().default(false),
});

export const Character = z.object({
  ...entryFields,
  role: CharacterRole.default("minor"),
  /** Faction ids. */
  affiliations: z.array(Slug).default([]),
  relationships: z.array(Relationship).default([]),
  /** How their story ends. Always treated as a spoiler. */
  fate: z.string().optional(),
});

export const Location = z.object({
  ...entryFields,
  region: z.string().optional(),
});

export const Faction = z.object({
  ...entryFields,
  /** Character id. */
  leader: Slug.optional(),
});

export const ItemKind = z.enum(["item", "artifact", "skill", "ability", "other"]);

export const Item = z.object({
  ...entryFields,
  kind: ItemKind.default("item"),
  /** Character id. */
  owner: Slug.optional(),
});

/** Glossary term: `name` is the term, `description` is what it means. */
export const Term = z.object(entryFields);

export const Arc = z.object({
  id: Slug,
  name: z.string().min(1),
  chapterStart: ChapterNumber,
  chapterEnd: ChapterNumber,
  summary: z.string().default(""),
  spoilers: z.array(z.string()).default([]),
  notes: z.string().optional(),
  editedByHand: z.boolean().optional(),
});

export const ChapterSummary = z.object({
  number: ChapterNumber,
  title: z.string().optional(),
  summary: z.string(),
});

export const TimelineEvent = z.object({
  chapter: ChapterNumber.optional(),
  title: z.string().min(1),
  description: z.string().default(""),
  spoiler: z.boolean().default(false),
});

export const SpoilerItem = z.object({
  title: z.string().min(1),
  description: z.string(),
  chapter: ChapterNumber.optional(),
});

export const Provider = z.enum(["ollama", "gemini", "claude", "manual"]);

export const NovelWiki = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: Slug,
  title: z.string().min(1),
  altTitles: z.array(z.string()).default([]),
  author: z.string().optional(),
  sourceUrl: z.url().optional(),
  sourceType: z.enum(["web", "pdf"]),
  visibility: z.enum(["public", "private"]).default("public"),
  /** Hand-written demo data, not generated from a real novel. */
  sample: z.boolean().optional(),
  status: z.enum(["ongoing", "completed", "unknown"]).default("unknown"),
  genres: z.array(z.string()).default([]),
  /** Spoiler-free hook. */
  premise: z.string().default(""),
  /** Broad strokes of the plot, without major twists. */
  plotOverview: z.string().default(""),
  majorSpoilers: z.array(SpoilerItem).default([]),
  /** Missing while the story is ongoing. */
  ending: z.string().optional(),
  /** The reader's own notes about the whole novel. */
  notes: z.string().optional(),
  /** How many chapters the wiki was generated from. */
  chapterCount: z.number().int().nonnegative(),
  characters: z.array(Character).default([]),
  locations: z.array(Location).default([]),
  factions: z.array(Faction).default([]),
  items: z.array(Item).default([]),
  glossary: z.array(Term).default([]),
  arcs: z.array(Arc).default([]),
  chapters: z.array(ChapterSummary).default([]),
  timeline: z.array(TimelineEvent).default([]),
  generatedBy: z.object({
    provider: Provider,
    model: z.string().optional(),
  }),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/** The list of novels shown on the wiki's home page (data/index.json). */
export const WikiIndexEntry = NovelWiki.pick({
  id: true,
  title: true,
  author: true,
  sample: true,
  status: true,
  genres: true,
  premise: true,
  chapterCount: true,
  updatedAt: true,
});

export const WikiIndex = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  novels: z.array(WikiIndexEntry).default([]),
});

export type CharacterRole = z.infer<typeof CharacterRole>;
export type Relationship = z.infer<typeof Relationship>;
export type Character = z.infer<typeof Character>;
export type Location = z.infer<typeof Location>;
export type Faction = z.infer<typeof Faction>;
export type ItemKind = z.infer<typeof ItemKind>;
export type Item = z.infer<typeof Item>;
export type Term = z.infer<typeof Term>;
export type Arc = z.infer<typeof Arc>;
export type ChapterSummary = z.infer<typeof ChapterSummary>;
export type TimelineEvent = z.infer<typeof TimelineEvent>;
export type SpoilerItem = z.infer<typeof SpoilerItem>;
export type Provider = z.infer<typeof Provider>;
export type NovelWiki = z.infer<typeof NovelWiki>;
export type WikiIndexEntry = z.infer<typeof WikiIndexEntry>;
export type WikiIndex = z.infer<typeof WikiIndex>;

export { slugify, uniqueSlug } from "./slug";

export function toIndexEntry(wiki: NovelWiki): WikiIndexEntry {
  const { id, title, author, sample, status, genres, premise, chapterCount, updatedAt } = wiki;
  return { id, title, author, sample, status, genres, premise, chapterCount, updatedAt };
}

export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

function parseWith<T>(schema: z.ZodType<T>, json: unknown): ParseResult<T> {
  const result = schema.safeParse(json);
  return result.success
    ? { ok: true, data: result.data }
    : { ok: false, error: z.prettifyError(result.error) };
}

export const parseNovelWiki = (json: unknown) => parseWith(NovelWiki, json);
export const parseWikiIndex = (json: unknown) => parseWith(WikiIndex, json);

export type Problem = { level: "error" | "warning"; message: string };

/** Checks what the schema can't: duplicate ids and links to entries that don't exist. */
export function findProblems(wiki: NovelWiki): Problem[] {
  const problems: Problem[] = [];

  for (const kind of ["characters", "locations", "factions", "items", "glossary", "arcs"] as const) {
    const seen = new Set<string>();
    for (const { id } of wiki[kind]) {
      if (seen.has(id)) problems.push({ level: "error", message: `${kind}: duplicate id "${id}"` });
      seen.add(id);
    }
  }

  const characterIds = new Set(wiki.characters.map((c) => c.id));
  const factionIds = new Set(wiki.factions.map((f) => f.id));
  const missing = (where: string, what: string, id: string) =>
    problems.push({ level: "warning", message: `${where} links to unknown ${what} "${id}"` });

  for (const c of wiki.characters) {
    for (const r of c.relationships) {
      if (!characterIds.has(r.target)) missing(`characters/${c.id}`, "character", r.target);
    }
    for (const f of c.affiliations) {
      if (!factionIds.has(f)) missing(`characters/${c.id}`, "faction", f);
    }
  }
  for (const f of wiki.factions) {
    if (f.leader && !characterIds.has(f.leader)) missing(`factions/${f.id}`, "character", f.leader);
  }
  for (const i of wiki.items) {
    if (i.owner && !characterIds.has(i.owner)) missing(`items/${i.id}`, "character", i.owner);
  }
  for (const a of wiki.arcs) {
    if (a.chapterEnd < a.chapterStart) {
      problems.push({
        level: "error",
        message: `arcs/${a.id}: ends (chapter ${a.chapterEnd}) before it starts (chapter ${a.chapterStart})`,
      });
    }
  }
  return problems;
}
