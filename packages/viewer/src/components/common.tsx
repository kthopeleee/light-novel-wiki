import { useEffect, type ReactNode } from "react";
import type { NovelWiki, Relationship } from "@lnw/schema";
import { href } from "../router";
import { findEntry, type EntryKind } from "../wiki";

export function useDocumentTitle(parts: (string | undefined)[]) {
  const title = parts.filter(Boolean).join(" · ");
  useEffect(() => {
    document.title = title;
  }, [title]);
}

export function Loading() {
  return (
    <p className="muted" role="status">
      Loading…
    </p>
  );
}

export function ErrorBox({ error }: { error: Error }) {
  return (
    <div className="error-box" role="alert">
      <p>
        <strong>Something went wrong.</strong>
      </p>
      <pre>{error.message}</pre>
      <p>
        <a href="#/">Back to all novels</a>
      </p>
    </div>
  );
}

export function NotFound({ message, backHref, backLabel }: { message: string; backHref: string; backLabel: string }) {
  return (
    <div className="empty">
      <p>{message}</p>
      <p>
        <a href={backHref}>{backLabel}</a>
      </p>
    </div>
  );
}

export function Chips({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="chips">
      {items.map((item) => (
        <li key={item} className="chip">
          {item}
        </li>
      ))}
    </ul>
  );
}

export function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\n{2,}/)
        .filter((p) => p.trim())
        .map((p, i) => (
          <p key={i}>{p}</p>
        ))}
    </>
  );
}

/** Links to another entry, or shows the raw id if the AI linked to something that doesn't exist. */
export function EntryLink({ wiki, kind, id }: { wiki: NovelWiki; kind: EntryKind; id: string }) {
  const entry = findEntry(wiki, kind, id);
  if (!entry) return <span className="muted">{id}</span>;
  return <a href={href("n", wiki.id, kind, id)}>{entry.name}</a>;
}

export function LinkList({ wiki, kind, ids }: { wiki: NovelWiki; kind: EntryKind; ids: string[] }) {
  return (
    <>
      {ids.map((id, i) => (
        <span key={id}>
          {i > 0 && ", "}
          <EntryLink wiki={wiki} kind={kind} id={id} />
        </span>
      ))}
    </>
  );
}

export function RelationshipLine({ wiki, rel }: { wiki: NovelWiki; rel: Relationship }) {
  return (
    <>
      <EntryLink wiki={wiki} kind="characters" id={rel.target} /> <span className="rel-type">{rel.type}</span>
      {rel.description && <span className="muted"> · {rel.description}</span>}
    </>
  );
}

export function Facts({ children }: { children: ReactNode }) {
  return <dl className="facts">{children}</dl>;
}

export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function Breadcrumb({ to, label }: { to: string; label: string }) {
  return (
    <p className="breadcrumb">
      <a href={to}>← {label}</a>
    </p>
  );
}
