// SPDX-License-Identifier: GPL-3.0-or-later
// Offline mode (docs/context/api.md): the offline flag (`api.ts`, set by any request that can't reach the server,
// cleared by any answer) is checked with `GET /System/Info/Public` on the active server - at launch, back from the
// background and on an account switch - and again with backoff while offline, so the app finds its way back without a
// network library. Back online: `onReconnect` listeners run (failed `useFetch` screens and paged lists load again).
import { AppState } from 'react-native';

import { getPublicSystemInfo, isOffline, resetOffline, subscribeOffline } from '@/api';
import { getSession, subscribeSession } from '@/session';

/** Checks while offline: 5 s, 10 s, 20 s, then every 30 s - only while the app is on screen. */
export const RECHECK_MS = [5_000, 10_000, 20_000, 30_000];

const reconnectListeners = new Set<() => void>();

/** Back online (the active server answered again): `useFetch` and `usePagedItems` load what failed. */
export function onReconnect(listener: () => void): () => void {
  reconnectListeners.add(listener);
  return () => reconnectListeners.delete(listener);
}

let started = false;
// Unknown at launch on iOS: counts as on screen.
let inBackground = AppState.currentState === 'background';
let checking: AbortController | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let attempt = 0;

/** Asks the active server whether it's there; the request itself sets or clears the offline flag. One at a time. */
export function checkConnection() {
  const server = getSession().active?.server.url;
  checking?.abort();
  checking = null;
  cancelTimer();
  if (!server) return; // signed out: nothing to check, an old server's answer doesn't count
  const controller = new AbortController();
  checking = controller;
  getPublicSystemInfo({ baseUrl: server }, controller.signal)
    .catch(() => {}) // offline: the flag says so, the next check is scheduled below
    .finally(() => {
      if (checking !== controller) return;
      checking = null;
      schedule();
    });
}

function cancelTimer() {
  if (timer) clearTimeout(timer);
  timer = null;
}

/** Next check while offline and on screen; none while online or in the background. */
function schedule() {
  cancelTimer();
  if (!isOffline() || inBackground || checking) return;
  timer = setTimeout(checkConnection, RECHECK_MS[Math.min(attempt, RECHECK_MS.length - 1)]);
  attempt++;
}

/** Once, from the root layout. */
export function initConnection() {
  if (started) return;
  started = true;

  // Notified on a change only. Listeners run after the request that changed it settled (they start requests of
  // their own; an error in one mustn't fail that request).
  subscribeOffline(() => {
    attempt = 0;
    schedule(); // offline: the first recheck; online: drops the scheduled one
    if (!isOffline()) queueMicrotask(() => reconnectListeners.forEach((l) => l()));
  });

  // Back on screen: from the background (also a background launch) the network may have changed - check at once.
  // From a quick switch (Control Center, where airplane mode goes off) only while offline, without waiting for the
  // backoff.
  let wasBackground = inBackground;
  AppState.addEventListener('change', (next) => {
    inBackground = next === 'background';
    if (inBackground) {
      wasBackground = true;
      cancelTimer();
      return;
    }
    if (next !== 'active') return;
    if (wasBackground) {
      wasBackground = false;
      attempt = 0;
      checkConnection();
    } else if (isOffline()) {
      checkConnection();
    }
  });

  // Another server: the old one's state doesn't apply - online until its own check says otherwise.
  let server = getSession().active?.server.url;
  subscribeSession(() => {
    const next = getSession().active?.server.url;
    if (next === server) return;
    server = next;
    attempt = 0;
    resetOffline();
    checkConnection();
  });

  // A background launch (an iOS download relaunch) checks once it comes on screen.
  if (!inBackground) checkConnection();
}
