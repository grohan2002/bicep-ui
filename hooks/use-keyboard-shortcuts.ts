"use client";

import { useEffect } from "react";

export interface Shortcut {
  key: string;
  meta?: boolean;
  shift?: boolean;
  ctrl?: boolean;
  handler: () => void;
  description: string;
}

export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip when focused on input/textarea (except Escape)
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
      if (isInput && e.key !== "Escape") return;

      for (const shortcut of shortcuts) {
        const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();
        const metaMatch = shortcut.meta ? e.metaKey || e.ctrlKey : true;
        const shiftMatch = shortcut.shift ? e.shiftKey : true;
        const ctrlMatch = shortcut.ctrl ? e.ctrlKey : true;

        if (keyMatch && metaMatch && shiftMatch && ctrlMatch) {
          e.preventDefault();
          shortcut.handler();
          return;
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shortcuts]);
}
