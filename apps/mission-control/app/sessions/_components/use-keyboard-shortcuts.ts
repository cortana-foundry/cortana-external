"use client";

import { useEffect } from "react";

type UseKeyboardShortcutsOptions = {
  enabled: boolean;
  onFocusComposer: () => void;
  onNextThread: () => void;
  onPrevThread: () => void;
  onOpenPalette?: () => void;
};

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

export function useKeyboardShortcuts({
  enabled,
  onFocusComposer,
  onNextThread,
  onPrevThread,
  onOpenPalette,
}: UseKeyboardShortcutsOptions) {
  useEffect(() => {
    if (!enabled) return;

    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;

      // ⌘K / Ctrl+K should work globally (even in inputs)
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        onOpenPalette?.();
        return;
      }

      // Other shortcuts don't work when in edit mode or with other modifiers
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const active = document.activeElement;
      if (isEditable(active)) return;

      if (event.key === "/") {
        event.preventDefault();
        onFocusComposer();
        return;
      }

      if (event.key === "j") {
        event.preventDefault();
        onNextThread();
        return;
      }

      if (event.key === "k") {
        event.preventDefault();
        onPrevThread();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled, onFocusComposer, onNextThread, onPrevThread, onOpenPalette]);
}
