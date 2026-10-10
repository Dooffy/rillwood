// SPDX-License-Identifier: GPL-3.0-or-later
// Downloads tab (docs/context/downloads.md, Downloads screen): the list, a show's seasons and status wording (pure).
import type { Download } from '@/downloads';

/** One row of the tab: a movie (or a video) on its own, or every downloaded episode of a show. */
export type DownloadEntry =
  { kind: 'item'; id: string } | { kind: 'show'; seriesId: string; name: string; ids: string[]; total: number };

export type DownloadList = {
  /** Newest first: a show sits where its latest episode would. */
  entries: DownloadEntry[];
  /** Bytes of every download (what they take once done). */
  used: number;
  /** Changes when the space on disk does (one added / removed / finished): when to re-read free space. */
  storageKey: string;
};

/** An episode whose show name is unknown: from before the store kept it, and its item JSON was never saved. */
export const UNKNOWN_SHOW = 'TV Show';

/** An account's downloads as the tab lists them: one list, a row per movie and per show, running ones included. */
export function downloadList(downloads: readonly Download[], accountId: string | undefined): DownloadList {
  const mine = downloads.filter((d) => d.accountId === accountId).sort((a, b) => b.createdAt - a.createdAt);
  const entries: DownloadEntry[] = [];
  const shows = new Map<string, Extract<DownloadEntry, { kind: 'show' }>>();
  let used = 0;
  let done = 0;
  for (const d of mine) {
    used += d.total;
    if (d.status === 'done') done++;
    if (!d.seriesId) {
      entries.push({ kind: 'item', id: d.id });
      continue;
    }
    const show = shows.get(d.seriesId);
    if (show) {
      show.ids.push(d.id);
      show.total += d.total;
      if (show.name === UNKNOWN_SHOW && d.seriesName) show.name = d.seriesName;
      continue;
    }
    const fresh = {
      kind: 'show' as const,
      seriesId: d.seriesId,
      name: d.seriesName ?? UNKNOWN_SHOW,
      ids: [d.id],
      total: d.total,
    };
    shows.set(d.seriesId, fresh);
    entries.push(fresh);
  }
  return { entries, used, storageKey: `${mine.length}|${done}` };
}

export type DownloadSeason = { title: string; ids: string[] };

const LAST = Number.MAX_SAFE_INTEGER;

const seasonTitle = (n: number | undefined) => (n === undefined ? 'Episodes' : n === 0 ? 'Specials' : `Season ${n}`);

/** A show's downloaded episodes (one account) by season, in episode order; unnumbered ones last, by when added. */
export function showSeasons(
  downloads: readonly Download[],
  accountId: string | undefined,
  seriesId: string,
): DownloadSeason[] {
  const episodes = downloads
    .filter((d) => d.accountId === accountId && d.seriesId === seriesId)
    .sort(
      (a, b) =>
        (a.seasonNumber ?? LAST) - (b.seasonNumber ?? LAST) ||
        (a.episodeNumber ?? LAST) - (b.episodeNumber ?? LAST) ||
        a.createdAt - b.createdAt,
    );
  const seasons: DownloadSeason[] = [];
  for (const d of episodes) {
    const title = seasonTitle(d.seasonNumber);
    const last = seasons.at(-1);
    if (last?.title === title) last.ids.push(d.id);
    else seasons.push({ title, ids: [d.id] });
  }
  return seasons;
}

/** "1 episode", "3 episodes" */
export const episodeCount = (n: number) => `${n} ${n === 1 ? 'episode' : 'episodes'}`;

/** An episode's title in its show's list: "3. Pilot" (no number known → the title alone). */
export const episodeTitle = (d: Pick<Download, 'title' | 'episodeNumber'>) =>
  d.episodeNumber === undefined ? d.title : `${d.episodeNumber}. ${d.title}`;

/** What a download is doing, in words: "Paused", "Waiting for Wi-Fi", "Failed - not enough space". */
export function downloadStatus({ status, reason }: Pick<Download, 'status' | 'reason'>): string {
  // Wi-Fi only until the network setting lands (src/downloads.ts).
  if (reason === 'network' && status !== 'error' && status !== 'done') return 'Waiting for Wi-Fi';
  switch (status) {
    case 'queued':
      return 'Waiting';
    case 'downloading':
      return 'Downloading';
    case 'paused':
      return reason === 'auth' ? 'Paused - sign in again' : 'Paused';
    case 'error':
      // Native ends a 403 (downloading turned off for the user) as error + auth.
      if (reason === 'auth') return 'Failed - downloads not allowed';
      return reason === 'storage' ? 'Failed - not enough space' : reason === 'network' ? 'Failed - network' : 'Failed';
    case 'done':
      return 'Downloaded';
  }
}
