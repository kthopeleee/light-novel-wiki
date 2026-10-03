// Runs on sites where the reader turned on "save as you read". Watches the page, and once
// a chapter has loaded, sends its text to the background to be saved in the library.
import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";
import { extractChapter, textHash } from "../lib/extract";
import type { CaptureReply, MatchReply, Message } from "../lib/messages";
import { send } from "../lib/messages";

/** Wait this long after the page stops changing before reading it… */
const QUIET_MS = 1200;
/** …but never longer than this, for pages that never stop changing (ads, timers). */
const MAX_WAIT_MS = 5000;

declare global {
  // eslint-disable-next-line no-var
  var __lnwReaderGeneration: number | undefined;
}

export default defineContentScript({
  // Registered at runtime, one site at a time, only after the reader grants access.
  registration: "runtime",
  matches: [],
  main(ctx) {
    // The popup may inject this into a tab where it's already running. The newest copy
    // takes over and older ones stop themselves, so exactly one is always watching.
    const generation = (globalThis.__lnwReaderGeneration ?? 0) + 1;
    globalThis.__lnwReaderGeneration = generation;
    const superseded = () => globalThis.__lnwReaderGeneration !== generation;

    let currentUrl = location.href;
    let sentHash = "";
    let novelForPage: MatchReply["novel"] | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let firstScheduledAt = 0;

    const capture = async (force = false): Promise<CaptureReply> => {
      novelForPage ??= (await send<MatchReply>({ type: "match", url: location.href })).novel;
      if (!novelForPage) return { saved: false, reason: "no-novel" };
      if (!novelForPage.enabled && !force) return { saved: false, reason: "paused" };
      const chapter = extractChapter(document, { force });
      if (!chapter) return { saved: false, reason: "not-chapter" };
      const hash = textHash(chapter.title + chapter.text);
      if (hash === sentHash && !force) return { saved: false, reason: "not-chapter" };
      const reply = await send<CaptureReply>({ type: "capture", url: location.href, ...chapter });
      if (reply?.saved) sentHash = hash;
      return reply;
    };

    const schedule = () => {
      const nowMs = Date.now();
      if (!timer) firstScheduledAt = nowMs;
      clearTimeout(timer);
      const wait = Math.max(0, Math.min(QUIET_MS, firstScheduledAt + MAX_WAIT_MS - nowMs));
      timer = setTimeout(() => {
        timer = undefined;
        if (superseded()) return stop();
        void capture().catch(() => {});
      }, wait);
    };

    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

    // Single-page sites change the address without reloading; notice that and start over.
    const poll = setInterval(() => {
      if (superseded()) return stop();
      if (location.href === currentUrl) return;
      currentUrl = location.href;
      sentHash = "";
      novelForPage = undefined;
      void send({ type: "page-changed" }).catch(() => {});
      schedule();
    }, 1000);

    const onMessage = (message: Message, _sender: unknown, sendResponse: (reply: CaptureReply) => void) => {
      if (message.type !== "capture-now" || superseded()) return undefined;
      capture(true).then(sendResponse, () => sendResponse({ saved: false, reason: "not-chapter" }));
      return true;
    };
    browser.runtime.onMessage.addListener(onMessage);

    function stop() {
      observer.disconnect();
      clearInterval(poll);
      clearTimeout(timer);
      browser.runtime.onMessage.removeListener(onMessage);
    }
    ctx.onInvalidated(stop);

    schedule();
  },
});
