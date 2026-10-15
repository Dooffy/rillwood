// SPDX-License-Identifier: GPL-3.0-or-later
// Auto-remove (docs/context/downloads.md, Offload): each finished download has a timer - Settings → Remove downloads,
// days from when it finished or its last Reset Timer - and, when Remove watched is on, goes sooner a cooldown after it
// was watched. Runs after every progress sync (launch, back from the background, reconnect, account switch), so the
// saved watched state is as fresh as it gets. Unfinished and playing downloads stay.
import type { BaseItemDto } from '@/api';
import { deleteDownloads, getDownloads, resetTimers, setWatched, type Download } from '@/downloads';
import { readSnapshotItem } from '@/downloadSnapshot';
import { getOffloadDays, getOffloadWatched, subscribeSettings } from '@/settings';
import { getPendingProgress, onSynced, pullNextRun, type PendingProgress } from '@/sync';

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

/**
 * When the item was watched (ms), or undefined while it isn't: progress not synced yet first, else the saved item's
 * UserData. A rewatch under way (a resume point on a watched item) isn't watched. `known` (the index's: the end of
 * playback here, or the time first seen) wins over an earlier date - the server stamps the session start.
 */
export function watchedTime(
  item: BaseItemDto | null,
  pending: PendingProgress | null,
  known: number | undefined,
  now: number,
): number | undefined {
  let at: number | undefined;
  if (pending?.watched) {
    if (pending.positionTicks > 0) return undefined;
    at = Date.parse(pending.lastPlayedAt) || now;
  } else {
    // Played offline past 5% after the last sync: in progress.
    if (pending && pending.positionTicks > 0) return undefined;
    const data = item?.UserData;
    if (!data?.Played || (data.PlaybackPositionTicks ?? 0) > 0) return undefined;
    at = (data.LastPlayedDate && Date.parse(data.LastPlayedDate)) || known || now;
  }
  return Math.max(at, known ?? 0);
}

type Timed = Pick<Download, 'status' | 'downloadedAt' | 'createdAt' | 'resetAt' | 'watchedAt'>;

/** Where the timer counts from: when it finished downloading, or the last Reset Timer if that came later. */
const timerStart = (d: Timed) => Math.max(d.downloadedAt ?? d.createdAt, d.resetAt ?? 0);

/** Watched since the timer started (a watch before a Reset Timer doesn't count). */
export const watchedSinceReset = (d: Timed) => d.watchedAt !== undefined && d.watchedAt > timerStart(d);

/**
 * When offload removes it, or undefined (not finished, both settings off): `days` after the timer start, or `hours`
 * after it was watched, whichever comes first. 0 = that rule off.
 */
export function expiresAt(d: Timed, days: number, hours: number): number | undefined {
  if (d.status !== 'done') return undefined;
  const byDate = days > 0 ? timerStart(d) + days * DAY : undefined;
  const byWatch = hours > 0 && watchedSinceReset(d) ? d.watchedAt! + hours * HOUR : undefined;
  if (byDate === undefined) return byWatch;
  return byWatch === undefined ? byDate : Math.min(byDate, byWatch);
}

/** Over 72 h: whole days ("5 days"); then whole hours ("45h"); under an hour: minutes, up ("12m"). Undefined once due. */
export function timeLeft(expires: number, now: number): string | undefined {
  if (expires <= now) return undefined;
  const minutes = Math.ceil((expires - now) / 60_000);
  if (minutes > 72 * 60) return `${Math.floor(minutes / 1440)} days`;
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h` : `${minutes}m`;
}

/** Row label: "Expires in 5 days", "Expires soon" when due (goes at the next cleanup); `soon` = under a day. */
export function expiryLabel(expires: number, now = Date.now()): { text: string; soon: boolean } {
  const left = timeLeft(expires, now);
  return { text: left ? `Expires in ${left}` : 'Expires soon', soon: expires - now < DAY };
}

/** Downloads removed in one cleanup and the space they took. */
export type OffloadResult = { count: number; bytes: number };

/** Downloads just watched to the end that Remove watched will take (the Keep toast). */
export type WatchedResult = { ids: string[]; hours: number };

// `account:item` of what the player has open: never removed under it.
const playing = new Map<string, number>();

const removedListeners = new Set<(result: OffloadResult) => void>();
const watchedListeners = new Set<(result: WatchedResult) => void>();

/** The account's finished downloads of an item marked watched now (the end of playback, not the session start). */
function markWatched(accountId: string, itemId: string, now: number) {
  const ids = getDownloads()
    .filter((d) => d.accountId === accountId && d.itemId === itemId && d.status === 'done')
    .map((d) => d.id);
  if (ids.length === 0) return;
  setWatched(new Map(ids.map((id) => [id, now])));
  const hours = getOffloadWatched();
  if (hours > 0) watchedListeners.forEach((l) => l({ ids, hours }));
}

/**
 * The player holds its item while open; the release says whether it played to the end (≥ 90%). Then its downloads
 * are watched from now, and the next sync run pulls the saved UserData (a watch here shows at the next foreground,
 * not up to 10 min later).
 */
export function holdPlaying(accountId: string, itemId: string): (finished: boolean) => void {
  const key = `${accountId}:${itemId}`;
  playing.set(key, (playing.get(key) ?? 0) + 1);
  return (finished) => {
    const n = (playing.get(key) ?? 1) - 1;
    if (n > 0) playing.set(key, n);
    else playing.delete(key);
    pullNextRun(accountId);
    if (finished) markWatched(accountId, itemId, Date.now());
  };
}

/** Each finished download's watched time from its saved item (read once per item) + progress not synced yet. */
function refreshWatched(downloads: readonly Download[], now: number) {
  const items = new Map<string, BaseItemDto | null>();
  const times = new Map<string, number | undefined>();
  for (const d of downloads) {
    if (d.status !== 'done') continue;
    const key = `${d.accountId}:${d.itemId}`;
    if (!items.has(key)) items.set(key, readSnapshotItem(d.path));
    const at = watchedTime(items.get(key) ?? null, getPendingProgress(d.accountId, d.itemId), d.watchedAt, now);
    if (at !== d.watchedAt) times.set(d.id, at);
  }
  if (times.size > 0) setWatched(times);
}

/** Removes every download past its time (all accounts: the settings are the phone's); null when none went. */
export function cleanup(now = Date.now()): OffloadResult | null {
  const days = getOffloadDays();
  const hours = getOffloadWatched();
  if (days === 0 && hours === 0) return null;
  // Only Remove watched needs the saved items read (the timer goes by dates alone).
  if (hours > 0) refreshWatched(getDownloads(), now);
  const due = getDownloads().filter((d) => {
    const at = expiresAt(d, days, hours);
    return at !== undefined && now >= at && !playing.has(`${d.accountId}:${d.itemId}`);
  });
  if (due.length === 0) return null;
  deleteDownloads(due.map((d) => d.id));
  return { count: due.length, bytes: due.reduce((sum, d) => sum + d.total, 0) };
}

/** Downloads removed by a cleanup (the freed-space toast). */
export function onOffload(listener: (result: OffloadResult) => void) {
  removedListeners.add(listener);
  return () => {
    removedListeners.delete(listener);
  };
}

/** A download watched to the end that Remove watched will take (the toast with Keep). */
export function onWatched(listener: (result: WatchedResult) => void) {
  watchedListeners.add(listener);
  return () => {
    watchedListeners.delete(listener);
  };
}

function run() {
  const result = cleanup();
  if (result) removedListeners.forEach((l) => l(result));
}

let started = false;

/**
 * Once, from the root layout: a cleanup after every sync run. A change to either setting restarts every download's
 * timer (and cancels pending watched removals) - a shorter period never removes anything at once.
 */
export function initOffload() {
  if (started) return;
  started = true;
  onSynced(run);
  let days = getOffloadDays();
  let hours = getOffloadWatched();
  subscribeSettings(() => {
    if (getOffloadDays() === days && getOffloadWatched() === hours) return;
    days = getOffloadDays();
    hours = getOffloadWatched();
    resetTimers(getDownloads().map((d) => d.id));
  });
}
