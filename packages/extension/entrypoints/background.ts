import { browser, type Browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { createNovel, findNovelForUrl, listNovels, saveWebChapter, type LibraryNovel } from "../lib/library";
import type { CaptureReply, MatchReply, Message, PendingNovel, SetupReply } from "../lib/messages";
import { sitePattern } from "../lib/urls";

const READER_SCRIPT = "/content-scripts/reader.js";
const SCRIPT_ID_PREFIX = "lnw-reader-";

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => void syncContentScripts());
  browser.runtime.onStartup.addListener(() => void syncContentScripts());
  // On Firefox the popup closes while the permission prompt is open, so finish here too.
  browser.permissions.onAdded.addListener(() => void finishSetup().then(syncContentScripts));
  browser.permissions.onRemoved.addListener(() => void syncContentScripts());

  browser.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
    handle(message, sender).then(sendResponse, (err: unknown) => {
      console.error("[Light Novel Wiki]", err);
      sendResponse(undefined);
    });
    return true; // keeps sendResponse alive for the async reply
  });
});

async function handle(message: Message, sender: Browser.runtime.MessageSender): Promise<unknown> {
  switch (message.type) {
    case "match": {
      const novel = await findNovelForUrl(message.url);
      const reply: MatchReply = { novel: novel ? { id: novel.id, title: novel.title, enabled: novel.enabled } : null };
      return reply;
    }
    case "capture":
      return capture(message.url, message.title, message.text, sender.tab?.id);
    case "page-changed":
      if (sender.tab?.id !== undefined) await setBadge(sender.tab.id, "");
      return undefined;
    case "finish-setup": {
      const novel = await finishSetup();
      await syncContentScripts();
      const reply: SetupReply = { novelId: novel?.id ?? null };
      return reply;
    }
    case "sync-sites":
      await syncContentScripts();
      return undefined;
    default:
      return undefined;
  }
}

async function capture(url: string, title: string, text: string, tabId: number | undefined): Promise<CaptureReply> {
  const novel = await findNovelForUrl(url);
  if (!novel) return { saved: false, reason: "no-novel" };
  if (!novel.enabled) return { saved: false, reason: "paused" };
  const result = await saveWebChapter(novel.id, url, title, text);
  if (tabId !== undefined) await setBadge(tabId, "✓");
  if (result.changed) broadcast();
  return { saved: true, novelTitle: novel.title, chapterCount: result.chapterCount, isNew: result.isNew };
}

let setupRun: Promise<LibraryNovel | null> | undefined;

/** Creates the novel the popup asked for, once its site access is granted. Safe to call twice. */
function finishSetup(): Promise<LibraryNovel | null> {
  setupRun ??= (async () => {
    const { pendingNovel } = (await browser.storage.local.get("pendingNovel")) as { pendingNovel?: PendingNovel };
    if (!pendingNovel) return null;
    const granted = await browser.permissions.contains({ origins: [sitePattern(pendingNovel.sitePrefix)] });
    if (!granted) return null;
    await browser.storage.local.remove("pendingNovel");
    const novel = await createNovel({ title: pendingNovel.title, source: "web", sitePrefix: pendingNovel.sitePrefix });
    broadcast();
    if (pendingNovel.tabId !== undefined) await injectReader(pendingNovel.tabId);
    return novel;
  })().finally(() => {
    setupRun = undefined;
  });
  return setupRun;
}

/** Saves the chapter on a tab that was already open before saving was switched on. */
async function injectReader(tabId: number) {
  try {
    await browser.scripting.executeScript({ target: { tabId }, files: [READER_SCRIPT] });
  } catch (err) {
    console.warn("[Light Novel Wiki] couldn't read that tab:", err);
  }
}

/**
 * Keeps one registered content script per site with an active novel and granted access,
 * and none for anything else. Run whenever novels or permissions change.
 */
async function syncContentScripts() {
  const novels = (await listNovels()).filter((n) => n.source === "web" && n.enabled && n.sitePrefix);
  const patterns = [...new Set(novels.map((n) => sitePattern(n.sitePrefix!)))];
  const granted = await Promise.all(patterns.map((p) => browser.permissions.contains({ origins: [p] })));
  const wanted = new Map(patterns.filter((_, i) => granted[i]).map((p) => [scriptId(p), p]));

  const registered = (await browser.scripting.getRegisteredContentScripts()).filter((s) =>
    s.id.startsWith(SCRIPT_ID_PREFIX),
  );
  const stale = registered.filter((s) => !wanted.has(s.id)).map((s) => s.id);
  if (stale.length) await browser.scripting.unregisterContentScripts({ ids: stale });

  const have = new Set(registered.map((s) => s.id));
  const missing = [...wanted].filter(([id]) => !have.has(id));
  if (missing.length) {
    await browser.scripting.registerContentScripts(
      missing.map(([id, pattern]) => ({ id, matches: [pattern], js: [READER_SCRIPT], runAt: "document_idle" as const })),
    );
  }
}

const scriptId = (pattern: string) => SCRIPT_ID_PREFIX + pattern.replace(/[^a-z0-9]+/gi, "_");

async function setBadge(tabId: number, text: string) {
  try {
    await browser.action.setBadgeBackgroundColor({ tabId, color: "#6440bf" });
    await browser.action.setBadgeText({ tabId, text });
  } catch {
    // The tab may have closed already.
  }
}

function broadcast() {
  // Extension pages (popup, library) listen for this; it's fine if none are open.
  browser.runtime.sendMessage({ type: "library-changed" } satisfies Message).catch(() => {});
}
