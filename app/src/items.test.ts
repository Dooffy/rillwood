// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from '@jest/globals';

import type { BaseItemDto, MediaStreamDto } from './api';
import {
  backdropImage,
  cardTitles,
  castAndCrew,
  detailFacts,
  detailSubtitle,
  continueWatching,
  episodeCode,
  homeLayout,
  homeLibraries,
  homePaths,
  imageUrl,
  isItemId,
  itemDetail,
  landscapeImage,
  latest,
  logoImage,
  mediaRows,
  nextUp,
  PEOPLE_LIMIT,
  personImage,
  personRole,
  playback,
  posterImage,
  recentlyAdded,
  ticksToSeconds,
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
    expect(mediaRows(sintelDetail.MediaSources?.[0])).toEqual({
      video: { value: '4K H264 SDR', count: 1 },
      audio: { value: 'AC3 5.1 @ 640 Kbps - English - Dolby Digital - Default', count: 1 },
      subtitles: { value: 'German - Default - SUBRIP', count: 2 },
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
    expect(rows.audio).toEqual({ value: 'English 440Hz - AAC - Mono', count: 2 });
    expect(rows.subtitles).toEqual({ value: 'Off', count: 1 });
    expect(rows.video).toBeUndefined();
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
    expect(detailSubtitle({ Id: 's', Name: 'S', Type: 'Series' })).toBe('');
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
