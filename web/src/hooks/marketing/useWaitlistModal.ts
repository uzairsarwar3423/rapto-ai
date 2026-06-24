"use client";

/**
 * useWaitlistModal.ts
 * Global modal open/close state for the waitlist modal.
 * Uses a simple module-level subscriber pattern to allow any component
 * to trigger the modal without prop drilling.
 */

import { useState, useEffect, useCallback } from "react";

type Listener = (open: boolean) => void;

const listeners = new Set<Listener>();
let globalOpen = false;

function broadcast(open: boolean) {
  globalOpen = open;
  listeners.forEach((fn) => fn(open));
}

/** Call this from any component to open the modal */
export function openWaitlistModal() {
  broadcast(true);
}

/** Call this from any component to close the modal */
export function closeWaitlistModal() {
  broadcast(false);
}

/** Hook to subscribe to modal state — used inside the modal component */
export function useWaitlistModal() {
  const [isOpen, setIsOpen] = useState(globalOpen);

  useEffect(() => {
    const handler = (open: boolean) => setIsOpen(open);
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);

  const open = useCallback(() => broadcast(true), []);
  const close = useCallback(() => broadcast(false), []);
  const toggle = useCallback(() => broadcast(!globalOpen), []);

  return { isOpen, open, close, toggle };
}
