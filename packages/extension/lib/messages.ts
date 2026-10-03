import { browser } from "wxt/browser";

/** Messages between the content script, the popup, the library page, and the background. */
export type Message =
  /** Content script → background: does this page belong to a novel being saved? */
  | { type: "match"; url: string }
  /** Content script → background: here's the chapter on this page. */
  | { type: "capture"; url: string; title: string; text: string }
  /** Content script → background: the page moved to a new address (single-page sites). */
  | { type: "page-changed" }
  /** Popup → background: finish "Start saving" once site access is granted. */
  | { type: "finish-setup" }
  /** Pages → background: re-register content scripts after a novel was changed. */
  | { type: "sync-sites" }
  /** Popup → content script: save this page now, even if it doesn't look like a chapter. */
  | { type: "capture-now" }
  /** Background → extension pages: something in the library changed. */
  | { type: "library-changed" };

export type MatchReply = { novel: { id: string; title: string; enabled: boolean } | null };

export type CaptureReply =
  | { saved: true; novelTitle: string; chapterCount: number; isNew: boolean }
  | { saved: false; reason: "no-novel" | "paused" | "not-chapter" };

export type SetupReply = { novelId: string | null };

/** Waiting to be set up once site access is granted (the popup may close in the meantime). */
export type PendingNovel = { title: string; sitePrefix: string; tabId?: number };

export function send<T>(message: Message): Promise<T> {
  return browser.runtime.sendMessage(message) as Promise<T>;
}
