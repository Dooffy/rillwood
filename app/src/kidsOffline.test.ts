// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from '@jest/globals';

import type { BaseItemDto } from './api';
import type { Download } from './downloads';
import { offlineKids, offlineNext, type OfflineFiles } from './kidsOffline';

const dl = (itemId: string, fields: Partial<Download> = {}): Download => ({
  id: `a:${itemId}:${itemId}`,
  accountId: 'a',
  itemId,
  sourceId: itemId,
  title: itemId,
  path: `downloads/a/${itemId}/${itemId}.mkv`,
  status: 'done',
  bytes: 1,
  total: 1,
  createdAt: 0,
  pinned: false,
  snapshot: { poster: `p/${itemId}`, backdrop: `b/${itemId}`, subtitles: [] },
  ...fields,
});
const ep = (Id: string, season: number, episode: number, extra: Partial<BaseItemDto> = {}): BaseItemDto => ({
  Id,
  Name: Id,
  Type: 'Episode',
  SeriesId: 'trains',
  SeriesName: 'Tiny Trains',
  ParentIndexNumber: season,
  IndexNumber: episode,
  UserData: { PlaybackPositionTicks: 0, Played: false },
  ...extra,
});
const movie = (Id: string, lastPlayed?: string): BaseItemDto => ({
  Id,
  Name: Id,
  Type: 'Movie',
  UserData: { PlaybackPositionTicks: 0, Played: false, LastPlayedDate: lastPlayed },
});

/** Saved items by item id; every art file "on the phone" except `missing/...`. */
function files(items: BaseItemDto[]): OfflineFiles {
  const byId = new Map(items.map((i) => [i.Id, i]));
  return {
    read: (path) => byId.get(path.split('/')[2]) ?? null,
    uri: (path) => (path && !path.startsWith('missing/') ? `file:///${path}` : undefined),
  };
}

const saved = [
  ep('e2', 1, 2),
  ep('e1', 1, 1, { UserData: { PlaybackPositionTicks: 0, Played: true, LastPlayedDate: '2026-11-20T10:00:00Z' } }),
  ep('s2e1', 2, 1),
  movie('Pond Jumpers', '2026-11-01T10:00:00Z'),
  movie('Ants'),
  movie('Zebras'),
  movie('Scary', undefined),
];
const episodeDl = (id: string, fields: Partial<Download> = {}) =>
  dl(id, {
    seriesId: 'trains',
    seriesName: 'Tiny Trains',
    snapshot: { poster: 'p/trains', still: `s/${id}`, subtitles: [] },
    ...fields,
  });
const downloads = [
  episodeDl('e2'),
  episodeDl('e1'),
  episodeDl('s2e1'),
  dl('Pond Jumpers', { rating: 0 }),
  dl('Ants'),
  dl('Zebras', { rating: 7 }),
  dl('Scary', { rating: 17 }),
];
const ids = (list: readonly BaseItemDto[]) => list.map((i) => i.Id);

describe('offlineKids', () => {
  it('a kids account: every finished download, shows from their episodes, last watched first then A-Z', () => {
    const off = offlineKids(downloads, 'a', undefined, files(saved));
    expect(ids(off.titles)).toEqual(['trains', 'Pond Jumpers', 'Ants', 'Scary', 'Zebras']);
    expect(off.titles[0]).toMatchObject({ Id: 'trains', Name: 'Tiny Trains', Type: 'Series' });
    expect(ids(off.episodes.get('trains') ?? [])).toEqual(['e1', 'e2', 's2e1']);
  });

  it('a shared phone: only scores up to the age; unrated only when unrated videos show', () => {
    const at7 = offlineKids(downloads, 'a', { age: 7, unrated: false }, files(saved));
    expect(ids(at7.titles)).toEqual(['Pond Jumpers', 'Zebras']);
    const withUnrated = offlineKids(downloads, 'a', { age: 3, unrated: true }, files(saved));
    expect(ids(withUnrated.titles)).toEqual(['trains', 'Pond Jumpers', 'Ants']);
  });

  it("not finished, another account's, or no saved item: left out", () => {
    const off = offlineKids(
      [dl('Ants', { status: 'downloading' }), dl('Zebras', { accountId: 'b' }), dl('Unknown')],
      'a',
      undefined,
      files(saved),
    );
    expect(off.titles).toEqual([]);
  });

  it("the art on the phone: a show its episodes' show poster, an episode its still, a movie its poster", () => {
    const off = offlineKids(
      [...downloads, dl('Lost', { snapshot: { poster: 'missing/x', subtitles: [] } })],
      'a',
      undefined,
      files([...saved, movie('Lost')]),
    );
    expect(off.art.get('trains')).toBe('file:///p/trains');
    expect(off.art.get('e1')).toBe('file:///s/e1');
    expect(off.art.get('Ants')).toBe('file:///p/Ants');
    expect(off.art.has('Lost')).toBe(false);
  });

  it('watched here and not synced yet counts as watched; the next = the first not watched', () => {
    const off = offlineKids(
      [episodeDl('e1'), episodeDl('e2', { watchedAt: 5 }), episodeDl('s2e1')],
      'a',
      undefined,
      files(saved),
    );
    const list = off.episodes.get('trains') ?? [];
    expect(list.map((e) => e.UserData?.Played)).toEqual([true, true, false]);
    expect(offlineNext(list)).toBe('s2e1');
    expect(offlineNext([])).toBeUndefined();
  });
});
