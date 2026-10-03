import { useEffect, useMemo, useState } from "react";
import type { Character, NovelWiki } from "@lnw/schema";
import { Chips, ErrorBox, Loading, NotFound, useDocumentTitle } from "../components/common";
import { WikiSearch } from "../components/Search";
import type { WikiDataSource } from "../data/source";
import { NovelEditingProvider, useNovelEditing } from "../editing/context";
import { NEW_ID } from "../editing/edit";
import { ArcEditor, EntryEditor } from "../editing/forms";
import { href } from "../router";
import { SpoilerProvider, SpoilerToggle } from "../spoilers";
import { useAsync } from "../useAsync";
import { findEntry, isEntryKind, SECTIONS, STATUS_LABEL } from "../wiki";
import { ArcDetail, ArcList } from "./sections/Arcs";
import { CharacterDetail, CharacterList } from "./sections/Characters";
import { EntryDetail, EntryList } from "./sections/Entries";
import { Overview } from "./sections/Overview";
import { Relationships } from "./sections/Relationships";
import { SpoilersPage } from "./sections/Spoilers";
import { Timeline } from "./sections/Timeline";

type Props = {
  source: WikiDataSource;
  novelId: string;
  section: string;
  entryId: string | undefined;
  siteTitle: string;
};

export function NovelPage({ source, novelId, ...rest }: Props) {
  const state = useAsync(() => source.getNovel(novelId), [source, novelId]);
  if (state.status === "loading") return <Loading />;
  if (state.status === "error") return <ErrorBox error={state.error} />;
  return <LoadedNovel initial={state.data} source={source} {...rest} />;
}

function LoadedNovel({
  initial,
  source,
  section,
  entryId,
  siteTitle,
}: Omit<Props, "novelId"> & { initial: NovelWiki }) {
  // Saves replace the wiki here right away; the public site catches up after it rebuilds.
  const [wiki, setWiki] = useState(initial);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => setWiki(initial), [initial]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  const editing = useMemo(
    () => ({
      canEdit: Boolean(source.saveNovel),
      save: async (next: NovelWiki, message: string) => {
        if (!source.saveNovel) throw new Error("Sign in to edit.");
        setWiki(await source.saveNovel(next, message));
        setToast("Saved. The public site updates in about a minute.");
      },
    }),
    [source],
  );

  return (
    <NovelEditingProvider value={editing}>
      <SpoilerProvider key={wiki.id} novelId={wiki.id}>
        <header className="novel-header">
          <div className="novel-header__main">
            <h1>
              {wiki.title}
              {wiki.sample && <span className="badge">Sample</span>}
            </h1>
            {wiki.altTitles.length > 0 && <p className="muted">{wiki.altTitles.join(" · ")}</p>}
            <p className="muted small">
              {[wiki.author, STATUS_LABEL[wiki.status], `${wiki.chapterCount} chapters`].filter(Boolean).join(" · ")}
            </p>
            <Chips items={wiki.genres} />
          </div>
          <div className="novel-header__tools">
            <WikiSearch wiki={wiki} />
            <SpoilerToggle />
          </div>
        </header>

        <nav className="tabs" aria-label="Wiki sections">
          {/* Editors see every tab, so they can add the first location, faction, etc. */}
          {SECTIONS.filter((s) => editing.canEdit || s.hasContent(wiki)).map((s) => (
            <a
              key={s.id}
              className="tab"
              href={href("n", wiki.id, s.id)}
              aria-current={s.id === section ? "page" : undefined}
            >
              {s.label}
            </a>
          ))}
        </nav>

        {/* Keyed by route so revealed spoilers and open forms don't carry over to the next page. */}
        <SectionContent
          key={`${section}/${entryId ?? ""}`}
          wiki={wiki}
          section={section}
          entryId={entryId}
          siteTitle={siteTitle}
        />

        {toast && (
          <p className="toast" role="status">
            {toast}
          </p>
        )}
      </SpoilerProvider>
    </NovelEditingProvider>
  );
}

const go = (url: string) => {
  window.location.hash = url;
};

function SectionContent({
  wiki,
  section,
  entryId,
  siteTitle,
}: {
  wiki: NovelWiki;
  section: string;
  entryId: string | undefined;
  siteTitle: string;
}) {
  const { canEdit } = useNovelEditing();
  const sectionLabel = SECTIONS.find((s) => s.id === section)?.label;
  const isNew = entryId === NEW_ID;
  const entry = entryId && !isNew && isEntryKind(section) ? findEntry(wiki, section, entryId) : undefined;
  const arc = entryId && section === "arcs" ? wiki.arcs.find((a) => a.id === entryId) : undefined;
  useDocumentTitle([
    isNew ? "New" : (entry?.name ?? arc?.name),
    sectionLabel && section !== "overview" ? sectionLabel : undefined,
    wiki.title,
    siteTitle,
  ]);

  const backToSection = (
    <NotFound
      message="That page isn't in this wiki."
      backHref={href("n", wiki.id, section)}
      backLabel={`Back to ${sectionLabel ?? "the wiki"}`}
    />
  );

  if (isNew) {
    if (!canEdit) return backToSection;
    const back = (id?: string) => go(id ? href("n", wiki.id, section, id) : href("n", wiki.id, section));
    if (isEntryKind(section)) return <EntryEditor wiki={wiki} kind={section} onDone={back} />;
    if (section === "arcs") return <ArcEditor wiki={wiki} onDone={back} />;
    return backToSection;
  }

  if (entryId && isEntryKind(section)) {
    if (!entry) return backToSection;
    return section === "characters" ? (
      <CharacterDetail wiki={wiki} character={entry as Character} />
    ) : (
      <EntryDetail wiki={wiki} kind={section} entry={entry} />
    );
  }
  if (entryId && section === "arcs") {
    return arc ? <ArcDetail wiki={wiki} arc={arc} /> : backToSection;
  }

  switch (section) {
    case "overview":
      return <Overview wiki={wiki} />;
    case "characters":
      return <CharacterList wiki={wiki} />;
    case "locations":
    case "factions":
    case "items":
    case "glossary":
      return <EntryList wiki={wiki} kind={section} />;
    case "arcs":
      return <ArcList wiki={wiki} />;
    case "relationships":
      return <Relationships wiki={wiki} />;
    case "timeline":
      return <Timeline wiki={wiki} />;
    case "spoilers":
      return <SpoilersPage wiki={wiki} />;
    default:
      return (
        <NotFound message="That page isn't in this wiki." backHref={href("n", wiki.id)} backLabel="Back to the overview" />
      );
  }
}
