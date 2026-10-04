// SPDX-License-Identifier: GPL-3.0-or-later
// Everything the detail screen shows, derived from one `/Items/{id}` response (pure). Lives outside items.ts because it
// uses the display formatters, and items.ts must stay loadable by plain Node (scripts/check-home.mjs).
import type { BaseItemDto, PersonDto } from '@/api';
import { formatEndsAt, formatRemaining } from '@/format';
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
};

export function detailView(item: BaseItemDto, now: Date = new Date()): DetailView {
  const facts = detailFacts(item);
  const watch = playback(item);
  const sources = item.MediaSources ?? [];
  const runtime = facts.runtimeSeconds ?? 0;
  const rated = [facts.rating, facts.score && `★ ${facts.score}`];
  const chips =
    item.Type === 'Series'
      ? [yearRange(item), seasonCount(item.ChildCount), ...rated]
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
  };
}
