// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from '@jest/globals';

import type { BaseItemDto } from './api';
import type { Download } from './downloads';
import { kidsDownloadSections, episodesToKeep, hiddenDownloads, playableEpisodes, showFiles } from './kidsDownloads';

const ep = (Id: string, season: number, played = false, extra: Partial<BaseItemDto> = {}): BaseItemDto => ({
  Id,
  Name: Id,
  Type: 'Episode',
  ParentIndexNumber: season,
  UserData: { PlaybackPositionTicks: 0, Played: played },
  ...extra,
});
const title = (Id: string, Type: string): BaseItemDto => ({ Id, Name: Id, Type });

// S0 special, S1 e1-e4 (e1-e2 watched), a missing one, S2 e5-e8.
const episodes = [
  ep('sp', 0),
  ep('e1', 1, true),
  ep('e2', 1, true),
  ep('e3', 1),
  ep('gone', 1, false, { LocationType: 'Virtual' }),
  ep('e4', 1),
  ep('e5', 2),
  ep('e6', 2),
  ep('e7', 2),
  ep('e8', 2),
];
const ids = (list: BaseItemDto[]) => list.map((e) => e.Id);

describe('kids downloads', () => {
  it('asks for every episode of a show with its files', () => {
    expect(showFiles('a/b')).toEqual({
      path: '/Shows/a%2Fb/Episodes',
      query: { fields: 'MediaSources', isMissing: false },
    });
  });

  it('plays only episodes with a file, no specials', () => {
    expect(ids(playableEpisodes(episodes))).toEqual(['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8']);
  });

  it('Next 5: from Next Up across seasons', () => {
    expect(ids(episodesToKeep(episodes, 'e4'))).toEqual(['e4', 'e5', 'e6', 'e7', 'e8']);
    expect(ids(episodesToKeep(episodes, 'e7'))).toEqual(['e7', 'e8']);
  });

  it('Next 5 without Next Up: the first unwatched, else the last five', () => {
    expect(ids(episodesToKeep(episodes, undefined))).toEqual(['e3', 'e4', 'e5', 'e6', 'e7']);
    const allWatched = episodes.map((e) => ({ ...e, UserData: { PlaybackPositionTicks: 0, Played: true } }));
    expect(ids(episodesToKeep(allWatched, undefined))).toEqual(['e4', 'e5', 'e6', 'e7', 'e8']);
    expect(episodesToKeep([], undefined)).toEqual([]);
  });

  it('lists shows and movies apart, the ones on the phone first, then A-Z', () => {
    const titles = [title('Zoo', 'Series'), title('Ants', 'Series'), title('Bees', 'Series'), title('Moo', 'Movie')];
    const { shows, movies } = kidsDownloadSections(titles, new Set(['Zoo']), undefined);
    expect(ids(shows)).toEqual(['Zoo', 'Ants', 'Bees']);
    expect(ids(movies)).toEqual(['Moo']);
  });

  it('narrows by any part of the name, any case', () => {
    const titles = [title('Cloud Kittens', 'Series'), title('Kites', 'Movie'), title('Trains', 'Series')];
    const found = kidsDownloadSections(titles, new Set(), 'KIT');
    expect(ids(found.shows)).toEqual(['Cloud Kittens']);
    expect(ids(found.movies)).toEqual(['Kites']);
  });
});

describe('hiddenDownloads', () => {
  const dl = (itemId: string, total: number, fields: Partial<Download> = {}) =>
    ({ id: itemId, accountId: 'a', itemId, total, ...fields }) as Download;

  it("counts the account's downloads the filter keeps out offline, with their size", () => {
    const downloads = [
      dl('e1', 1, { seriesId: 'trains', rating: 0 }),
      dl('e9', 2, { seriesId: 'grownup', rating: 14 }),
      dl('pond', 3, { rating: 7 }),
      dl('home-video', 4),
      dl('other', 5, { accountId: 'b', rating: 17 }),
    ];
    expect(hiddenDownloads(downloads, 'a', { age: 7, unrated: false })).toEqual({ count: 2, bytes: 6 });
    expect(hiddenDownloads(downloads, 'a', { age: 7, unrated: true })).toEqual({ count: 1, bytes: 2 });
    // A kids account (no filter): none.
    expect(hiddenDownloads(downloads, 'a', undefined)).toEqual({ count: 0, bytes: 0 });
  });
});
