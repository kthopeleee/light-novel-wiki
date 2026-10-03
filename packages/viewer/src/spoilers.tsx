import { createContext, useContext, useState, type ReactNode } from "react";

type SpoilerSettings = { revealAll: boolean; setRevealAll: (value: boolean) => void };

const SpoilerContext = createContext<SpoilerSettings>({ revealAll: false, setRevealAll: () => {} });

export const useSpoilers = () => useContext(SpoilerContext);

/** Remembers per novel whether all spoilers are shown. Hidden by default. */
export function SpoilerProvider({ novelId, children }: { novelId: string; children: ReactNode }) {
  const storageKey = `lnw:spoilers:${novelId}`;
  const [revealAll, setState] = useState(() => readFlag(storageKey));
  const setRevealAll = (value: boolean) => {
    setState(value);
    writeFlag(storageKey, value);
  };
  return <SpoilerContext.Provider value={{ revealAll, setRevealAll }}>{children}</SpoilerContext.Provider>;
}

/**
 * Hidden content isn't rendered at all until revealed, so it can't leak through
 * text selection, screen readers, or a half-loaded blur effect.
 */
export function Spoiler({
  children,
  label = "Spoiler",
  inline = false,
}: {
  children: ReactNode;
  label?: string;
  inline?: boolean;
}) {
  const { revealAll } = useSpoilers();
  const [revealed, setRevealed] = useState(false);
  const variant = inline ? " spoiler--inline" : "";

  if (revealAll || revealed) {
    const Tag = inline ? "span" : "div";
    return <Tag className={`spoiler spoiler--open${variant}`}>{children}</Tag>;
  }
  return (
    <button type="button" className={`spoiler spoiler--hidden${variant}`} onClick={() => setRevealed(true)}>
      <span aria-hidden="true">🔒 </span>
      {label} · click to reveal
    </button>
  );
}

export function SpoilerToggle() {
  const { revealAll, setRevealAll } = useSpoilers();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={revealAll}
      className={`toggle${revealAll ? " toggle--on" : ""}`}
      onClick={() => setRevealAll(!revealAll)}
    >
      <span className="toggle__track" aria-hidden="true">
        <span className="toggle__thumb" />
      </span>
      Show all spoilers
    </button>
  );
}

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "shown";
  } catch {
    return false;
  }
}

function writeFlag(key: string, value: boolean) {
  try {
    if (value) localStorage.setItem(key, "shown");
    else localStorage.removeItem(key);
  } catch {
    // Storage can be blocked (private windows); the toggle still works for this visit.
  }
}
