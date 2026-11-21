// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import * as api from './api';
import type { BaseItemDto, Connection } from './api';
import { forgetRatingTables, ratingScores, scoreOf, scoreTable } from './ratings';

const conn: Connection = { baseUrl: 'https://jf.example.com', deviceId: 'dev', token: 'tok', accountId: 'a' };
const table = [
  { Name: 'TV-Y7', Value: 7 },
  { Name: 'PG', Value: 10 },
  { Name: 'TV-PG', Value: 10 },
  { Name: 'R', Value: 17 },
  { Name: 'Unrated', Value: null },
];
const movie = (Id: string, OfficialRating?: string): BaseItemDto => ({ Id, Name: Id, Type: 'Movie', OfficialRating });
const episode = (Id: string, SeriesId: string): BaseItemDto => ({ Id, Name: Id, Type: 'Episode', SeriesId });
const shows: Record<string, string | undefined> = { trains: 'TV-Y7', grownup: 'R', bare: undefined };
/** A show the server can't answer for. */
const broken = 'broken';

const request = jest.spyOn(api, 'request');
let tableFails = false;

beforeEach(() => {
  jest.clearAllMocks();
  forgetRatingTables();
  tableFails = false;
  request.mockImplementation((_conn, path: string) => {
    if (path === '/Localization/ParentalRatings')
      return tableFails ? Promise.reject(new api.ApiError('network')) : Promise.resolve(table as never);
    const id = decodeURIComponent(path.split('/').pop() ?? '');
    if (id === broken) return Promise.reject(new api.ApiError('http', 500));
    return Promise.resolve({ Id: id, Name: id, Type: 'Series', OfficialRating: shows[id] } as never);
  });
});

const asObject = (m: Map<string, number>) => Object.fromEntries(m);

describe('rating scores', () => {
  it("reads the server's table by name, any case; unrated entries have no score", () => {
    const t = scoreTable(table);
    expect(scoreOf('pg', t)).toBe(10);
    expect(scoreOf('TV-PG', t)).toBe(10);
    expect(scoreOf('Unrated', t)).toBeUndefined();
    expect(scoreOf('FSK-6', t)).toBeUndefined();
    expect(scoreOf(undefined, t)).toBeUndefined();
  });

  it('a server that leaves Value out: the score from RatingScore', () => {
    const t = scoreTable([{ Name: 'TV-Y7', Value: null, RatingScore: { score: 7 } }, { Name: 'Unrated' }]);
    expect(scoreOf('TV-Y7', t)).toBe(7);
    expect(scoreOf('Unrated', t)).toBeUndefined();
  });

  it("a movie its own rating, an episode its show's (each show asked once); none = unrated", async () => {
    const scores = await ratingScores(conn, [
      movie('pg', 'PG'),
      movie('none'),
      episode('t1', 'trains'),
      episode('t2', 'trains'),
      episode('g1', 'grownup'),
      episode('b1', 'bare'),
    ]);
    expect(asObject(scores)).toEqual({ pg: 10, t1: 7, t2: 7, g1: 17 });
    const showCalls = request.mock.calls.filter(([, path]) => String(path).startsWith('/Items/'));
    expect(showCalls.map(([, path]) => path)).toEqual(['/Items/trains', '/Items/grownup', '/Items/bare']);
  });

  it("a show that can't be looked up: its episodes unrated, the rest still scored", async () => {
    const scores = await ratingScores(conn, [episode('x1', broken), episode('t1', 'trains'), movie('r', 'R')]);
    expect(asObject(scores)).toEqual({ t1: 7, r: 17 });
  });

  it('an episode without a show id uses its own rating', async () => {
    const lone: BaseItemDto = { Id: 'lone', Name: 'lone', Type: 'Episode', OfficialRating: 'TV-PG' };
    expect(asObject(await ratingScores(conn, [lone]))).toEqual({ lone: 10 });
  });

  it('reads the table once per server', async () => {
    await ratingScores(conn, [movie('a', 'PG')]);
    await ratingScores(conn, [movie('b', 'R')]);
    expect(request.mock.calls.filter(([, path]) => path === '/Localization/ParentalRatings')).toHaveLength(1);
  });

  it('no table: no scores (unrated), asked again next time', async () => {
    tableFails = true;
    expect((await ratingScores(conn, [movie('a', 'PG')])).size).toBe(0);
    tableFails = false;
    expect(asObject(await ratingScores(conn, [movie('a', 'PG')]))).toEqual({ a: 10 });
  });
});
