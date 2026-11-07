// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from '@jest/globals';

import type { BaseItemDto, MediaStreamDto } from './api';
import {
  backdropImage,
  downloadSources,
  seasonFiles,
  cardTitles,
  activeFilters,
  castAndCrew,
  detailFacts,
  defaultSeasonId,
  detailSubtitle,
  directors,
  episodes,
  episodeLabel,
  episodeLine,
  filterQuery,
  NO_FILTERS,
  removeFilter,
  groupResults,
  episodeTitle,
  continueWatching,
  episodeCode,
  homeLayout,
  homeLibraries,
  homePaths,
  imageUrl,
  isItemId,
  itemDetail,
  landscapeImage,
  changedUserData,
  LIBRARY_SORTS,
  listItems,
  mergePage,
  patchItem,
  patchResponse,
  nextPageStart,
  LIBRARY_PAGE_SIZE,
  latest,
  logoImage,
  mediaRows,
  trackRowExpands,
  nextEpisode,
  nextEpisodes,
  nextUp,
  PEOPLE_LIMIT,
  personImage,
  personRole,
  playback,
  posterImage,
  realSeasons,
  recentlyAdded,
  seasonCount,
  seasonDetail,
  SEARCH_SCOPES,
  searchTerm,
  seasons,
  seriesNextUp,
  seriesPlayTarget,
  similar,
  ticksToSeconds,
  yearRange,
  type Filters,
  type LibraryQuery,
  type LibrarySort,
  type SearchScope,
  type ShowState,
} from './items';

// Trimmed from the dev servers (dev/jellyfin): Latest for the Shows library.
const series121: BaseItemDto = {
  Id: 'series-1',
  Name: 'Test Show',
  Type: 'Series',
  IsFolder: true,
  ImageTags: {},
  UserData: { PlaybackPositionTicks: 0, Played: false, UnplayedItemCount: 3 },
};

function episode(n: number, extra: Partial<BaseItemDto> = {}): BaseItemDto {
  return {
    Id: `ep-${n}`,
    Name: `Test Show S01E0${n}`,
    Type: 'Episode',
    ServerId: 'server-1',
    RunTimeTicks: 1_200_210_000,
    IndexNumber: n,
    ParentIndexNumber: 1,
    SeriesId: 'series-1',
    SeriesName: 'Test Show (2026)',
    SeasonId: 'season-1',
    ImageTags: { Primary: `ep-tag-${n}` },
    UserData: { PlaybackPositionTicks: 0, Played: false },
    ...extra,
  };
}

const movie: BaseItemDto = {
  Id: 'movie-1',
  Name: 'Sintel',
  Type: 'Movie',
  RunTimeTicks: 8_789_000_000,
  ProductionYear: 2010,
  ImageTags: { Primary: 'poster-tag' },
  BackdropImageTags: [],
  UserData: { PlaybackPositionTicks: 1_200_000_000, Played: false },
};

describe('Home endpoints', () => {
  it('asks Resume for video items only', () => {
    expect(continueWatching).toEqual({ path: '/UserItems/Resume', query: { mediaTypes: 'Video', limit: 20 } });
  });

  it('leaves in-progress episodes out of Next Up', () => {
    expect(nextUp).toEqual({ path: '/Shows/NextUp', query: { limit: 20, enableResumable: false } });
  });

  it('asks Latest per library', () => {
    expect(latest('lib-1')).toEqual({ path: '/Items/Latest', query: { parentId: 'lib-1', limit: 20 } });
  });

  it('keeps only movie and TV libraries, in server order', () => {
    const views = [
      { Id: 'a', Name: 'Shows', Type: 'CollectionFolder', CollectionType: 'tvshows' },
      { Id: 'b', Name: 'Music', Type: 'CollectionFolder', CollectionType: 'music' },
      { Id: 'c', Name: 'Movies', Type: 'CollectionFolder', CollectionType: 'movies' },
      { Id: 'd', Name: 'Playlists', Type: 'UserView' },
    ];
    expect(homeLibraries(views).map((v) => v.Id)).toEqual(['a', 'c']);
  });
});

describe('recentlyAdded', () => {
  it('passes 12.1 series and movies through', () => {
    expect(recentlyAdded([series121])).toEqual([series121]);
    expect(recentlyAdded([movie])).toEqual([movie]);
  });

  it('turns 10.11 episodes into one card per series, newest first', () => {
    const cards = recentlyAdded([
      episode(3, { SeriesPrimaryImageTag: 'series-tag' }),
      episode(2, { SeriesPrimaryImageTag: 'series-tag' }),
      episode(1, { SeriesId: 'series-2', SeriesName: 'Other Show' }),
    ]);
    expect(cards).toEqual([
      {
        Id: 'series-1',
        Name: 'Test Show (2026)',
        Type: 'Series',
        ServerId: 'server-1',
        IsFolder: true,
        ImageTags: { Primary: 'series-tag' },
      },
      expect.objectContaining({ Id: 'series-2', Name: 'Other Show', Type: 'Series', ImageTags: {} }),
    ]);
  });

  it('keeps the series thumb and backdrop on a 10.11 series card', () => {
    const [card] = recentlyAdded([
      episode(3, {
        ParentThumbItemId: 'series-1',
        ParentThumbImageTag: 'series-thumb',
        ParentBackdropItemId: 'series-1',
        ParentBackdropImageTags: ['series-bd'],
      }),
    ]);
    expect(landscapeImage(card)).toEqual({ itemId: 'series-1', type: 'Thumb', tag: 'series-thumb' });
    expect(backdropImage(card)).toEqual({ itemId: 'series-1', type: 'Backdrop', tag: 'series-bd' });
  });

  it('merges a 10.11 episode with the same series sent as a Series', () => {
    expect(recentlyAdded([series121, episode(3)]).map((c) => c.Id)).toEqual(['series-1']);
  });

  it('collapses seasons too, but keeps an episode without a series id', () => {
    const season = { ...episode(1), Id: 'season-1', Type: 'Season', Name: 'Season 1' };
    const orphan = episode(4, { SeriesId: undefined });
    expect(recentlyAdded([season, orphan]).map((c) => [c.Id, c.Type])).toEqual([
      ['series-1', 'Series'],
      ['ep-4', 'Episode'],
    ]);
  });
});

describe('playback', () => {
  it('converts ticks to seconds', () => {
    expect(ticksToSeconds(10_000_000)).toBe(1);
    expect(ticksToSeconds(8_789_000_000)).toBeCloseTo(878.9);
  });

  it('gives progress and time left while in progress', () => {
    const state = playback(movie);
    expect(state.played).toBe(false);
    expect(state.progress).toBeCloseTo(120 / 878.9);
    expect(state.remainingSeconds).toBeCloseTo(758.9);
    expect(state.resumeSeconds).toBe(120);
  });

  it('shows played items as watched without a bar', () => {
    expect(playback({ ...movie, UserData: { PlaybackPositionTicks: 1_200_000_000, Played: true } })).toEqual({
      played: true,
    });
  });

  it.each([
    ['no position', { ...movie, UserData: { PlaybackPositionTicks: 0, Played: false } }],
    ['no user data', { ...movie, UserData: undefined }],
    ['no runtime', { ...movie, RunTimeTicks: undefined }],
  ])('has no bar with %s', (_, item) => {
    expect(playback(item)).toEqual({ played: false });
  });

  it('clamps a position past the runtime', () => {
    const state = playback({ ...movie, UserData: { PlaybackPositionTicks: 9_000_000_000, Played: false } });
    expect(state).toEqual({ progress: 1, resumeSeconds: 900, remainingSeconds: 0, played: false });
  });
});

describe('cardTitles / episodeCode', () => {
  it('shows the series over the episode code and name', () => {
    expect(cardTitles(episode(2))).toEqual({ title: 'Test Show (2026)', subtitle: 'S1:E2 · Test Show S01E02' });
  });

  it('shows the name over the year for movies and series', () => {
    expect(cardTitles(movie)).toEqual({ title: 'Sintel', subtitle: '2010' });
    expect(cardTitles(series121)).toEqual({ title: 'Test Show', subtitle: undefined });
  });

  it('copes with missing numbers', () => {
    expect(episodeCode(episode(2, { ParentIndexNumber: undefined }))).toBe('E2');
    expect(episodeCode(episode(2, { IndexNumber: undefined }))).toBeUndefined();
    expect(cardTitles(episode(2, { IndexNumber: undefined })).subtitle).toBe('Test Show S01E02');
  });
});

describe('images', () => {
  const withArt: BaseItemDto = {
    ...movie,
    ImageTags: { Primary: 'poster-tag', Thumb: 'thumb-tag' },
    BackdropImageTags: ['bd-tag', 'bd-tag-2'],
  };
  const episodeWithParents = episode(1, {
    SeriesPrimaryImageTag: 'series-poster',
    ParentThumbItemId: 'series-1',
    ParentThumbImageTag: 'series-thumb',
    ParentBackdropItemId: 'series-1',
    ParentBackdropImageTags: ['series-bd'],
  });

  it('uses the series poster for episodes', () => {
    expect(posterImage(episodeWithParents)).toEqual({ itemId: 'series-1', type: 'Primary', tag: 'series-poster' });
    expect(posterImage(episode(1))).toEqual({ itemId: 'ep-1', type: 'Primary', tag: 'ep-tag-1' });
    expect(posterImage(movie)).toEqual({ itemId: 'movie-1', type: 'Primary', tag: 'poster-tag' });
    expect(posterImage(series121)).toBeUndefined();
  });

  it('picks the episode still, then series art, for landscape cards', () => {
    expect(landscapeImage(episodeWithParents)).toEqual({ itemId: 'ep-1', type: 'Primary', tag: 'ep-tag-1' });
    expect(landscapeImage({ ...episodeWithParents, ImageTags: {} })).toEqual({
      itemId: 'series-1',
      type: 'Thumb',
      tag: 'series-thumb',
    });
  });

  it('picks thumb, backdrop, then the poster for movie landscape cards', () => {
    expect(landscapeImage(withArt)?.type).toBe('Thumb');
    expect(landscapeImage({ ...withArt, ImageTags: { Primary: 'poster-tag' } })).toEqual({
      itemId: 'movie-1',
      type: 'Backdrop',
      tag: 'bd-tag',
    });
    expect(landscapeImage(movie)?.type).toBe('Primary');
  });

  it('prefers backdrops for the hero', () => {
    expect(backdropImage(withArt)).toEqual({ itemId: 'movie-1', type: 'Backdrop', tag: 'bd-tag' });
    expect(backdropImage(episodeWithParents)).toEqual({ itemId: 'series-1', type: 'Backdrop', tag: 'series-bd' });
    expect(backdropImage(movie)?.type).toBe('Primary');
  });

  it('sizes the URL to the card in pixels, with the tag and no token', () => {
    const url = imageUrl('https://jf.example.com', { itemId: 'movie-1', type: 'Primary', tag: 'a/b' }, 120, 3);
    expect(url).toBe('https://jf.example.com/Items/movie-1/Images/Primary?fillWidth=360&quality=90&tag=a%2Fb');
    expect(url).not.toMatch(/api_?key|token/i);
  });

  it.each([
    [260.5, 2.625, 720],
    [100, 2, 240],
    [1366, 2, 2880],
    [2000, 3, 2880],
  ])('rounds %ppt × %p up to a %ppx step', (width, scale, pixels) => {
    expect(imageUrl('https://jf', { itemId: 'i', type: 'Thumb', tag: 't' }, width, scale)).toContain(
      `fillWidth=${pixels}&`,
    );
  });
});

describe('homeLayout', () => {
  const list = (...items: BaseItemDto[]) => ({ data: { Items: items, TotalRecordCount: items.length } });
  const views = list({ Id: 'lib', Name: 'Movies', Type: 'CollectionFolder', CollectionType: 'movies' });
  const loading = {};
  const failed = { error: new Error('offline') };
  const ep = episode(2);

  it('makes the latest started item the hero and leaves it out of its row', () => {
    const layout = homeLayout(views, list(movie, episode(1)), list(ep), {});
    expect(layout).toMatchObject({ hero: movie, heroFromResume: true, heroPending: false, resume: [episode(1)] });
    expect(layout.nextUp).toEqual([ep]);
  });

  it('falls back to the next episode, out of Next Up', () => {
    expect(homeLayout(views, list(), list(ep), {})).toMatchObject({ hero: ep, heroFromResume: false, nextUp: [] });
  });

  it('waits for Resume before picking Next Up, and for Next Up when Resume is empty or failed', () => {
    expect(homeLayout(views, loading, list(ep), {})).toMatchObject({ hero: undefined, heroPending: true });
    expect(homeLayout(views, list(), loading, {})).toMatchObject({ hero: undefined, heroPending: true });
    expect(homeLayout(views, failed, loading, {})).toMatchObject({ hero: undefined, heroPending: true });
    expect(homeLayout(views, failed, list(ep), {})).toMatchObject({ hero: ep, heroPending: false });
    expect(homeLayout(views, list(), list(), {})).toMatchObject({ hero: undefined, heroPending: false });
  });

  it('is all-failed only when views, Resume and Next Up all failed', () => {
    expect(homeLayout(failed, failed, failed, {}).allFailed).toBe(true);
    expect(homeLayout(failed, failed, list(), {}).allFailed).toBe(false);
    expect(homeLayout(failed, failed, loading, {}).allFailed).toBe(false);
  });

  it('is empty only once every Recently Added row loaded empty', () => {
    expect(homeLayout(views, list(), list(), {}).empty).toBe(false);
    expect(homeLayout(views, list(), list(), { lib: 3 }).empty).toBe(false);
    expect(homeLayout(views, list(), list(), { lib: 0 }).empty).toBe(true);
    expect(homeLayout(list(), list(), list(), {}).empty).toBe(true);
    expect(homeLayout(views, list(movie), list(), { lib: 0 }).empty).toBe(false);
  });

  it('refreshes every Latest row through one path prefix', () => {
    expect(homePaths).toEqual(['/UserViews', '/UserItems/Resume', '/Shows/NextUp', '/Items/Latest']);
  });
});

// Trimmed from the dev servers: Sintel (Real library) and Multi Audio Multi Subs.
const video4k: MediaStreamDto = {
  Type: 'Video',
  Index: 0,
  Codec: 'h264',
  DisplayTitle: '4K H264 SDR',
  Width: 4096,
  Height: 1744,
  VideoRange: 'SDR',
  VideoRangeType: 'SDR',
};
const ac3: MediaStreamDto = {
  Type: 'Audio',
  Index: 1,
  Codec: 'ac3',
  Language: 'eng',
  DisplayTitle: 'AC3 5.1 @ 640 Kbps - English - Dolby Digital - Default',
  IsDefault: true,
  Channels: 6,
};
const deu: MediaStreamDto = {
  Type: 'Subtitle',
  Index: 2,
  Codec: 'subrip',
  Language: 'deu',
  DisplayTitle: 'German - Default - SUBRIP',
  IsDefault: true,
};
const eng: MediaStreamDto = {
  Type: 'Subtitle',
  Index: 3,
  Codec: 'subrip',
  Language: 'eng',
  DisplayTitle: 'English - SUBRIP',
};
const sintelDetail: BaseItemDto = {
  ...movie,
  OfficialRating: 'PG',
  CommunityRating: 7.3,
  MediaSources: [{ Id: 'movie-1', Name: 'Sintel (2010)', MediaStreams: [video4k, ac3, deu, eng] }],
};

describe('detail', () => {
  it('asks for the item by id, encoded', () => {
    expect(itemDetail('abc')).toEqual({ path: '/Items/abc' });
    expect(itemDetail('a/b').path).toBe('/Items/a%2Fb');
  });

  it.each([
    ['ecdda3284954ff60759e87e5ddb37fb8', true],
    ['', false],
    ['00000000-0000-0000-0000-000000000000', false],
    [undefined, false],
    [['a', 'b'], false],
  ])('isItemId(%p) → %p', (id, valid) => {
    expect(isItemId(id)).toBe(valid);
  });

  it('collects the chip facts from the item and its first source', () => {
    expect(detailFacts(sintelDetail)).toEqual({
      year: 2010,
      runtimeSeconds: 878.9,
      rating: 'PG',
      score: '7.3',
      resolution: '4K',
      hdr: undefined,
      audio: '5.1',
      atmos: undefined,
      subtitles: 'CC',
    });
  });

  it('flags Atmos audio and SDH subtitles', () => {
    const streams = [video4k, { ...ac3, Profile: 'TrueHD + Atmos' }, { ...eng, IsHearingImpaired: true }];
    expect(detailFacts({ ...movie, MediaSources: [{ Id: 's', MediaStreams: streams }] })).toMatchObject({
      atmos: 'Dolby Atmos',
      subtitles: 'SDH',
    });
  });

  it.each([
    [{ Width: 1920, Height: 800 }, '1080p'],
    [{ Width: 1280, Height: 720 }, '720p'],
    [{ Width: 720, Height: 480 }, 'SD'],
    [{ Width: 3840, Height: 2160 }, '4K'],
  ])('resolution of %j is %s', (size, label) => {
    const item = { ...movie, MediaSources: [{ Id: 's', MediaStreams: [{ Type: 'Video', Index: 0, ...size }] }] };
    expect(detailFacts(item).resolution).toBe(label);
  });

  it.each([
    ['DOVIWithHDR10', 'HDR', 'Dolby Vision'],
    ['HDR10Plus', 'HDR', 'HDR10+'],
    ['HDR10', 'HDR', 'HDR10'],
    ['HLG', 'HDR', 'HLG'],
    ['Unknown', 'HDR', 'HDR'],
    ['DOVIInvalid', 'HDR', 'HDR'],
    ['DOVIInvalid', 'SDR', undefined],
    ['SDR', 'SDR', undefined],
  ])('%s / %s → %p', (type, range, label) => {
    const stream = { ...video4k, VideoRangeType: type, VideoRange: range };
    expect(detailFacts({ ...movie, MediaSources: [{ Id: 's', MediaStreams: [stream] }] }).hdr).toBe(label);
  });

  it('copes with an item without media or ratings', () => {
    expect(detailFacts({ Id: 'x', Name: 'X', Type: 'Movie' })).toEqual({
      year: undefined,
      runtimeSeconds: undefined,
      rating: undefined,
      score: undefined,
      resolution: undefined,
      hdr: undefined,
      audio: undefined,
      atmos: undefined,
      subtitles: undefined,
    });
  });

  it('summarises what plays by default, with track counts', () => {
    const audio = 'AC3 5.1 @ 640 Kbps - English - Dolby Digital - Default';
    expect(mediaRows(sintelDetail.MediaSources?.[0])).toEqual({
      video: { value: '4K H264 SDR', count: 1, tracks: [{ label: '4K H264 SDR', picked: true }] },
      audio: { value: audio, count: 1, tracks: [{ label: audio, picked: true }] },
      subtitles: {
        value: 'German - Default - SUBRIP',
        count: 2,
        tracks: [
          { label: 'Off', picked: false },
          { label: 'German - Default - SUBRIP', picked: true },
          { label: 'English - SUBRIP', picked: false },
        ],
      },
    });
  });

  it('uses the first audio track without a default, and Off for subtitles without one', () => {
    const rows = mediaRows({
      Id: 's',
      MediaStreams: [
        { ...ac3, IsDefault: false, DisplayTitle: 'English 440Hz - AAC - Mono' },
        { ...ac3, Index: 2, IsDefault: false, DisplayTitle: 'Ukrainian 880Hz - Dolby Digital - Mono' },
        { ...eng },
      ],
    });
    expect(rows.audio).toEqual({
      value: 'English 440Hz - AAC - Mono',
      count: 2,
      tracks: [
        { label: 'English 440Hz - AAC - Mono', picked: true },
        { label: 'Ukrainian 880Hz - Dolby Digital - Mono', picked: false },
      ],
    });
    expect(rows.subtitles?.value).toBe('Off');
    expect(rows.subtitles?.count).toBe(1);
    expect(rows.subtitles?.tracks[0]).toEqual({ label: 'Off', picked: true });
    expect(rows.video).toBeUndefined();
  });

  it.each([
    ['Video', '4K H264 SDR', 1, false],
    ['Audio', 'English - Stereo', 1, false],
    // Kept low on purpose: a value that may not fit a small phone opens.
    ['Audio', 'English - Dolby Digital - 5.1', 1, true],
    // The "Audi / o" row: one track, too long to fit next to its label.
    ['Audio', 'Surround 7.1 - English - AAC - 5.1 - Default', 1, true],
    ['Subtitles (2)', 'Off', 2, true],
  ])('trackRowExpands(%p, %p, %p tracks) → %p', (label, value, count, expands) => {
    expect(trackRowExpands(label, { value, count, tracks: [] })).toBe(expands);
  });

  it('has no rows without a media source', () => {
    expect(mediaRows(undefined)).toEqual({ video: undefined, audio: undefined, subtitles: undefined });
  });

  it('lists cast in billing order, then directors and writers, without producers', () => {
    const people = [
      { Id: 'd', Name: 'Colin Levy', Type: 'Director', Role: 'Director' },
      { Id: 'a1', Name: 'Halina Reijn', Type: 'Actor', Role: 'Sintel (voice)', PrimaryImageTag: 't1' },
      { Id: 'p', Name: 'Ton Roosendaal', Type: 'Producer' },
      { Id: 'w', Name: 'Esther Wouda', Type: 'Writer' },
      { Id: 'a2', Name: 'Thom Hoffman', Type: 'Actor', Role: 'Shaman (voice)' },
      { Id: 'g', Name: 'Guest', Type: 'GuestStar' },
    ];
    expect(castAndCrew(people).map((p) => p.Id)).toEqual(['a1', 'a2', 'g', 'd', 'w']);
    expect(castAndCrew(undefined)).toEqual([]);
    expect(personImage(people[1])).toEqual({ itemId: 'a1', type: 'Primary', tag: 't1' });
    expect(personImage(people[0])).toBeUndefined();
    expect(people.map(personRole)).toEqual([
      'Director',
      'Sintel (voice)',
      'Producer',
      'Writer',
      'Shaman (voice)',
      undefined,
    ]);
  });

  it(`shows at most ${PEOPLE_LIMIT} people`, () => {
    const many = Array.from({ length: 150 }, (_, i) => ({ Id: `p${i}`, Name: `P${i}`, Type: 'Actor' }));
    expect(castAndCrew(many)).toHaveLength(PEOPLE_LIMIT);
  });

  it('builds the line under the title', () => {
    expect(detailSubtitle({ ...movie, Genres: ['Animation', 'Fantasy', 'Adventure'] })).toBe(
      'Movie · Animation · Fantasy',
    );
    expect(detailSubtitle({ ...episode(2), SeasonName: 'Season 1' })).toBe('S1:E2 · Season 1');
    expect(detailSubtitle({ Id: 's', Name: 'S', Type: 'Series' })).toBe('TV Show');
    expect(detailSubtitle({ Id: 'x', Name: 'X', Type: 'Season' })).toBe('');
  });

  it('uses the item logo as title art when it has one', () => {
    expect(logoImage({ ...movie, ImageTags: { Primary: 'p', Logo: 'l' } })).toEqual({
      itemId: 'movie-1',
      type: 'Logo',
      tag: 'l',
    });
    expect(logoImage(movie)).toBeUndefined();
  });
});

describe('series', () => {
  // Trimmed from the dev servers (Test Show) plus a Specials season.
  const specials: BaseItemDto = { Id: 'sp', Name: 'Specials', Type: 'Season', IndexNumber: 0, SeriesId: 'series-1' };
  const s1: BaseItemDto = { Id: 'season-1', Name: 'Season 1', Type: 'Season', IndexNumber: 1, SeriesId: 'series-1' };
  const s2: BaseItemDto = { Id: 'season-2', Name: 'Season 2', Type: 'Season', IndexNumber: 2, SeriesId: 'series-1' };

  it('asks for seasons, episodes with overviews, the series next up and similar items', () => {
    expect(seasons('series-1')).toEqual({ path: '/Shows/series-1/Seasons' });
    expect(episodes('series-1', 'season-1')).toEqual({
      path: '/Shows/series-1/Episodes',
      query: { seasonId: 'season-1', fields: 'Overview' },
    });
    expect(seriesNextUp('series-1')).toEqual({
      path: '/Shows/NextUp',
      query: { seriesId: 'series-1', limit: 1, enableResumable: true, fields: 'Overview' },
    });
    expect(similar('a/b')).toEqual({ path: '/Items/a%2Fb/Similar', query: { limit: 20 } });
  });

  it('asks for an episode and the one after it, across seasons - episodes only', () => {
    const ep: BaseItemDto = { ...episode(2), Id: 'ep-2', SeriesId: 'a/b' };
    expect(nextEpisodes(ep)).toEqual({
      path: '/Shows/a%2Fb/Episodes',
      query: { startItemId: 'ep-2', limit: 2, isMissing: false },
    });
    expect(nextEpisodes({ ...ep, SeriesId: undefined })).toBeUndefined();
    expect(nextEpisodes({ Id: 'm', Name: 'Sintel', Type: 'Movie' })).toBeUndefined();
  });

  it('picks the episode after this one; none after the last or for a list without it', () => {
    const [a, b] = [
      { ...episode(1), Id: 'a' },
      { ...episode(2), Id: 'b' },
    ];
    expect(nextEpisode([a, b], 'a')).toBe(b);
    expect(nextEpisode([b], 'b')).toBeUndefined();
    expect(nextEpisode([a, b], 'other')).toBeUndefined();
    expect(nextEpisode(undefined, 'a')).toBeUndefined();
    expect(nextEpisode([a, { ...b, LocationType: 'Virtual' }], 'a')).toBeUndefined();
  });

  it('opens the season of the next episode, else the first real season', () => {
    expect(defaultSeasonId([specials, s1, s2], { ...episode(1), SeasonId: 'season-2' })).toBe('season-2');
    expect(defaultSeasonId([specials, s1, s2], { ...episode(1), SeasonId: 'gone' })).toBe('season-1');
    expect(defaultSeasonId([specials, s1, s2])).toBe('season-1');
    expect(defaultSeasonId([specials])).toBe('sp');
    expect(defaultSeasonId([])).toBeUndefined();
  });

  it('names an episode in a line, and a season by its watch state', () => {
    expect(episodeLine({ ...episode(3), Name: 'Pilot' })).toBe('S1, E3 · Pilot');
    expect(episodeLine({ ...episode(3), ParentIndexNumber: undefined, Name: 'Pilot' })).toBe('E3 · Pilot');
    expect(episodeLine({ ...episode(3), IndexNumber: undefined, Name: 'Pilot' })).toBe('Pilot');
    expect(episodeLabel(episode(3))).toBe('S1, E3');
    expect(episodeLabel({ ...episode(3), ParentIndexNumber: undefined })).toBe('E3');
    expect(episodeLabel({ ...episode(3), IndexNumber: undefined })).toBeUndefined();
    expect(seasonDetail({ ...s1, UserData: { PlaybackPositionTicks: 0, Played: true } })).toBe('Watched');
    expect(seasonDetail({ ...s1, UserData: { PlaybackPositionTicks: 0, Played: false, UnplayedItemCount: 5 } })).toBe(
      '5 unwatched',
    );
    expect(seasonDetail(s1)).toBeUndefined();
  });

  it('counts real seasons only (Specials have index 0)', () => {
    expect(realSeasons([specials, s1, s2]).map((s) => s.Id)).toEqual(['season-1', 'season-2']);
    expect(realSeasons([specials])).toEqual([]);
  });

  it('plays the next episode, resuming it when started, else the first shown', () => {
    const started = episode(2, { UserData: { PlaybackPositionTicks: 400_000_000, Played: false } });
    expect(seriesPlayTarget(started)).toEqual({ episode: started, resume: true, start: 40 });
    expect(seriesPlayTarget(episode(2))).toEqual({ episode: episode(2), resume: false, start: 0 });
    expect(seriesPlayTarget(undefined, [episode(1), episode(2)])).toEqual({
      episode: episode(1),
      resume: false,
      start: 0,
    });
    expect(seriesPlayTarget(undefined, [])).toBeUndefined();
  });

  it.each([
    [{ ProductionYear: 2019, Status: 'Ended', EndDate: '2023-05-28T00:00:00.0000000Z' }, '2019-2023'],
    [{ ProductionYear: 2019, Status: 'Continuing' }, '2019-'],
    [{ ProductionYear: 2019, Status: 'Ended', EndDate: '2019-12-01T00:00:00Z' }, '2019'],
    [{ ProductionYear: 2026 }, '2026'],
    [{ ProductionYear: 2019, Status: 'Ended', EndDate: 'not a date' }, '2019'],
    [{ ProductionYear: 2019, Status: 'Ended', EndDate: '2018-01-01T00:00:00Z' }, '2019'],
    [{}, undefined],
  ])('yearRange(%j) → %p', (fields, label) => {
    expect(yearRange({ Id: 's', Name: 'S', Type: 'Series', ...fields })).toBe(label);
  });

  it.each([
    [1, '1 Season'],
    [3, '3 Seasons'],
    [0, undefined],
    [undefined, undefined],
  ])('seasonCount(%p) → %p', (count, label) => {
    expect(seasonCount(count)).toBe(label);
  });

  it('numbers episodes in their season list', () => {
    expect(episodeTitle({ ...episode(2), Name: 'Pilot' })).toBe('2. Pilot');
    expect(episodeTitle({ ...episode(2), IndexNumber: undefined, Name: 'Pilot' })).toBe('Pilot');
  });

  it('names the directors, and calls series TV shows', () => {
    const people = [
      { Id: 'a', Name: 'Halina Reijn', Type: 'Actor' },
      { Id: 'd', Name: 'Colin Levy', Type: 'Director' },
      { Id: 'd2', Name: 'Second Director', Type: 'Director' },
    ];
    expect(directors(people)).toEqual(['Colin Levy', 'Second Director']);
    expect(directors(undefined)).toEqual([]);
    expect(detailSubtitle({ ...series121, Genres: ['Drama'] })).toBe('TV Show · Drama');
  });
});

describe('library', () => {
  const browse = (change: Partial<LibraryQuery> = {}): LibraryQuery => ({
    scope: 'movies',
    sort: 'name',
    filters: NO_FILTERS,
    ...change,
  });

  it('browses every item of the type across libraries, sorted, a page at a time', () => {
    expect(listItems(browse())).toEqual({
      path: '/Items',
      query: {
        searchTerm: undefined,
        includeItemTypes: 'Movie',
        recursive: true,
        sortBy: 'SortName',
        sortOrder: 'Ascending',
        filters: undefined,
        genres: undefined,
        years: undefined,
        minCommunityRating: undefined,
        is4K: undefined,
        startIndex: undefined,
        limit: LIBRARY_PAGE_SIZE,
      },
    });
    expect(listItems(browse({ scope: 'shows' }), 50, 100).query).toMatchObject({
      includeItemTypes: 'Series',
      startIndex: 100,
    });
  });

  it.each([
    ['movies', 'added', 'DateCreated,SortName', 'Descending'],
    ['shows', 'added', 'DateLastContentAdded,SortName', 'Descending'],
    ['movies', 'year', 'ProductionYear,SortName', 'Descending'],
    ['shows', 'rating', 'CommunityRating,SortName', 'Descending'],
  ] as [SearchScope, LibrarySort, string, string][])('%s by %s → %s %s', (scope, sort, sortBy, sortOrder) => {
    expect(listItems(browse({ scope, sort })).query).toMatchObject({ sortBy, sortOrder });
  });

  it('searches with a term: ranked by the server (no sort), episodes included in All', () => {
    const q = listItems(browse({ term: 'sintel', scope: 'all', sort: 'year' }), 60).query;
    expect(q).toMatchObject({ searchTerm: 'sintel', includeItemTypes: 'Movie,Series,Episode', limit: 60 });
    expect(q).not.toHaveProperty('sortBy');
    // Browsing All lists movies and shows only.
    expect(listItems(browse({ scope: 'all' })).query?.includeItemTypes).toBe('Movie,Series');
    expect(listItems(browse({ scope: 'episodes', term: 's' })).query?.includeItemTypes).toBe('Episode');
  });

  it('adds the filters, and asks for the count only with limit 0', () => {
    const q = listItems(browse({ filters: { ...NO_FILTERS, genres: ['Animation'], show: 'inProgress' } }), 0).query;
    expect(q).toMatchObject({ genres: 'Animation', filters: 'IsResumable', limit: 0 });
  });

  it('lists the sorts and types in menu order', () => {
    expect(LIBRARY_SORTS.map((x) => x.label)).toEqual(['Name', 'Date Added', 'Year', 'Rating']);
    expect(SEARCH_SCOPES.map((x) => x.label)).toEqual(['All', 'Movies', 'Shows', 'Episodes']);
  });

  it('knows where the next page starts and when everything is loaded', () => {
    expect(nextPageStart(50, 120)).toBe(50);
    expect(nextPageStart(120, 120)).toBeUndefined();
    expect(nextPageStart(0, undefined)).toBeUndefined();
  });

  it('appends a page without repeating items that shifted between pages', () => {
    const a = { ...movie, Id: 'a' };
    const b = { ...movie, Id: 'b' };
    const c = { ...movie, Id: 'c' };
    expect(mergePage([a, b], [b, c]).map((i) => i.Id)).toEqual(['a', 'b', 'c']);
  });

  it('searches from the first letter, trimmed', () => {
    expect(searchTerm('  s ')).toBe('s');
    expect(searchTerm(' si ')).toBe('si');
    expect(searchTerm('   ')).toBeUndefined();
  });

  it('groups mixed results, keeping the server order', () => {
    // Trimmed from the dev servers: episodes come before their show.
    const groups = groupResults([episode(1), episode(2), series121, movie]);
    expect(groups.episodes.map((i) => i.Id)).toEqual(['ep-1', 'ep-2']);
    expect(groups.shows).toEqual([series121]);
    expect(groups.movies).toEqual([movie]);
  });
});

describe('filters', () => {
  it('sends nothing without filters', () => {
    expect(Object.values(filterQuery(NO_FILTERS)).filter((v) => v !== undefined)).toEqual([]);
  });

  it.each([
    ['unwatched', 'IsUnplayed'],
    ['inProgress', 'IsResumable'],
    ['watched', 'IsPlayed'],
    ['favourites', 'IsFavorite'],
  ] as [ShowState, string][])('show %s → filters=%s', (show, filter) => {
    expect(filterQuery({ ...NO_FILTERS, show }).filters).toBe(filter);
  });

  it('turns genres, decades, rating and 4K into server parameters', () => {
    const q = filterQuery({
      show: 'all',
      genres: ['Animation', 'Fantasy'],
      decades: [2010],
      minRating: 7,
      only4K: true,
    });
    expect(q).toMatchObject({
      genres: 'Animation|Fantasy',
      years: '2010,2011,2012,2013,2014,2015,2016,2017,2018,2019',
      minCommunityRating: 7,
      is4K: true,
    });
  });

  it('covers every year before the 1990s with Older', () => {
    const years = String(filterQuery({ ...NO_FILTERS, decades: [0] }).years).split(',');
    expect(years[0]).toBe('1900');
    expect(years.at(-1)).toBe('1989');
  });

  it('lists active filters as chips and removes them one by one', () => {
    const f: Filters = { show: 'unwatched', genres: ['Animation'], decades: [2010], minRating: 8, only4K: true };
    const chips = activeFilters(f);
    expect(chips.map((c) => c.label)).toEqual(['Unwatched', 'Animation', '2010s', '★ 8+', '4K']);
    const cleared = chips.reduce<Filters>((acc, c) => removeFilter(acc, c.id), f);
    expect(cleared).toEqual({ ...NO_FILTERS, minRating: undefined });
    expect(activeFilters(cleared)).toEqual([]);
  });
});

describe('user data', () => {
  const seen = { PlaybackPositionTicks: 6_000_000_000, Played: false, PlayedPercentage: 40, IsFavorite: false };
  const film: BaseItemDto = { ...movie, Id: 'film', UserData: seen };
  const season: BaseItemDto = {
    Id: 'season-1',
    Name: 'Season 1',
    Type: 'Season',
    SeriesId: 'show',
    UserData: { PlaybackPositionTicks: 0, Played: false, UnplayedItemCount: 3 },
  };
  const ep1: BaseItemDto = { ...episode(1), SeasonId: 'season-1', SeriesId: 'show', UserData: seen };
  const other: BaseItemDto = { ...episode(2), Id: 'other', SeasonId: 'season-2', SeriesId: 'show-2' };

  it('predicts the server: favourite only flips IsFavorite', () => {
    expect(changedUserData(seen, 'favourite', true)).toEqual({ ...seen, IsFavorite: true });
  });

  it('predicts the server: watched or unwatched clears the resume point; watched zeroes unplayed counts', () => {
    expect(changedUserData(seen, 'played', true)).toMatchObject({
      Played: true,
      PlaybackPositionTicks: 0,
      PlayedPercentage: undefined,
    });
    expect(changedUserData(seen, 'played', false)).toMatchObject({ Played: false, PlaybackPositionTicks: 0 });
    expect(changedUserData(season.UserData, 'played', true).UnplayedItemCount).toBe(0);
    // Unwatched: the count comes with the refetch.
    expect(changedUserData(season.UserData, 'played', false).UnplayedItemCount).toBe(3);
    expect(changedUserData(undefined, 'played', true)).toEqual({
      Played: true,
      PlaybackPositionTicks: 0,
      PlayedPercentage: undefined,
    });
  });

  it('patches the item, preferring the server answer', () => {
    expect(patchItem(film, { itemId: 'film', flag: 'played', value: true }).UserData).toMatchObject({
      Played: true,
      PlaybackPositionTicks: 0,
    });
    const answer = { PlaybackPositionTicks: 0, Played: true, PlayCount: 1 };
    expect(patchItem(film, { itemId: 'film', flag: 'played', value: true, userData: answer }).UserData).toBe(answer);
  });

  it('marks what is inside a season or series, but never cascades favourites', () => {
    expect(patchItem(ep1, { itemId: 'season-1', flag: 'played', value: true }).UserData?.Played).toBe(true);
    expect(patchItem(ep1, { itemId: 'show', flag: 'played', value: true }).UserData?.Played).toBe(true);
    expect(patchItem(season, { itemId: 'show', flag: 'played', value: true }).UserData?.UnplayedItemCount).toBe(0);
    expect(patchItem(ep1, { itemId: 'season-1', flag: 'favourite', value: true })).toBe(ep1);
    expect(patchItem(other, { itemId: 'season-1', flag: 'played', value: true })).toBe(other);
  });

  it('patches cached responses of every shape, new objects only where something changed', () => {
    const change = { itemId: 'film', flag: 'favourite', value: true } as const;
    const patched = patchResponse({ Items: [other, film], TotalRecordCount: 2 }, change) as {
      Items: BaseItemDto[];
      TotalRecordCount: number;
    };
    expect(patched.TotalRecordCount).toBe(2);
    expect(patched.Items[0]).toBe(other);
    expect(patched.Items[1].UserData?.IsFavorite).toBe(true);
    expect((patchResponse([film], change) as BaseItemDto[])[0].UserData?.IsFavorite).toBe(true);
    expect((patchResponse(film, change) as BaseItemDto).UserData?.IsFavorite).toBe(true);
    // Untouched or not item data → undefined (the cache entry stays as it is).
    expect(patchResponse({ Items: [other] }, change)).toBeUndefined();
    expect(patchResponse(other, change)).toBeUndefined();
    expect(patchResponse({ Version: '12.1.0' }, change)).toBeUndefined();
    expect(patchResponse(null, change)).toBeUndefined();
  });
});

describe('downloads', () => {
  it('asks for a season with its files, without missing episodes', () => {
    expect(seasonFiles('show', 's1')).toEqual({
      path: '/Shows/show/Episodes',
      query: { seasonId: 's1', fields: 'MediaSources,Overview', isMissing: false },
    });
  });

  it('downloads the first version of each item that has a file', () => {
    const source = (Id: string) => ({ Id, Size: 1 });
    const a = { Id: 'a', Name: 'A', Type: 'Episode', MediaSources: [source('a1'), source('a2')] };
    const missing = { Id: 'b', Name: 'B', Type: 'Episode', LocationType: 'Virtual', MediaSources: [source('b1')] };
    const none = { Id: 'c', Name: 'C', Type: 'Episode' };
    expect(downloadSources([a, missing, none])).toEqual([{ item: a, source: source('a1') }]);
  });
});
