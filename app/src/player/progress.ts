// SPDX-License-Identifier: GPL-3.0-or-later
// Playback position outside React state (docs/context/player.md): the screen writes it on every progress event,
// only the controls that show it re-render.
import { useSyncExternalStore } from 'react';

export type Progress = { position: number; duration: number };

export type ProgressStore = {
  get(): Progress;
  set(next: Partial<Progress>): void;
  subscribe(listener: () => void): () => void;
};

export function createProgress(position = 0): ProgressStore {
  let value: Progress = { position, duration: 0 };
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      if (Object.entries(next).every(([k, v]) => value[k as keyof Progress] === v)) return;
      value = { ...value, ...next };
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useProgress(store: ProgressStore): Progress {
  return useSyncExternalStore(store.subscribe, store.get);
}
