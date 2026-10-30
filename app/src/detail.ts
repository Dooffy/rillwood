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
};

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

/** `seasons`: real season count from the season list (series), better than `ChildCount`, which may hold Specials. */
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
  };
}
