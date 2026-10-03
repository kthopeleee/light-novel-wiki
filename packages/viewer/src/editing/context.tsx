import { createContext, useContext, useState } from "react";
import type { NovelWiki } from "@lnw/schema";

type NovelEditing = {
  canEdit: boolean;
  /** Saves the whole wiki with a commit message. Rejects with a readable error. */
  save: (next: NovelWiki, message: string) => Promise<void>;
};

const NovelEditingContext = createContext<NovelEditing>({
  canEdit: false,
  save: async () => {
    throw new Error("Sign in to edit.");
  },
});

export const NovelEditingProvider = NovelEditingContext.Provider;
export const useNovelEditing = () => useContext(NovelEditingContext);

/** A save with busy and error state, for forms. Resolves to true when it worked. */
export function useSaveAction() {
  const { save } = useNovelEditing();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (next: NovelWiki, message: string): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      await save(next, message);
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  return { run, busy, error, setError };
}

export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));
