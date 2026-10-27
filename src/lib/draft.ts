import { useSyncExternalStore } from "react";

/**
 * The composer unmounts when the popup changes stage or the app switches
 * between compact and full. Keeping the draft outside the component means a
 * typed message survives those transitions instead of disappearing.
 */
let draft = "";
const listeners = new Set<() => void>();

export const composerDraft = {
  get: () => draft,
  set: (next: string) => {
    if (next === draft) return;
    draft = next;
    for (const listener of listeners) listener();
  },
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function useComposerDraft(): [string, (next: string) => void] {
  const value = useSyncExternalStore(composerDraft.subscribe, composerDraft.get, composerDraft.get);
  return [value, composerDraft.set];
}
