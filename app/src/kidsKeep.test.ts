// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import * as api from './api';
import type { BaseItemDto, RequestOptions } from './api';
import * as downloads from './downloads';
import { topUpKept } from './kidsKeep';
import { forgetKids, setKids } from './kidsSettings';
import * as session from './session';

const server = { id: 'srv', url: 'https://jf.example.com', name: 'Home server', version: '12.1.0' };
const account: session.Account = { id: 'srv.k', server, userId: 'k', userName: 'mia', deviceId: 'dev' };

const ep = (Id: string, SeriesId: string, played = false): BaseItemDto => ({
  Id,
  Name: Id,
  Type: 'Episode',
  SeriesId,
  ParentIndexNumber: 1,
  UserData: { PlaybackPositionTicks: 0, Played: played },
  MediaSources: [{ Id: `${Id}-ms`, Size: 1e9, Container: 'mkv' }],
});
const items = (...list: BaseItemDto[]) => ({ Items: list, TotalRecordCount: list.length });
// Show "a": e1-e7, Next Up e3. Show "b": fails.
const show = ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7'].map((id, i) => ep(id, 'a', i < 2));

const request = jest.spyOn(api, 'request');
const started = jest.spyOn(downloads, 'startDownloads');

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(session, 'getSession').mockImplementation(() => ({ accounts: [account], active: account }));
  jest.spyOn(session, 'connectionFor').mockImplementation(() => ({
    baseUrl: server.url,
    deviceId: 'dev',
    token: 'tok',
    accountId: account.id,
  }));
  request.mockImplementation((_conn, path: string, options?: RequestOptions) => {
    if (path.includes('/b/') || options?.query?.seriesId === 'b') return Promise.reject(new api.ApiError('network'));
    if (path === '/Shows/NextUp') return Promise.resolve(items(show[2]) as never);
    return Promise.resolve(items(...show) as never);
  });
  started.mockResolvedValue({ ok: true, started: 1, skipped: 0 });
});

afterEach(() => forgetKids(account.id));

const startedIds = () => started.mock.calls.map((call) => call[0].map((r) => r.item.Id));

describe('topUpKept', () => {
  it('nothing kept: asks nothing', async () => {
    await topUpKept();
    expect(request).not.toHaveBeenCalled();
    expect(started).not.toHaveBeenCalled();
  });

  it('asks for each kept show its next 5 from Next Up (the store skips what is here)', async () => {
    setKids(account.id, { kept: ['a'] });
    await topUpKept();
    expect(startedIds()).toEqual([['e3', 'e4', 'e5', 'e6', 'e7']]);
  });

  it('a show that fails is skipped this time; the others still go', async () => {
    setKids(account.id, { kept: ['b', 'a'] });
    await topUpKept();
    expect(startedIds()).toEqual([['e3', 'e4', 'e5', 'e6', 'e7']]);
  });

  it('signed out: nothing', async () => {
    setKids(account.id, { kept: ['a'] });
    jest.mocked(session.connectionFor).mockReturnValue(null);
    await topUpKept();
    expect(started).not.toHaveBeenCalled();
  });
});
