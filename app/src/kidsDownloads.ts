// SPDX-License-Identifier: GPL-3.0-or-later
// Kids downloads (docs/context/kids.md, Downloads; pure): what a show's "Next 5" picks, a show's files, and the grown-up
// Downloads page's list (the kid's titles, the ones on the phone first, then A-Z; narrowed by a search).
import type { BaseItemDto, Endpoint } from './api';
import type { Download } from './downloads';
import { hasFile } from './items';
import { allowedOffline, type KidsFilter } from './kids';

/** Next N: a car trip's worth. */
export const NEXT_COUNT = 5;

/** Every episode of a show with its files (in order), for Whole Show and Next N. Specials left out by `playableEpisodes`. */
export function showFiles(seriesId: string): Endpoint {
  return {
    path: `/Shows/${encodeURIComponent(seriesId)}/Episodes`,
    query: { fields: 'MediaSources', isMissing: false },
  };
}

/** A show's episodes a kid can play, in order: with a file, specials left out (as the kids show page). */
export function playableEpisodes(episodes: readonly BaseItemDto[]): BaseItemDto[] {
  return episodes.filter((e) => hasFile(e) && (e.ParentIndexNumber ?? 1) > 0);
}

/**
 * Next N: from the show's Next Up (in progress, else after the last watched), else the first unwatched, else the first;
 * then on in series order across seasons. Nothing left (every episode watched, Next Up empty) = the last N.
 */
export function episodesToKeep(episodes: readonly BaseItemDto[], nextUpId: string | undefined, count = NEXT_COUNT) {
  const list = playableEpisodes(episodes);
  let from = nextUpId ? list.findIndex((e) => e.Id === nextUpId) : -1;
  if (from < 0) from = list.findIndex((e) => !e.UserData?.Played);
  if (from < 0) from = Math.max(0, list.length - count);
  return list.slice(from, from + count);
}

export type KidsDownloadSections = { shows: BaseItemDto[]; movies: BaseItemDto[] };

const byName = (a: BaseItemDto, b: BaseItemDto) =>
  (a.Name ?? '').localeCompare(b.Name ?? '', undefined, { sensitivity: 'base' });

/**
 * The page's list: shows and movies apart, the ones with something on the phone first, then A-Z. `term` narrows by
 * name (any part, any case). `onPhone` = item / show ids with downloads.
 */
export function kidsDownloadSections(
  titles: readonly BaseItemDto[],
  onPhone: ReadonlySet<string>,
  term: string | undefined,
): KidsDownloadSections {
  const needle = term?.toLocaleLowerCase();
  const kept = titles.filter((t) => !needle || (t.Name ?? '').toLocaleLowerCase().includes(needle));
  const order = (list: BaseItemDto[]) =>
    list.sort((a, b) => Number(onPhone.has(b.Id)) - Number(onPhone.has(a.Id)) || byName(a, b));
  return {
    shows: order(kept.filter((t) => t.Type === 'Series')),
    movies: order(kept.filter((t) => t.Type !== 'Series')),
  };
}

/**
 * The account's downloads the kids filter keeps out offline (over the age or unrated - an adult's on a shared phone):
 * how many and their size, so the storage bar adds up. Same rule as the offline list (`allowedOffline`).
 */
export function hiddenDownloads(
  downloads: readonly Download[],
  accountId: string | undefined,
  filter: KidsFilter | undefined,
): { count: number; bytes: number } {
  let count = 0;
  let bytes = 0;
  for (const d of downloads) {
    if (d.accountId !== accountId || allowedOffline(d.rating, filter)) continue;
    count += 1;
    bytes += d.total;
  }
  return { count, bytes };
}
