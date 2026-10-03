// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from '@jest/globals';

import type { BaseItemDto } from './api';
import {
  backdropImage,
  cardTitles,
  continueWatching,
  episodeCode,
  homeLibraries,
  imageUrl,
  landscapeImage,
  latest,
  nextUp,
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
    expect(state).toEqual({ progress: 1, remainingSeconds: 0, played: false });
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
