import { useId, useMemo, useState } from "react";
import type { NovelWiki } from "@lnw/schema";
import { href } from "../router";
import { KIND_LABEL, searchWiki } from "../wiki";

export function WikiSearch({ wiki }: { wiki: NovelWiki }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const listId = useId();
  const hits = useMemo(() => searchWiki(wiki, query), [wiki, query]);
  const showResults = open && query.trim() !== "";

  const go = (url: string) => {
    window.location.hash = url;
    setQuery("");
    setOpen(false);
  };

  return (
    <div
      className="search"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <input
        type="search"
        role="combobox"
        aria-label="Search this wiki"
        aria-controls={listId}
        aria-expanded={showResults}
        aria-autocomplete="list"
        placeholder="Search names, places, items…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          const first = hits[0];
          if (e.key === "Enter" && first) go(href("n", wiki.id, first.kind, first.entry.id));
          if (e.key === "Escape") {
            setQuery("");
            setOpen(false);
          }
        }}
      />
      {showResults && (
        // preventDefault keeps focus in the input so clicks on results aren't lost to blur.
        <ul className="search__results" id={listId} role="listbox" onMouseDown={(e) => e.preventDefault()}>
          {hits.length === 0 ? (
            <li className="search__empty">No matches</li>
          ) : (
            hits.map((hit) => {
              const url = href("n", wiki.id, hit.kind, hit.entry.id);
              return (
                <li key={`${hit.kind}/${hit.entry.id}`} role="option" aria-selected={false}>
                  <a
                    href={url}
                    onClick={(e) => {
                      e.preventDefault();
                      go(url);
                    }}
                  >
                    <span>{hit.entry.name}</span>
                    <span className="search__kind">{KIND_LABEL[hit.kind]}</span>
                  </a>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
