// SPDX-License-Identifier: GPL-3.0-or-later
// Kids mode offline (docs/context/kids.md, Offline; screen draft 09): with the server out of reach, kids Home, a show's
// page and search come from the account's finished downloads - the item saved with each (its watched state too) and
// its art on the phone. Same filter as online, by the score saved with each download (`allowedOffline`; a kids account
// every download). Same order as kids Home: last watched first, then A-Z.
import type { BaseItemDto } from './api';
import type { Download } from './downloads';
import { documentUri, onDisk, readSnapshotItem } from './downloadSnapshot';
import { allowedOffline, type KidsFilter } from './kids';

export type OfflineKids = {
  /** Shows (with at least one downloaded episode) and movies, kids Home's order. */
  titles: BaseItemDto[];
  /** A show's downloaded episodes, in order (season, then episode). */
  episodes: ReadonlyMap<string, BaseItemDto[]>;
  /** Item id → its saved art on the phone (`file://`): a show or movie its poster, an episode its still. */
  art: ReadonlyMap<string, string>;
};

/** How the saved files are read (tests pass their own). */
export type OfflineFiles = {
  read: (path: string) => BaseItemDto | null;
  /** A relative path → its `file://` URI when the file is there. */
  uri: (path: string | undefined) => string | undefined;
};

const phoneFiles: OfflineFiles = {
  read: (path) => readSnapshotItem(path),
  uri: (path) => (path && onDisk(path) ? documentUri(path) : undefined),
};

/** Last played (ms) of an item or any episode of a show; 0 = never. */
const playedAt = (item: BaseItemDto) => Date.parse(item.UserData?.LastPlayedDate ?? '') || 0;

const byOrder = (a: BaseItemDto, b: BaseItemDto) =>
  (a.ParentIndexNumber ?? 0) - (b.ParentIndexNumber ?? 0) || (a.IndexNumber ?? 0) - (b.IndexNumber ?? 0);

/**
 * The account's downloads as kids mode shows them offline. Only finished ones (they play); an episode needs its saved
 * item (to know its show and place). Watched here and not synced yet (`watchedAt`) counts as watched.
 */
export function offlineKids(
  downloads: readonly Download[],
  accountId: string | undefined,
  filter: KidsFilter | undefined,
  files: OfflineFiles = phoneFiles,
): OfflineKids {
  const art = new Map<string, string>();
  const movies = new Map<string, BaseItemDto>();
  const shows = new Map<string, { show: BaseItemDto; episodes: Map<string, BaseItemDto>; last: number }>();

  for (const d of downloads) {
    if (d.accountId !== accountId || d.status !== 'done' || !allowedOffline(d.rating, filter)) continue;
    const saved = files.read(d.path);
    if (!saved) continue;
    const played = d.watchedAt !== undefined || !!saved.UserData?.Played;
    const item: BaseItemDto = {
      ...saved,
      UserData: { PlaybackPositionTicks: 0, ...saved.UserData, Played: played },
    };
    if (item.Type === 'Episode' && d.seriesId) {
      const entry = shows.get(d.seriesId) ?? {
        show: { Id: d.seriesId, Name: item.SeriesName ?? d.seriesName ?? 'TV Show', Type: 'Series' },
        episodes: new Map<string, BaseItemDto>(),
        last: 0,
      };
      entry.episodes.set(item.Id, item);
      entry.last = Math.max(entry.last, playedAt(item));
      shows.set(d.seriesId, entry);
      // An episode's poster is its show's; its own still for the episode.
      const poster = files.uri(d.snapshot?.poster);
      if (poster && !art.has(d.seriesId)) art.set(d.seriesId, poster);
      const still = files.uri(d.snapshot?.still) ?? files.uri(d.snapshot?.backdrop);
      if (still) art.set(item.Id, still);
    } else if (item.Type !== 'Episode') {
      movies.set(item.Id, item);
      const poster = files.uri(d.snapshot?.poster) ?? files.uri(d.snapshot?.backdrop);
      if (poster) art.set(item.Id, poster);
    }
  }

  const ranked = [
    ...[...shows.values()].map((s) => ({ item: s.show, last: s.last })),
    ...[...movies.values()].map((m) => ({ item: m, last: playedAt(m) })),
  ].sort((a, b) => b.last - a.last || (a.item.Name ?? '').localeCompare(b.item.Name ?? ''));

  return {
    titles: ranked.map((r) => r.item),
    episodes: new Map([...shows].map(([id, s]) => [id, [...s.episodes.values()].sort(byOrder)])),
    art,
  };
}

/** The show page's next one offline: the first downloaded episode not watched yet. */
export function offlineNext(episodes: readonly BaseItemDto[]): string | undefined {
  return episodes.find((e) => !e.UserData?.Played)?.Id;
}
