// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from '@jest/globals';

import { downloadList, downloadStatus, filterDownloads, episodeCount, episodeTitle, showSeasons } from './downloadList';
import type { Download } from './downloads';

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

  it('narrows to movies or shows', () => {
    expect(ids({ scope: 'all' })).toEqual(['s', 'm1']);
    expect(ids({ scope: 'movies' })).toEqual(['m1']);
    expect(ids({ scope: 'shows' })).toEqual(['s']);
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
      { title: 'Specials', ids: ['sp'] },
      { title: 'Season 1', ids: ['s1e1', 's1e2'] },
      { title: 'Season 2', ids: ['s2e1'] },
      { title: 'Episodes', ids: ['loose'] },
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
});
