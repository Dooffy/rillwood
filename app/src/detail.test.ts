// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from '@jest/globals';

import type { BaseItemDto } from './api';
import { credits, detailView, heroFacts, information, library, production } from './detail';

const now = new Date(2026, 9, 4, 21, 0);
const at = (h: number, m: number) =>
  `Ends at ${new Date(2026, 9, 4, h, m).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;

// Trimmed from the 12.1 dev server.
const sintel: BaseItemDto = {
  Id: 'sintel',
  Name: 'Sintel',
  Type: 'Movie',
  ProductionYear: 2010,
  RunTimeTicks: 6_789_160_000,
  OfficialRating: 'PG',
  CommunityRating: 7.3,
  Genres: ['Animation', 'Fantasy'],
  ImageTags: { Primary: 'p', Logo: 'l' },
  BackdropImageTags: ['bd'],
  UserData: { PlaybackPositionTicks: 0, Played: false },
  MediaSources: [
    {
      Id: 'ms',
      Name: 'Sintel (2010)',
      MediaStreams: [
        { Type: 'Video', Index: 0, DisplayTitle: '4K H264 SDR', Width: 4096, Height: 1744, VideoRangeType: 'SDR' },
        { Type: 'Audio', Index: 1, DisplayTitle: 'English - Dolby Digital - 5.1', IsDefault: true, Channels: 6 },
        { Type: 'Subtitle', Index: 2, DisplayTitle: 'German - Default - SUBRIP', IsDefault: true },
      ],
    },
  ],
  People: [{ Id: 'p1', Name: 'Halina Reijn', Role: 'Sintel (voice)', Type: 'Actor' }],
};

describe('detailView', () => {
  it('collects everything the detail screen shows', () => {
    const view = detailView(sintel, now);
    expect(view.art).toEqual({ itemId: 'sintel', type: 'Backdrop', tag: 'bd' });
    expect(view.logo).toEqual({ itemId: 'sintel', type: 'Logo', tag: 'l' });
    expect(view.subtitle).toBe('Movie · Animation · Fantasy');
    expect(view.chips).toEqual(['2010', '12m', at(21, 11), 'PG', '★ 7.3', '4K', '5.1', 'CC']);
    expect(view.playback).toEqual({ played: false });
    expect(view.media.audio).toMatchObject({ value: 'English - Dolby Digital - 5.1', count: 1 });
    expect(view.versions).toBeUndefined();
    expect(view.people.map((p) => p.Name)).toEqual(['Halina Reijn']);
  });

  it('ends at the time left when in progress', () => {
    const view = detailView({ ...sintel, UserData: { PlaybackPositionTicks: 6_000_000_000, Played: false } }, now);
    expect(view.chips[2]).toBe(at(21, 1));
    expect(view.playback).toMatchObject({ resumeSeconds: 600 });
  });

  it('names the playing version when there are several files', () => {
    const [source] = sintel.MediaSources!;
    const view = detailView({ ...sintel, MediaSources: [source, { ...source, Id: 'ms2', Name: 'Sintel (1080p)' }] });
    expect(view.versions).toEqual({ count: 2, name: 'Sintel (2010)' });
  });

  it('copes with a bare item', () => {
    expect(detailView({ Id: 'x', Name: 'X', Type: 'Movie' }, now)).toEqual({
      art: undefined,
      logo: undefined,
      subtitle: 'Movie',
      chips: [],
      playback: { played: false },
      media: { video: undefined, audio: undefined, subtitles: undefined },
      versions: undefined,
      people: [],
      directors: [],
      facts: [],
      badges: [],
      credits: [],
      overview: undefined,
      tagline: undefined,
      information: [],
      production: [],
      library: [],
      sdh: false,
    });
  });

  it('shows years and seasons for a series, and the directors for movies', () => {
    const series: BaseItemDto = {
      Id: 'show',
      Name: 'Test Show',
      Type: 'Series',
      ProductionYear: 2019,
      Status: 'Ended',
      EndDate: '2023-05-28T00:00:00Z',
      ChildCount: 3,
      OfficialRating: 'TV-MA',
      CommunityRating: 8.1,
      Genres: ['Drama'],
    };
    expect(detailView(series, now)).toMatchObject({
      subtitle: 'TV Show · Drama',
      chips: ['2019-2023', '3 Seasons', 'TV-MA', '★ 8.1'],
    });
    const directed = { ...sintel, People: [{ Id: 'd', Name: 'Colin Levy', Type: 'Director' }] };
    expect(detailView(directed, now).directors).toEqual(['Colin Levy']);
  });

  it('fills the hero: facts line, badges and the whole overview', () => {
    const view = detailView(
      { ...sintel, PremiereDate: '2010-09-27T00:00:00Z', Overview: '  A girl and a dragon.  ' },
      now,
    );
    expect(view.facts).toEqual(['27 Sep 2010', '12m', at(21, 11), '★ 7.3']);
    expect(view.badges).toEqual(['PG', '4K', '5.1', 'CC']);
    expect(view.overview).toBe('A girl and a dragon.');
  });

  it('falls back to the year without a release date, leaves out what is missing', () => {
    const view = detailView({ Id: 'x', Name: 'X', Type: 'Movie', ProductionYear: 2021, Overview: '   ' }, now);
    expect(view.facts).toEqual(['2021']);
    expect(view.badges).toEqual([]);
    expect(view.overview).toBeUndefined();
  });

  it('gives a series its years, seasons and score as facts, its rating as the badge', () => {
    const show: BaseItemDto = {
      Id: 's',
      Name: 'Show',
      Type: 'Series',
      ProductionYear: 2019,
      EndDate: '2023-05-01T00:00:00Z',
      Status: 'Ended',
      OfficialRating: 'TV-MA',
      CommunityRating: 8.1,
    };
    const view = detailView(show, now, 3);
    expect(view.facts).toEqual(['2019-2023', '3 Seasons', '★ 8.1']);
    expect(view.badges).toEqual(['TV-MA']);
  });
});

describe('credits', () => {
  const person = (Name: string, Type: string) => ({ Id: Name, Name, Type });

  it('names the first three actors, then directors, writers and studios, singular for one', () => {
    const item: BaseItemDto = {
      Id: 'm',
      Name: 'M',
      Type: 'Movie',
      People: [
        person('A', 'Actor'),
        person('Jun Aldren', 'Director'),
        person('B', 'Actor'),
        person('C', 'GuestStar'),
        person('D', 'Actor'),
        person('Rui Santos', 'Writer'),
        person('Lena Fisk', 'Writer'),
        person('Pat', 'Producer'),
      ],
      Studios: [{ Name: 'Northlight Pictures' }],
    };
    expect(credits(item)).toEqual([
      { label: 'Starring', names: ['A', 'B', 'C'] },
      { label: 'Director', names: ['Jun Aldren'] },
      { label: 'Writers', names: ['Rui Santos', 'Lena Fisk'] },
      { label: 'Studio', names: ['Northlight Pictures'] },
    ]);
  });

  it('leaves out lines with nobody in them', () => {
    expect(credits({ Id: 'm', Name: 'M', Type: 'Movie' })).toEqual([]);
    expect(credits({ Id: 'm', Name: 'M', Type: 'Movie', Studios: [{ Name: 'One' }, { Name: 'Two' }] })).toEqual([
      { label: 'Studios', names: ['One', 'Two'] },
    ]);
  });
});

describe('information', () => {
  it("lists a movie's facts with data, original title only when it differs", () => {
    const movie: BaseItemDto = {
      Id: 'm',
      Name: 'Glass Orbit',
      Type: 'Movie',
      OriginalTitle: 'Orbite de verre',
      PremiereDate: '2025-07-11T00:00:00Z',
      RunTimeTicks: 80_400_000_000,
      OfficialRating: 'PG-13',
      Genres: ['Science Fiction', 'Thriller'],
      Studios: [{ Name: 'Northlight Pictures' }],
      ProductionLocations: ['United Kingdom', 'France'],
      CommunityRating: 8.1,
      CriticRating: 91,
      Tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      DateCreated: '2026-10-30T21:46:31Z',
      UserData: { Played: true, PlaybackPositionTicks: 0, PlayCount: 2, LastPlayedDate: '2026-10-14T20:00:00Z' },
    };
    expect(information(movie)).toEqual([
      { label: 'Original Title', value: 'Orbite de verre' },
      { label: 'Released', value: '11 Jul 2025' },
      { label: 'Run Time', value: '2h 14m' },
      { label: 'Rated', value: 'PG-13' },
      { label: 'Ratings', value: '⭐️ 8.1  🍅 91%' },
      { label: 'Genres', value: 'Science Fiction, Thriller' },
      { label: 'Tags', value: 'a, b, c, d, e, f' },
    ]);
    expect(production(movie)).toEqual([
      { label: 'Studio', value: 'Northlight Pictures' },
      { label: 'Region of Origin', value: 'United Kingdom, France' },
    ]);
    expect(library(movie)).toEqual([
      { label: 'Added', value: '30 Oct 2026' },
      { label: 'Played', value: '2 times, last 14 Oct 2026' },
    ]);
    expect(information({ ...movie, OriginalTitle: 'Glass Orbit' }).map((f) => f.label)).not.toContain('Original Title');
  });

  it('gives a series its status, air dates and seasons; air days only while it runs', () => {
    const show: BaseItemDto = {
      Id: 's',
      Name: 'Driftline',
      Type: 'Series',
      Status: 'Continuing',
      PremiereDate: '2023-01-12T00:00:00Z',
      AirDays: ['Thursday'],
      AirTime: '21:00',
    };
    expect(information(show, 2).slice(0, 4)).toEqual([
      { label: 'Status', value: 'Continuing' },
      { label: 'Aired', value: 'Since 12 Jan 2023' },
      { label: 'Airs', value: 'Thursdays at 21:00' },
      { label: 'Seasons', value: '2 Seasons' },
    ]);
    const ended = information({ ...show, Status: 'Ended', EndDate: '2024-03-01T00:00:00Z' });
    expect(ended).toContainEqual({ label: 'Aired', value: '12 Jan 2023 - 1 Mar 2024' });
    expect(ended.map((f) => f.label)).not.toContain('Airs');
  });
});

describe('heroFacts', () => {
  it('joins year, rating and run time, skipping what is missing', () => {
    expect(heroFacts(sintel)).toBe('2010 · PG · 12m');
    expect(heroFacts({ ...sintel, OfficialRating: undefined, RunTimeTicks: undefined })).toBe('2010');
    expect(heroFacts({ Id: 'x', Name: 'X', Type: 'Movie' })).toBeUndefined();
  });
});
