import { useState, type ReactNode } from "react";
import type { Arc, ItemKind, NovelWiki } from "@lnw/schema";
import { uniqueSlug } from "@lnw/schema";
import { ITEM_KIND_LABEL, KIND_LABEL, ROLE_LABEL, ROLE_ORDER, STATUS_LABEL, type AnyEntry, type EntryKind } from "../wiki";
import { errorMessage, useNovelEditing, useSaveAction } from "./context";
import {
  arcDraft,
  arcFromDraft,
  blankEvent,
  entryDraft,
  entryFromDraft,
  eventDraft,
  eventsFromDrafts,
  newEntryId,
  removeEntry,
  splitList,
  spoilersFromDrafts,
  upsertArc,
  upsertEntry,
  type EntryDraft,
  type EventDraft,
  type RelationshipDraft,
} from "./edit";
import { FieldGroup, Select, TextArea, TextInput } from "./fields";

/** Shown only to signed-in editors. */
export function EditButton({ onClick, children = "Edit" }: { onClick: () => void; children?: ReactNode }) {
  const { canEdit } = useNovelEditing();
  if (!canEdit) return null;
  return (
    <button type="button" className="button button--small" onClick={onClick}>
      ✎ {children}
    </button>
  );
}

export function AddLink({ to, children }: { to: string; children: ReactNode }) {
  const { canEdit } = useNovelEditing();
  if (!canEdit) return null;
  return (
    <a className="button button--small" href={to}>
      + {children}
    </a>
  );
}

function FormShell({
  title,
  busy,
  error,
  onSubmit,
  onCancel,
  onDelete,
  children,
}: {
  title: string;
  busy: boolean;
  error: string | null;
  onSubmit: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  children: ReactNode;
}) {
  return (
    <form
      className="card form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div>
        <h2>{title}</h2>
        <p className="muted small">Spoilers are shown while you edit.</p>
      </div>
      {children}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="button button--primary" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" className="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        {onDelete && (
          <button type="button" className="button button--danger" onClick={onDelete} disabled={busy}>
            Delete
          </button>
        )}
      </div>
    </form>
  );
}

// ---- Entries ----

export function EntryEditor({
  wiki,
  kind,
  entry,
  onDone,
}: {
  wiki: NovelWiki;
  kind: EntryKind;
  /** Missing when adding a new entry. */
  entry?: AnyEntry;
  /** Called with the entry's id after saving, or with nothing after deleting or cancelling. */
  onDone: (id?: string) => void;
}) {
  const [draft, setDraft] = useState(() => entryDraft(entry));
  const { run, busy, error, setError } = useSaveAction();
  const set = <K extends keyof EntryDraft>(key: K, value: EntryDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const otherCharacters = wiki.characters.filter((c) => c.id !== entry?.id);
  const characterOptions = [
    { value: "", label: "Nobody" },
    ...wiki.characters.map((c) => ({ value: c.id, label: c.name })),
  ];

  const submit = async () => {
    let built: AnyEntry;
    try {
      built = entryFromDraft(kind, draft, entry?.id ?? newEntryId(wiki, kind, draft.name), entry);
    } catch (err) {
      setError(errorMessage(err));
      return;
    }
    const message = `${entry ? "Edit" : "Add"} ${built.name} (${wiki.title})`;
    if (await run(upsertEntry(wiki, kind, built), message)) onDone(built.id);
  };

  const remove = async () => {
    if (!entry || !window.confirm(`Delete ${entry.name}? Links to it from other pages are removed too.`)) return;
    if (await run(removeEntry(wiki, kind, entry.id), `Delete ${entry.name} (${wiki.title})`)) onDone();
  };

  return (
    <FormShell
      title={entry ? `Edit ${entry.name}` : `New ${KIND_LABEL[kind].toLowerCase()}`}
      busy={busy}
      error={error}
      onSubmit={submit}
      onCancel={() => onDone(entry?.id)}
      onDelete={entry ? remove : undefined}
    >
      <div className="form-grid">
        <TextInput label="Name" value={draft.name} onChange={(v) => set("name", v)} autoFocus={!entry} />
        <TextInput
          label="Also called"
          hint="Separate names with commas."
          value={draft.aliases}
          onChange={(v) => set("aliases", v)}
        />
        {kind === "characters" && (
          <Select
            label="Role"
            value={draft.role}
            onChange={(v) => set("role", v)}
            options={ROLE_ORDER.map((r) => ({ value: r, label: ROLE_LABEL[r].one }))}
          />
        )}
        {kind === "items" && (
          <>
            <Select
              label="Type"
              value={draft.itemKind}
              onChange={(v) => set("itemKind", v)}
              options={(Object.keys(ITEM_KIND_LABEL) as ItemKind[]).map((k) => ({ value: k, label: ITEM_KIND_LABEL[k] }))}
            />
            <Select label="Belongs to" value={draft.owner} onChange={(v) => set("owner", v)} options={characterOptions} />
          </>
        )}
        {kind === "factions" && (
          <Select label="Leader" value={draft.leader} onChange={(v) => set("leader", v)} options={characterOptions} />
        )}
        {kind === "locations" && (
          <TextInput label="Region" value={draft.region} onChange={(v) => set("region", v)} />
        )}
        <TextInput
          label="First appears in chapter"
          inputMode="decimal"
          value={draft.firstAppearance}
          onChange={(v) => set("firstAppearance", v)}
        />
      </div>

      <TextArea
        label={kind === "glossary" ? "Meaning" : "Description"}
        hint="Keep this spoiler-free. Put twists in Spoilers below."
        value={draft.description}
        onChange={(v) => set("description", v)}
      />

      {kind === "characters" && wiki.factions.length > 0 && (
        <FieldGroup legend="Affiliations">
          <div className="checkbox-list">
            {wiki.factions.map((f) => (
              <label key={f.id} className="checkbox">
                <input
                  type="checkbox"
                  checked={draft.affiliations.includes(f.id)}
                  onChange={(e) =>
                    set(
                      "affiliations",
                      e.target.checked ? [...draft.affiliations, f.id] : draft.affiliations.filter((a) => a !== f.id),
                    )
                  }
                />
                {f.name}
              </label>
            ))}
          </div>
        </FieldGroup>
      )}

      {kind === "characters" && (
        <RelationshipRows
          rows={draft.relationships}
          onChange={(rows) => set("relationships", rows)}
          characters={otherCharacters}
        />
      )}

      <TextArea
        label="Spoilers"
        hint="One per line. Hidden until someone clicks to reveal."
        value={draft.spoilers}
        onChange={(v) => set("spoilers", v)}
      />
      {kind === "characters" && (
        <TextArea
          label="Fate"
          hint="How their story ends. Always hidden as a spoiler."
          rows={2}
          value={draft.fate}
          onChange={(v) => set("fate", v)}
        />
      )}
    </FormShell>
  );
}

function RelationshipRows({
  rows,
  onChange,
  characters,
}: {
  rows: RelationshipDraft[];
  onChange: (rows: RelationshipDraft[]) => void;
  characters: { id: string; name: string }[];
}) {
  const update = (i: number, patch: Partial<RelationshipDraft>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <FieldGroup legend="Relationships" hint='"Type" is what the other character is to this one, like "sister" or "mentor".'>
      {rows.map((r, i) => (
        <div key={i} className="row-editor">
          <select aria-label={`Relationship ${i + 1}: character`} value={r.target} onChange={(e) => update(i, { target: e.target.value })}>
            <option value="">Choose a character…</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            aria-label={`Relationship ${i + 1}: type`}
            placeholder="Type, e.g. sister"
            value={r.type}
            onChange={(e) => update(i, { type: e.target.value })}
          />
          <input
            aria-label={`Relationship ${i + 1}: details`}
            placeholder="Details (optional)"
            value={r.description}
            onChange={(e) => update(i, { description: e.target.value })}
          />
          <label className="checkbox">
            <input type="checkbox" checked={r.spoiler} onChange={(e) => update(i, { spoiler: e.target.checked })} />
            Spoiler
          </label>
          <button type="button" className="button button--small" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
            Remove
          </button>
        </div>
      ))}
      <div>
        <button
          type="button"
          className="button button--small"
          onClick={() => onChange([...rows, { target: "", type: "", description: "", spoiler: false }])}
        >
          + Add relationship
        </button>
      </div>
    </FieldGroup>
  );
}

// ---- Arcs ----

export function ArcEditor({ wiki, arc, onDone }: { wiki: NovelWiki; arc?: Arc; onDone: (id?: string) => void }) {
  const [draft, setDraft] = useState(() => arcDraft(arc));
  const { run, busy, error, setError } = useSaveAction();
  const set = (key: keyof typeof draft, value: string) => setDraft((d) => ({ ...d, [key]: value }));

  const submit = async () => {
    let built: Arc;
    try {
      const id = arc?.id ?? uniqueSlug(draft.name, wiki.arcs.map((a) => a.id));
      built = arcFromDraft(draft, id, arc);
    } catch (err) {
      setError(errorMessage(err));
      return;
    }
    if (await run(upsertArc(wiki, built), `${arc ? "Edit" : "Add"} arc ${built.name} (${wiki.title})`)) {
      onDone(built.id);
    }
  };

  const remove = async () => {
    if (!arc || !window.confirm(`Delete the arc "${arc.name}"? Its chapter summaries stay.`)) return;
    const next = { ...wiki, arcs: wiki.arcs.filter((a) => a.id !== arc.id) };
    if (await run(next, `Delete arc ${arc.name} (${wiki.title})`)) onDone();
  };

  return (
    <FormShell
      title={arc ? `Edit ${arc.name}` : "New arc"}
      busy={busy}
      error={error}
      onSubmit={submit}
      onCancel={() => onDone(arc?.id)}
      onDelete={arc ? remove : undefined}
    >
      <div className="form-grid">
        <TextInput label="Name" value={draft.name} onChange={(v) => set("name", v)} autoFocus={!arc} />
        <TextInput label="First chapter" inputMode="decimal" value={draft.chapterStart} onChange={(v) => set("chapterStart", v)} />
        <TextInput label="Last chapter" inputMode="decimal" value={draft.chapterEnd} onChange={(v) => set("chapterEnd", v)} />
      </div>
      <TextArea label="Summary" value={draft.summary} onChange={(v) => set("summary", v)} />
      <TextArea label="Spoilers" hint="One per line." value={draft.spoilers} onChange={(v) => set("spoilers", v)} />
    </FormShell>
  );
}

// ---- Novel overview ----

export function OverviewEditor({ wiki, onDone }: { wiki: NovelWiki; onDone: () => void }) {
  const [draft, setDraft] = useState({
    title: wiki.title,
    altTitles: wiki.altTitles.join(", "),
    author: wiki.author ?? "",
    status: wiki.status,
    genres: wiki.genres.join(", "),
    premise: wiki.premise,
    plotOverview: wiki.plotOverview,
  });
  const { run, busy, error, setError } = useSaveAction();
  const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const submit = async () => {
    if (!draft.title.trim()) {
      setError("The novel needs a title.");
      return;
    }
    const next: NovelWiki = {
      ...wiki,
      title: draft.title.trim(),
      altTitles: splitList(draft.altTitles),
      author: draft.author.trim() || undefined,
      status: draft.status,
      genres: splitList(draft.genres),
      premise: draft.premise.trim(),
      plotOverview: draft.plotOverview.trim(),
    };
    if (await run(next, `Edit overview (${next.title})`)) onDone();
  };

  return (
    <FormShell title="Edit overview" busy={busy} error={error} onSubmit={submit} onCancel={onDone}>
      <div className="form-grid">
        <TextInput label="Title" value={draft.title} onChange={(v) => set("title", v)} />
        <TextInput label="Other titles" hint="Separate with commas." value={draft.altTitles} onChange={(v) => set("altTitles", v)} />
        <TextInput label="Author" value={draft.author} onChange={(v) => set("author", v)} />
        <Select
          label="Status"
          value={draft.status}
          onChange={(v) => set("status", v)}
          options={(Object.keys(STATUS_LABEL) as NovelWiki["status"][]).map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
        />
      </div>
      <TextInput label="Genre tags" hint="Separate with commas." value={draft.genres} onChange={(v) => set("genres", v)} />
      <TextArea label="Premise" hint="The spoiler-free hook." rows={3} value={draft.premise} onChange={(v) => set("premise", v)} />
      <TextArea
        label="Plot overview"
        hint="Broad strokes without major twists. Leave a blank line between paragraphs."
        rows={6}
        value={draft.plotOverview}
        onChange={(v) => set("plotOverview", v)}
      />
    </FormShell>
  );
}

// ---- Spoilers & ending, timeline ----

export function SpoilersEditor({ wiki, onDone }: { wiki: NovelWiki; onDone: () => void }) {
  const [ending, setEnding] = useState(wiki.ending ?? "");
  const [rows, setRows] = useState<EventDraft[]>(() => wiki.majorSpoilers.map(eventDraft));
  const { run, busy, error, setError } = useSaveAction();

  const submit = async () => {
    let majorSpoilers;
    try {
      majorSpoilers = spoilersFromDrafts(rows);
    } catch (err) {
      setError(errorMessage(err));
      return;
    }
    const next: NovelWiki = { ...wiki, majorSpoilers, ending: ending.trim() || undefined };
    if (await run(next, `Edit spoilers & ending (${wiki.title})`)) onDone();
  };

  return (
    <FormShell title="Edit spoilers & ending" busy={busy} error={error} onSubmit={submit} onCancel={onDone}>
      <EventRows legend="Major spoilers" rows={rows} onChange={setRows} withSpoilerFlag={false} />
      <TextArea
        label="Ending"
        hint="Leave empty if the story is still ongoing."
        rows={5}
        value={ending}
        onChange={setEnding}
      />
    </FormShell>
  );
}

export function TimelineEditor({ wiki, onDone }: { wiki: NovelWiki; onDone: () => void }) {
  const [rows, setRows] = useState<EventDraft[]>(() => wiki.timeline.map(eventDraft));
  const { run, busy, error, setError } = useSaveAction();

  const submit = async () => {
    let timeline;
    try {
      timeline = eventsFromDrafts(rows);
    } catch (err) {
      setError(errorMessage(err));
      return;
    }
    if (await run({ ...wiki, timeline }, `Edit timeline (${wiki.title})`)) onDone();
  };

  return (
    <FormShell title="Edit timeline" busy={busy} error={error} onSubmit={submit} onCancel={onDone}>
      <EventRows legend="Events" rows={rows} onChange={setRows} withSpoilerFlag />
    </FormShell>
  );
}

function EventRows({
  legend,
  rows,
  onChange,
  withSpoilerFlag,
}: {
  legend: string;
  rows: EventDraft[];
  onChange: (rows: EventDraft[]) => void;
  withSpoilerFlag: boolean;
}) {
  const update = (i: number, patch: Partial<EventDraft>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <FieldGroup legend={legend} hint="Rows without a title are skipped.">
      {rows.map((r, i) => (
        <div key={i} className="row-editor row-editor--event">
          <input
            aria-label={`${legend} ${i + 1}: chapter`}
            placeholder="Ch."
            inputMode="decimal"
            value={r.chapter}
            onChange={(e) => update(i, { chapter: e.target.value })}
          />
          <input
            aria-label={`${legend} ${i + 1}: title`}
            placeholder="What happens"
            value={r.title}
            onChange={(e) => update(i, { title: e.target.value })}
          />
          <input
            aria-label={`${legend} ${i + 1}: details`}
            placeholder="Details (optional)"
            value={r.description}
            onChange={(e) => update(i, { description: e.target.value })}
          />
          {withSpoilerFlag && (
            <label className="checkbox">
              <input type="checkbox" checked={r.spoiler} onChange={(e) => update(i, { spoiler: e.target.checked })} />
              Spoiler
            </label>
          )}
          <button type="button" className="button button--small" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
            Remove
          </button>
        </div>
      ))}
      <div>
        <button type="button" className="button button--small" onClick={() => onChange([...rows, blankEvent()])}>
          + Add row
        </button>
      </div>
    </FieldGroup>
  );
}

// ---- Notes ----

/** The reader's own notes on a page. Anyone can read them; signed-in editors can change them. */
export function NotesPanel({
  notes,
  apply,
  subject,
}: {
  notes: string | undefined;
  /** Returns the wiki with these notes saved in the right place. */
  apply: (notes: string | undefined) => NovelWiki;
  /** What the notes are about, for the commit message. */
  subject: string;
}) {
  const { canEdit } = useNovelEditing();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(notes ?? "");
  const { run, busy, error } = useSaveAction();

  if (!notes && !canEdit) return null;

  const submit = async () => {
    if (await run(apply(draft.trim() || undefined), `Update notes on ${subject}`)) setEditing(false);
  };

  return (
    <section className="notes">
      <div className="notes__header">
        <h3>My notes</h3>
        {canEdit && !editing && (
          <button
            type="button"
            className="button button--small"
            onClick={() => {
              setDraft(notes ?? "");
              setEditing(true);
            }}
          >
            ✎ {notes ? "Edit notes" : "Add notes"}
          </button>
        )}
      </div>
      {editing ? (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <textarea
            aria-label={`Notes on ${subject}`}
            rows={6}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <p className="field__hint">Notes are saved in this wiki, so anyone who can see the wiki can read them.</p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button type="submit" className="button button--primary" disabled={busy}>
              {busy ? "Saving…" : "Save notes"}
            </button>
            <button type="button" className="button" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      ) : notes ? (
        <p className="notes__text">{notes}</p>
      ) : (
        <p className="muted">No notes yet.</p>
      )}
    </section>
  );
}
