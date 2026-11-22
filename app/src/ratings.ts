// SPDX-License-Identifier: GPL-3.0-or-later
// Rating scores for downloads (docs/context/kids.md, Downloads; roadmap 9c): offline, the shared phone's kids filter
// compares a download's saved score with the age (`allowedOffline`, src/kids.ts). The server decides, the same way it
// filters online - every rating it knows lines up (any country, `IE-G`; its `/Localization/ParentalRatings` list has
// only its own country, docs/research/jellyfin-api.md). An episode takes its show's rating (it has none of its own).
// Not scored by the server (unrated, a rating it can't read), or gone from it: no score - the download counts as
// unrated. Never blocks a download.
import { getItemsById, ITEMS_BY_ID_CHUNK, type BaseItemDto, type Connection, type Query } from './api';
import { AGE_STEPS, stepQuery, stepScore, UNSCORED_ONLY } from './kids';

/** The ids among `ids` the server returns for this filter (only their ids: no user data, no count). */
async function passing(conn: Connection, ids: readonly string[], filter: Query): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < ids.length; i += ITEMS_BY_ID_CHUNK) {
    const { Items } = await getItemsById(conn, ids.slice(i, i + ITEMS_BY_ID_CHUNK), {
      recursive: true,
      enableUserData: false,
      enableTotalRecordCount: false,
      ...filter,
    });
    Items.forEach((item) => found.add(item.Id));
  }
  return found;
}

/**
 * Each item's score (item id → score; missing = unrated): `stepScore` of the lowest age step the server lets its title
 * (an episode: its show) through. Fails safe: a title the server has no score for stays unrated (it would pass every
 * step), one gone from the server too. Any failure → no scores (asked again later).
 */
export async function ratingScores(conn: Connection, items: readonly BaseItemDto[]): Promise<Map<string, number>> {
  const titleOf = (item: BaseItemDto) => (item.Type === 'Episode' && item.SeriesId ? item.SeriesId : item.Id);
  const titles = [...new Set(items.map(titleOf))];
  const titleScore = new Map<string, number>();
  if (titles.length === 0) return titleScore;
  try {
    // On the server and scored there (`hasParentalRating` can't tell: the server kept unrated titles with it).
    const found = [...(await passing(conn, titles, {}))];
    const unscored = found.length > 0 ? await passing(conn, found, UNSCORED_ONLY) : new Set<string>();
    let left = found.filter((id) => !unscored.has(id));
    for (const age of AGE_STEPS) {
      if (left.length === 0) break;
      const through = await passing(conn, left, stepQuery(age));
      through.forEach((id) => titleScore.set(id, stepScore(age)));
      left = left.filter((id) => !through.has(id));
    }
    left.forEach((id) => titleScore.set(id, stepScore(undefined)));
  } catch {
    return new Map();
  }
  const scores = new Map<string, number>();
  for (const item of items) {
    const score = titleScore.get(titleOf(item));
    if (score !== undefined) scores.set(item.Id, score);
  }
  return scores;
}
