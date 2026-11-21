// SPDX-License-Identifier: GPL-3.0-or-later
// Rating scores for downloads (docs/context/kids.md, Downloads; roadmap 9c): offline, the shared phone's kids filter
// compares a download's saved score with the age (`allowedOffline`, src/kids.ts). The score comes from the server's own
// table (`/Localization/ParentalRatings`: `{Name, Value}`, all countries - `PG` and `TV-PG` both 10), read once per
// server. An episode takes its show's rating (it has none of its own). No table, no rating, an unknown name: no score
// - the download counts as unrated. Never blocks a download.
import { request, type BaseItemDto, type Connection } from './api';
import { itemDetail } from './items';

type RatingDto = { Name?: string; Value?: number | null; RatingScore?: { score?: number | null } | null };

/** Rating name (any case) → score; built from the server's list (unrated entries have no value). */
export function scoreTable(list: readonly RatingDto[]): Map<string, number> {
  const table = new Map<string, number>();
  for (const r of list) {
    // `Value` on every version so far; `RatingScore.score` (10.11+) in case a server leaves `Value` out.
    const score = r.Value ?? r.RatingScore?.score;
    if (r.Name && typeof score === 'number') table.set(r.Name.toLowerCase(), score);
  }
  return table;
}

/** A rating name's score on this server; undefined for no name or one the server doesn't list. */
export const scoreOf = (name: string | undefined, table: ReadonlyMap<string, number>) =>
  name ? table.get(name.toLowerCase()) : undefined;

// One table per server (the list doesn't change while the app runs); a failed read is forgotten (asked again next time).
const tables = new Map<string, Promise<Map<string, number>>>();

function ratingTable(conn: Connection): Promise<Map<string, number>> {
  let table = tables.get(conn.baseUrl);
  if (!table) {
    table = request<RatingDto[]>(conn, '/Localization/ParentalRatings').then(scoreTable);
    table.catch(() => tables.delete(conn.baseUrl));
    tables.set(conn.baseUrl, table);
  }
  return table;
}

/** Tests: start without a cached table. */
export function forgetRatingTables() {
  tables.clear();
}

/**
 * Each item's score (item id → score; missing = unrated): its own rating, an episode its show's (the show looked up
 * once per call). Any failure → what it has so far.
 */
export async function ratingScores(conn: Connection, items: readonly BaseItemDto[]): Promise<Map<string, number>> {
  const scores = new Map<string, number>();
  let table: Map<string, number>;
  try {
    table = await ratingTable(conn);
  } catch {
    return scores;
  }
  const shows = new Map<string, Promise<string | undefined>>();
  const showRating = (id: string) => {
    let rating = shows.get(id);
    if (!rating) {
      rating = request<BaseItemDto>(conn, itemDetail(id).path).then(
        (show) => show.OfficialRating,
        () => undefined,
      );
      shows.set(id, rating);
    }
    return rating;
  };
  await Promise.all(
    items.map(async (item) => {
      const name = item.Type === 'Episode' && item.SeriesId ? await showRating(item.SeriesId) : item.OfficialRating;
      const score = scoreOf(name, table);
      if (score !== undefined) scores.set(item.Id, score);
    }),
  );
  return scores;
}
