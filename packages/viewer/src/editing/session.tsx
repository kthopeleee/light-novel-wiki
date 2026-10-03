import { createContext, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { GitHubClient, type RepoConfig } from "../github/client";

type Session = { token: string; login: string };

type EditorSession = {
  /** Undefined when this copy of the site isn't set up for editing. */
  repo: RepoConfig | undefined;
  session: Session | null;
  signIn: (token: string, remember: boolean) => Promise<void>;
  signOut: () => void;
};

const STORAGE_KEY = "lnw:editor";

const SessionContext = createContext<EditorSession>({
  repo: undefined,
  session: null,
  signIn: async () => {},
  signOut: () => {},
});

export const useEditorSession = () => useContext(SessionContext);

export function EditorSessionProvider({ repo, children }: { repo: RepoConfig | undefined; children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => (repo ? loadSession() : null));

  const value = useMemo<EditorSession>(
    () => ({
      repo,
      session,
      async signIn(rawToken, remember) {
        if (!repo) throw new Error("Editing isn't set up for this site.");
        const token = rawToken.trim();
        const client = new GitHubClient(token, repo);
        const { login } = await client.whoAmI();
        await client.checkRepoAccess();
        const next = { token, login };
        storeSession(next, remember);
        setSession(next);
      },
      signOut() {
        clearSession();
        setSession(null);
      },
    }),
    [repo, session],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** "Sign in to edit" in the site header, or who's signed in. */
export function EditorStatus() {
  const { repo, session, signOut } = useEditorSession();
  const [dialogOpen, setDialogOpen] = useState(false);
  if (!repo) return null;

  if (session) {
    return (
      <div className="editor-status">
        <span className="muted small">
          ✎ Editing as <strong>{session.login}</strong>
        </span>
        <button type="button" className="button button--small" onClick={signOut}>
          Sign out
        </button>
      </div>
    );
  }
  return (
    <>
      <button type="button" className="button button--small" onClick={() => setDialogOpen(true)}>
        Sign in to edit
      </button>
      {dialogOpen && <SignInDialog repo={repo} onClose={() => setDialogOpen(false)} />}
    </>
  );
}

function SignInDialog({ repo, onClose }: { repo: RepoConfig; onClose: () => void }) {
  const { signIn } = useEditorSession();
  const dialog = useRef<HTMLDialogElement>(null);
  const [token, setToken] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(token, remember);
      dialog.current?.close();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog ref={dialog} className="dialog" onClose={onClose} aria-labelledby="sign-in-title">
      <form className="form" onSubmit={submit}>
        <h2 id="sign-in-title">Sign in to edit</h2>
        <p>
          Edits are saved straight to the{" "}
          <a href={`https://github.com/${repo.owner}/${repo.repo}`} target="_blank" rel="noreferrer">
            {repo.owner}/{repo.repo}
          </a>{" "}
          repository, so you need a GitHub token that's allowed to change it.
        </p>
        <ol className="steps">
          <li>
            Open{" "}
            <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">
              GitHub's new token page
            </a>
            .
          </li>
          <li>
            Under <strong>Repository access</strong>, choose <strong>Only select repositories</strong> and pick{" "}
            <strong>{repo.repo}</strong>.
          </li>
          <li>
            Under <strong>Permissions</strong>, add <strong>Contents</strong> and set it to{" "}
            <strong>Read and write</strong>.
          </li>
          <li>Generate the token and paste it below.</li>
        </ol>
        <label className="field">
          <span className="field__label">Token</span>
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="github_pat_…"
          />
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Remember on this device
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="submit" className="button button--primary" disabled={busy || !token.trim()}>
            {busy ? "Checking…" : "Sign in"}
          </button>
          <button type="button" className="button" onClick={() => dialog.current?.close()}>
            Cancel
          </button>
        </div>
        <p className="muted small">The token stays in this browser and is only ever sent to GitHub.</p>
      </form>
    </dialog>
  );
}

function loadSession(): Session | null {
  for (const storage of [safeStorage("local"), safeStorage("session")]) {
    try {
      const raw = storage?.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as Session;
    } catch {
      // Unreadable or corrupt; treat as signed out.
    }
  }
  return null;
}

function storeSession(session: Session, remember: boolean) {
  clearSession();
  try {
    safeStorage(remember ? "local" : "session")?.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Storage blocked: the session still lasts until the page is closed.
  }
}

function clearSession() {
  for (const storage of [safeStorage("local"), safeStorage("session")]) {
    try {
      storage?.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to clear.
    }
  }
}

function safeStorage(kind: "local" | "session"): Storage | undefined {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return undefined;
  }
}
