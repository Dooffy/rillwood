// SPDX-License-Identifier: GPL-3.0-or-later
// Everything the detail screen shows, derived from one `/Items/{id}` response (pure). Lives outside items.ts because it
// uses the display formatters, and items.ts must stay loadable by plain Node (scripts/check-home.mjs).
import type { BaseItemDto, PersonDto } from '@/api';
import { formatDate, formatEndsAt, formatRemaining } from '@/format';
import {
  backdropImage,
  castAndCrew,
  detailFacts,
  detailSubtitle,
  directors,
  logoImage,
  mediaRows,
  playback,
  seasonCount,
  ticksToSeconds,
  yearRange,
  type ImageRef,
  type MediaRows,
  type Playback,
} from '@/items';

export type DetailView = {
  /** Hero art and title art (logo); the screen sizes them. */
  art?: ImageRef;
  logo?: ImageRef;
  /** "Movie · Animation · Fantasy" / "S1:E2 · Season 1"; empty when there is nothing to say. */
  subtitle: string;
  /**
   * Movies / episodes: "2010", "12m", "Ends at 9:45 PM", "PG", "★ 7.3", "4K", "5.1", "CC", ... in that order.
   * Series: "2019-2023", "3 Seasons", "TV-MA", "★ 8.1".
   */
  chips: string[];
  playback: Playback;
  /** Default tracks of the first media source. */
  media: MediaRows;
  /** Set when the item has several files: how many, and the one that plays. */
  versions?: { count: number; name?: string };
  people: PersonDto[];
  /** For "Directed by …" (movies). */
  directors: string[];
  /**
   * The hero's facts line. Movies / episodes: "11 Jul 2025" (else the year), "2h 15m", "Ends at 23:35", "★ 8.1".
   * Series: "2019-2023", "3 Seasons", "★ 8.1".
   */
  facts: string[];
  /** The hero's badges. Movies / episodes: "PG-13", "4K", "Dolby Vision", "5.1", "Dolby Atmos", "CC". Series: "TV-MA". */
  badges: string[];
  /** The hero's credits: Starring (first three actors), Director(s), Writer(s), Studio(s); empty ones left out. */
  credits: Credit[];
  /** The whole overview, trimmed; undefined when there is none. */
  overview?: string;
  /** "Nine hours of air. One way home." - over the overview in Details. */
  tagline?: string;
  /** Details → Information: Released, Run Time, Rated, Ratings, Genres, ... rows with data only. */
  information: Fact[];
  /** Details → Production: Studio, Region of Origin. */
  production: Fact[];
  /** Details → On Your Server: Added, Played. */
  library: Fact[];
  /** A subtitle track is for the deaf and hard of hearing: Details explains SDH. */
  sdh: boolean;
};

/** One read-only line of Details: "Studio" + "Northlight Pictures". */
export type Fact = { label: string; value: string };

/** One credits line: "Director" + its names. */
export type Credit = { label: string; names: string[] };

/** Actors named in the hero; the rest are in Cast & Crew. */
const STARRING = 3;

/** Starring, Director(s), Writer(s), Studio(s) - singular for one name. */
export function credits(item: BaseItemDto): Credit[] {
  const people = item.People ?? [];
  const named = (types: string[]) =>
    people.filter((p) => p.Type !== undefined && types.includes(p.Type)).map((p) => p.Name);
  const line = (one: string, many: string, names: string[]): Credit => ({
    label: names.length > 1 ? many : one,
    names,
  });
  return [
    { label: 'Starring', names: named(['Actor', 'GuestStar']).slice(0, STARRING) },
    line('Director', 'Directors', named(['Director'])),
    line('Writer', 'Writers', named(['Writer'])),
    line('Studio', 'Studios', (item.Studios ?? []).map((s) => s.Name).filter(Boolean)),
  ].filter((c) => c.names.length > 0);
}

const join = (list: (string | undefined)[] | undefined) => list?.filter(Boolean).join(', ') || undefined;
const plural = (one: string, many: string, count: number | undefined) => (count && count > 1 ? many : one);

/** Tags shown in Information; servers can hold dozens per title. */
const TAGS = 6;

/** Fact rows with a value, in order. */
const factRows = (rows: [string, string | undefined][]): Fact[] =>
  rows.filter((row): row is [string, string] => !!row[1]).map(([label, value]) => ({ label, value }));

/**
 * Details → Information: what the title is. Movies / episodes: release and run time; series: status, air dates and
 * days, seasons. Who made it is `production`, what the server knows of it (added, played) `library`.
 */
export function information(item: BaseItemDto, seasons?: number): Fact[] {
  const series = item.Type === 'Series';
  const score = [
    item.CommunityRating ? `⭐️ ${item.CommunityRating.toFixed(1)}` : undefined,
    item.CriticRating != null ? `🍅 ${Math.round(item.CriticRating)}%` : undefined,
  ];
  const premiere = formatDate(item.PremiereDate);
  const ended = item.Status === 'Ended' && formatDate(item.EndDate);
  const airs = [item.AirDays?.map((d) => `${d}s`).join(', '), item.AirTime].filter(Boolean).join(' at ');
  const rows: [string, string | undefined][] = series
    ? [
        ['Status', item.Status],
        ['Aired', ended && premiere ? `${premiere} - ${ended}` : premiere && `Since ${premiere}`],
        ['Airs', item.Status === 'Continuing' ? airs : undefined],
        ['Seasons', seasonCount(seasons ?? item.ChildCount)],
      ]
    : [
        ['Released', premiere ?? item.ProductionYear?.toString()],
        ['Run Time', item.RunTimeTicks ? formatRemaining(ticksToSeconds(item.RunTimeTicks)) : undefined],
      ];
  return factRows([
    ['Original Title', item.OriginalTitle !== item.Name ? item.OriginalTitle : undefined],
    ...rows,
    ['Rated', item.OfficialRating],
    ['Ratings', score.filter(Boolean).join('  ') || undefined],
    [plural('Genre', 'Genres', item.Genres?.length), join(item.Genres)],
    ['Tags', join(item.Tags?.slice(0, TAGS))],
  ]);
}

/** Details → Production: who made it, where. */
export function production(item: BaseItemDto): Fact[] {
  return factRows([
    [plural('Studio', 'Studios', item.Studios?.length), join(item.Studios?.map((s) => s.Name))],
    ['Region of Origin', join(item.ProductionLocations)],
  ]);
}

/** Details → On Your Server: when it arrived, how often it was played. */
export function library(item: BaseItemDto): Fact[] {
  const played = item.UserData?.PlayCount;
  const last = formatDate(item.UserData?.LastPlayedDate);
  return factRows([
    ['Added', formatDate(item.DateCreated)],
    ['Played', played ? `${played === 1 ? 'Once' : `${played} times`}${last ? `, last ${last}` : ''}` : undefined],
  ]);
}

/** `seasons`: real season count from the season list (series), better than `ChildCount`, which may hold Specials. */
/** Facts line under the TV Home hero's title: "2025 · TV-14 · 52m" (what's known). */
export function heroFacts(item: BaseItemDto): string | undefined {
  const runtime = item.RunTimeTicks ? formatRemaining(ticksToSeconds(item.RunTimeTicks)) : undefined;
  const parts = [item.ProductionYear?.toString(), item.OfficialRating, runtime].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

export function detailView(item: BaseItemDto, now: Date = new Date(), seasons?: number): DetailView {
  const facts = detailFacts(item);
  const watch = playback(item);
  const sources = item.MediaSources ?? [];
  const runtime = facts.runtimeSeconds ?? 0;
  const rated = [facts.rating, facts.score && `★ ${facts.score}`];
  const score = facts.score && `★ ${facts.score}`;
  const series = item.Type === 'Series';
  const heroFacts = series
    ? [yearRange(item), seasonCount(seasons ?? item.ChildCount), score]
    : [
        formatDate(item.PremiereDate) ?? facts.year?.toString(),
        formatRemaining(runtime),
        formatEndsAt(watch.remainingSeconds ?? runtime, now),
        score,
      ];
  const badges = series
    ? [facts.rating]
    : [facts.rating, facts.resolution, facts.hdr, facts.audio, facts.atmos, facts.subtitles];
  const present = (list: (string | undefined)[]) => list.filter((s): s is string => !!s);
  const chips = series
    ? [yearRange(item), seasonCount(seasons ?? item.ChildCount), ...rated]
    : [
        facts.year?.toString(),
        formatRemaining(runtime),
        formatEndsAt(watch.remainingSeconds ?? runtime, now),
        ...rated,
        facts.resolution,
        facts.hdr,
        facts.audio,
        facts.atmos,
        facts.subtitles,
      ];
  return {
    art: backdropImage(item),
    logo: logoImage(item),
    subtitle: detailSubtitle(item),
    chips: chips.filter((chip): chip is string => !!chip),
    playback: watch,
    media: mediaRows(sources[0]),
    versions: sources.length > 1 ? { count: sources.length, name: sources[0].Name } : undefined,
    people: castAndCrew(item.People),
    directors: directors(item.People),
    facts: present(heroFacts),
    badges: present(badges),
    credits: credits(item),
    overview: item.Overview?.trim() || undefined,
    tagline: item.Taglines?.[0]?.trim() || undefined,
    information: information(item, seasons),
    production: production(item),
    library: library(item),
    sdh: facts.subtitles === 'SDH',
  };
}
