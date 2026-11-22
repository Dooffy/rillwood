// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from '@jest/globals';

import {
  bytesOf,
  downloadList,
  downloadStatus,
  episodeCount,
  episodeTitle,
  filterDownloads,
  groupStatus,
  showSeasons,
} from './downloadList';
import type { Download, DownloadSummary } from './downloads';

const d = (id: string, fields: Partial<Download> = {}): Download => ({
  id,
  accountId: 'a1',
  itemId: id,
  sourceId: 'ms',
  title: id,
  path: `downloads/a1/${id}/ms.mkv`,
  status: 'queued',
  bytes: 0,
  total: 100,
  createdAt: 0,
  pinned: false,
  ...fields,
});

describe('downloadList', () => {
  it('lists movies and shows newest first, a show where its latest episode is, with its name and size', () => {
    const list = downloadList(
      [
        d('e1', { seriesId: 's', seriesName: 'Pioneer One', createdAt: 2, total: 300 }),
        d('m1', { createdAt: 1, status: 'done' }),
        d('e2', { seriesId: 's', seriesName: 'Pioneer One', createdAt: 4, status: 'done' }),
        d('m2', { createdAt: 3, status: 'paused' }),
        d('x1', { seriesId: 'other', createdAt: 5 }),
      ],
      'a1',
    );
    expect(list.entries).toEqual([
      { kind: 'show', seriesId: 'other', name: 'TV Show', ids: ['x1'], total: 100 },
      { kind: 'show', seriesId: 's', name: 'Pioneer One', ids: ['e2', 'e1'], total: 400 },
      { kind: 'item', id: 'm2' },
      { kind: 'item', id: 'm1' },
    ]);
    expect(list.used).toBe(700);
    expect(list.storageKey).toBe('5|2');
  });

  it("takes the show's name from any episode that has it", () => {
    const list = downloadList(
      [d('e1', { seriesId: 's', createdAt: 2 }), d('e2', { seriesId: 's', seriesName: 'Show', createdAt: 1 })],
      'a1',
    );
    expect(list.entries).toMatchObject([{ kind: 'show', name: 'Show' }]);
  });

  it("leaves out other accounts' downloads; empty without an account", () => {
    expect(downloadList([d('m1'), d('m2', { accountId: 'a2' })], 'a1').entries).toEqual([{ kind: 'item', id: 'm1' }]);
    expect(downloadList([d('m1')], undefined)).toMatchObject({ entries: [], ids: [], used: 0, storageKey: '0|0' });
  });
});

describe('filterDownloads', () => {
  const all = [
    // The show's name comes from a later episode (an old download without it).
    d('e1', { seriesId: 's', title: 'Earthfall', createdAt: 3 }),
    d('e2', { seriesId: 's', seriesName: 'Pioneer One', title: 'The Man From Mars', createdAt: 2 }),
    d('m1', { title: 'Amélie', createdAt: 1, total: 50 }),
  ];
  const list = downloadList(all, 'a1');
  const ids = (query: Parameters<typeof filterDownloads>[1]) =>
    filterDownloads(list, query).map((e) => (e.kind === 'show' ? e.seriesId : e.id));

  it('narrows to movies, shows or every episode on its own', () => {
    expect(ids({ scope: 'all' })).toEqual(['s', 'm1']);
    expect(ids({ scope: 'movies' })).toEqual(['m1']);
    expect(ids({ scope: 'shows' })).toEqual(['s']);
    expect(ids({ scope: 'episodes' })).toEqual(['e1', 'e2']);
  });

  it("titles an episode with its show's name and code, matched by either", () => {
    const numbered = downloadList(
      [
        d('e1', { seriesId: 's', seriesName: 'Pioneer One', title: 'Earthfall', seasonNumber: 1, episodeNumber: 1 }),
        d('e2', { seriesId: 's', title: 'Mars', episodeNumber: 2, createdAt: -1 }),
        d('m1', { title: 'Amélie', createdAt: -2 }),
      ],
      'a1',
    );
    expect(numbered.episodes).toEqual([
      { kind: 'item', id: 'e1', title: 'Pioneer One · S1:E1 · Earthfall' },
      // The show's name from another episode; "E2" without a season.
      { kind: 'item', id: 'e2', title: 'Pioneer One · E2 · Mars' },
    ]);
    expect(filterDownloads(numbered, { term: 'pioneer', scope: 'episodes' })).toEqual(numbered.episodes);
    expect(filterDownloads(numbered, { term: 'mars', scope: 'episodes' })).toEqual([numbered.episodes[1]]);
    expect(filterDownloads(numbered, { term: 'amelie', scope: 'episodes' })).toEqual([]);
  });

  it("matches a movie's title, a show's name or an episode title, case and accents ignored", () => {
    expect(ids({ term: 'AMELIE', scope: 'all' })).toEqual(['m1']);
    expect(ids({ term: 'pioneer', scope: 'all' })).toEqual(['s']);
    expect(ids({ term: 'mars', scope: 'all' })).toEqual(['s']);
    expect(ids({ term: 'mars', scope: 'movies' })).toEqual([]);
    expect(ids({ term: 'nothing', scope: 'all' })).toEqual([]);
  });

  it('finds a show with no known name by what its row says', () => {
    const old = downloadList([d('e1', { seriesId: 's' })], 'a1');
    expect(filterDownloads(old, { term: 'tv show', scope: 'all' })).toEqual(old.entries);
  });

  it("keeps a matched show's row as is, every episode in it", () => {
    const [show] = filterDownloads(list, { term: 'earth', scope: 'all' });
    expect(show).toBe(list.entries[0]);
    expect(show).toEqual({ kind: 'show', seriesId: 's', name: 'Pioneer One', ids: ['e1', 'e2'], total: 200 });
    expect(list.ids).toEqual(['e1', 'e2', 'm1']);
  });
});

describe('showSeasons', () => {
  it("groups one show's episodes by season in episode order, specials and unnumbered ones apart", () => {
    const seasons = showSeasons(
      [
        d('s2e1', { seriesId: 's', seasonNumber: 2, episodeNumber: 1 }),
        d('s1e2', { seriesId: 's', seasonNumber: 1, episodeNumber: 2 }),
        d('loose', { seriesId: 's', createdAt: 9 }),
        d('s1e1', { seriesId: 's', seasonNumber: 1, episodeNumber: 1 }),
        d('sp', { seriesId: 's', seasonNumber: 0, episodeNumber: 1 }),
        d('other', { seriesId: 'x', seasonNumber: 1, episodeNumber: 1 }),
        d('theirs', { seriesId: 's', accountId: 'a2', seasonNumber: 1 }),
      ],
      'a1',
      's',
    );
    expect(seasons).toEqual([
      { title: 'Specials', data: ['sp'] },
      { title: 'Season 1', data: ['s1e1', 's1e2'] },
      { title: 'Season 2', data: ['s2e1'] },
      { title: 'Episodes', data: ['loose'] },
    ]);
  });
});

describe('labels', () => {
  it('counts episodes and numbers an episode title when it can', () => {
    expect(episodeCount(1)).toBe('1 episode');
    expect(episodeCount(3)).toBe('3 episodes');
    expect(episodeTitle({ title: 'Pilot', episodeNumber: 3 })).toBe('3. Pilot');
    expect(episodeTitle({ title: 'Pilot' })).toBe('Pilot');
  });
});

describe('downloadStatus', () => {
  it.each<[Download['status'], Download['reason'], string]>([
    ['queued', undefined, 'Waiting'],
    ['downloading', undefined, 'Downloading'],
    ['downloading', 'network', 'Waiting for Wi-Fi'],
    ['paused', 'user', 'Paused'],
    ['paused', 'network', 'Waiting for Wi-Fi'],
    ['paused', 'auth', 'Paused - sign in again'],
    ['error', 'storage', 'Failed - not enough space'],
    ['error', 'network', 'Failed - network'],
    ['error', 'auth', 'Failed - downloads not allowed'],
    ['error', 'system', 'Failed'],
    ['done', undefined, 'Downloaded'],
  ])('%s (%s) → %s', (status, reason, text) => {
    expect(downloadStatus({ status, reason }, 'wifi')).toBe(text);
  });

  it('waits for any network when the setting allows cellular', () => {
    expect(downloadStatus({ status: 'downloading', reason: 'network' }, 'any')).toBe('Waiting for network');
    expect(downloadStatus({ status: 'paused', reason: 'network' }, 'wifi')).toBe('Waiting for Wi-Fi');
    expect(downloadStatus({ status: 'error', reason: 'network' }, 'any')).toBe('Failed - network');
  });

  it('says how far a transfer is when it knows the size', () => {
    expect(downloadStatus({ status: 'downloading', bytes: 1.1e9, total: 2.6e9 }, 'wifi')).toBe('Downloading 42%');
    expect(downloadStatus({ status: 'downloading', bytes: 0, total: 1e9 }, 'wifi')).toBe('Downloading 0%');
  });
});

describe('groupStatus', () => {
  const sum = (over: Partial<DownloadSummary>): DownloadSummary => ({
    state: 'downloading',
    progress: 0.123,
    ids: ['a', 'b'],
    itemIds: ['a', 'b'],
    done: 0,
    size: 2e9,
    running: 0,
    failed: 0,
    waitingForNetwork: false,
    ...over,
  });

  it('the same words as one download, for a group', () => {
    expect(groupStatus(sum({ running: 1 }), 'wifi')).toBe('Downloading 12%');
    expect(groupStatus(sum({ waitingForNetwork: true }), 'wifi')).toBe('Waiting for Wi-Fi');
    expect(groupStatus(sum({ waitingForNetwork: true }), 'any')).toBe('Waiting for network');
    expect(groupStatus(sum({ state: 'paused', failed: 1 }), 'wifi')).toBe('Failed');
    expect(groupStatus(sum({ state: 'paused' }), 'wifi')).toBe('Paused');
    expect(groupStatus(sum({}), 'wifi')).toBe('Waiting');
  });
});

describe('bytesOf', () => {
  it('names the unit once when both share it', () => {
    expect(bytesOf(1.1e9, 2.6e9)).toBe('1.1 of 2.6 GB');
    expect(bytesOf(95e6, 290e6)).toBe('95 of 290 MB');
    expect(bytesOf(0, 1.1e9)).toBe('0 MB of 1.1 GB');
    expect(bytesOf(3e9, 2e9)).toBe('2 GB of 2 GB');
  });
});
