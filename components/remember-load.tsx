"use client";

// Client component because the last good load is remembered in the browser:
// when the database is down, the server has nowhere to read it from.

import { useEffect } from "react";

const LAST_LOADED_KEY = "callsheet:last-loaded-at";

export function RememberLoad({ loadedAt }: { loadedAt: string }) {
  useEffect(() => {
    try {
      localStorage.setItem(LAST_LOADED_KEY, loadedAt);
    } catch {
      // Storage can be unavailable, e.g. in private browsing. Nothing to do.
    }
  }, [loadedAt]);
  return null;
}

export function readLastLoaded(): string | null {
  try {
    return localStorage.getItem(LAST_LOADED_KEY);
  } catch {
    return null;
  }
}

export function subscribeToLastLoaded(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}
