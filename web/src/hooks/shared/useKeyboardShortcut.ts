import { useEffect } from "react";

type ShortcutHandler = (e: KeyboardEvent) => void;

// Central registry of shortcut combos to their active handlers
const registry = new Map<string, Set<ShortcutHandler>>();

// Global event listener that parses keyboard events and executes registered handlers
let isListenerAttached = false;

const globalKeydownHandler = (e: KeyboardEvent) => {
  const pressedKeys: string[] = [];

  if (e.metaKey) pressedKeys.push("meta");
  if (e.ctrlKey) pressedKeys.push("ctrl");
  if (e.altKey) pressedKeys.push("alt");
  if (e.shiftKey) pressedKeys.push("shift");

  // Handle standard key representations
  const key = e.key.toLowerCase();
  if (key !== "meta" && key !== "control" && key !== "alt" && key !== "shift") {
    // Translate space or other characters
    if (key === " ") pressedKeys.push("space");
    else pressedKeys.push(key);
  }

  // Generate lookup keys
  const lookupKeys = new Set<string>();

  // Helper to build canonical key representations
  const canonicalCombo = pressedKeys.sort().join("+");
  lookupKeys.add(canonicalCombo);

  // Translate "meta" or "ctrl" as "mod" for cross-platform support
  const modPressedKeys = pressedKeys.map((k) => (k === "meta" || k === "ctrl" ? "mod" : k));
  const modCombo = modPressedKeys.sort().join("+");
  lookupKeys.add(modCombo);

  // Check if focus is in an input-like element
  const target = e.target as HTMLElement | null;
  const isInputFocused =
    target &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable);

  // Iterate over matching lookups in the registry
  for (const lookup of lookupKeys) {
    const handlers = registry.get(lookup);
    if (handlers && handlers.size > 0) {
      // By default, skip if input is focused, unless the combo is 'mod+k' or opts in
      // Let's pass the event to handlers, they can handle specific overrides
      handlers.forEach((handler) => {
        // Special guard for input typing vs. search dialog trigger
        if (isInputFocused && lookup !== "mod+k" && lookup !== "meta+k" && lookup !== "ctrl+k") {
          return;
        }
        e.preventDefault();
        handler(e);
      });
    }
  }
};

const attachGlobalListener = () => {
  if (!isListenerAttached && typeof window !== "undefined") {
    window.addEventListener("keydown", globalKeydownHandler);
    isListenerAttached = true;
  }
};

const detachGlobalListener = () => {
  if (isListenerAttached && typeof window !== "undefined" && registry.size === 0) {
    window.removeEventListener("keydown", globalKeydownHandler);
    isListenerAttached = false;
  }
};

/**
 * Registers a global keyboard shortcut with single-event-listener deduping.
 *
 * @param combo Keyboard combination, e.g. "mod+k", "mod+\\", "escape"
 * @param handler Callback to trigger when shortcut is matched
 * @param enabled Option to temporarily disable listener
 */
export function useKeyboardShortcut(
  combo: string,
  handler: ShortcutHandler,
  opts: { enabled?: boolean } = {}
) {
  const enabled = opts.enabled !== false;

  useEffect(() => {
    if (!enabled) return;

    // Normalize combo notation (e.g. command -> meta, control -> ctrl, command/ctrl -> mod)
    const normalizedCombo = combo
      .toLowerCase()
      .split("+")
      .map((k) => {
        if (k === "cmd" || k === "command") return "meta";
        if (k === "control") return "ctrl";
        return k;
      })
      .sort()
      .join("+");

    if (!registry.has(normalizedCombo)) {
      registry.set(normalizedCombo, new Set());
    }

    const handlers = registry.get(normalizedCombo)!;
    handlers.add(handler);
    attachGlobalListener();

    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) {
        registry.delete(normalizedCombo);
      }
      detachGlobalListener();
    };
  }, [combo, handler, enabled]);
}
