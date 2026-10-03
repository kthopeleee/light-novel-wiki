import { useEffect, useRef } from "react";
import { browser } from "wxt/browser";
import type { Message } from "./messages";

/** Calls `onChange` whenever the background saves or deletes something in the library. */
export function useLibraryChanges(onChange: () => void | Promise<void>) {
  const latest = useRef(onChange);
  latest.current = onChange;
  useEffect(() => {
    const listener = (message: Message) => {
      if (message?.type === "library-changed") void latest.current();
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, []);
}
