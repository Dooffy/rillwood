// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import * as api from '@/api';
import type { PlaySource } from '@/playback';
import { createProgress } from '@/player/progress';
import * as session from '@/session';
import * as useFetch from '@/useFetch';

import { PROGRESS_INTERVAL_MS, useReporting } from './useReporting';

const account: session.Account = {
  id: 'srv.a',
  server: { id: 'srv', url: 'https://jf.example.com', name: 'Home', version: '12.1.0' },
  userId: 'a',
  userName: 'anna',
  deviceId: 'dev',
};
const play: PlaySource = {
  mediaSourceId: 'ms',
  playSessionId: 'ps',
  source: { uri: 'https://jf.example.com/Videos/i/stream?static=true&mediaSourceId=ms', headers: {} },
  externalSubs: [],
};

const start = jest.spyOn(api, 'reportPlaybackStart');
const progressed = jest.spyOn(api, 'reportPlaybackProgress');
const stopped = jest.spyOn(api, 'reportPlaybackStopped');
const invalidate = jest.spyOn(useFetch, 'invalidate');
let appStateListener: ((state: AppStateStatus) => void) | undefined;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  [start, progressed, stopped].forEach((m) => m.mockResolvedValue(undefined));
  invalidate.mockImplementation(() => {});
  jest.spyOn(session, 'getSession').mockReturnValue({ accounts: [account], active: account });
  jest.spyOn(session, 'connectionFor').mockImplementation((a) => ({
    baseUrl: a.server.url,
    deviceId: a.deviceId,
    token: 'tok',
    accountId: a.id,
  }));
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListener = listener as (state: AppStateStatus) => void;
    return { remove: jest.fn() } as never;
  });
});

afterEach(() => {
  jest.useRealTimers();
});

type Props = Parameters<typeof useReporting>[0];
const progress = createProgress(40);
const base: Props = { accountId: 'srv.a', itemId: 'i', play, started: true, paused: false, progress };
const mount = (props: Partial<Props> = {}) =>
  renderHook((p: Props) => useReporting(p), { initialProps: { ...base, ...props } });
const ticks = (s: number) => s * 10_000_000;

describe('useReporting', () => {
  beforeEach(() => progress.set({ position: 40, duration: 900 }));

  it('nothing until the file has loaded', async () => {
    const { rerender } = await mount({ started: false });
    expect(start).not.toHaveBeenCalled();
    await rerender({ ...base });
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'srv.a' }),
      expect.objectContaining({ ItemId: 'i', PlaySessionId: 'ps', PositionTicks: ticks(40), IsPaused: false }),
    );
  });

  it('progress every 10 s, paused too (IsPaused); pause / unpause reported at once', async () => {
    const { rerender } = await mount();
    progress.set({ position: 50 });
    await act(() => jest.advanceTimersByTime(PROGRESS_INTERVAL_MS));
    expect(progressed).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ PositionTicks: ticks(50), EventName: 'TimeUpdate', IsPaused: false }),
    );
    await act(async () => rerender({ ...base, paused: true }));
    expect(progressed).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ EventName: 'Pause', IsPaused: true }),
    );
    // The server ends sessions that stop checking in: a paused session keeps reporting.
    await act(() => jest.advanceTimersByTime(PROGRESS_INTERVAL_MS));
    expect(progressed).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ EventName: 'TimeUpdate', IsPaused: true }),
    );
    await act(async () => rerender({ ...base, paused: false }));
    expect(progressed).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ EventName: 'Unpause' }));
  });

  it('paused before the file loaded: the start says so, no extra pause report', async () => {
    const { rerender } = await mount({ started: false, paused: true });
    await act(async () => rerender({ ...base, paused: true }));
    expect(start).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ IsPaused: true }));
    expect(progressed).not.toHaveBeenCalled();
  });

  it('seeks and leaving the app send the position', async () => {
    const { result } = await mount();
    progress.set({ position: 300 });
    await act(() => result.current.seeked());
    expect(progressed).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ PositionTicks: ticks(300) }),
    );
    progress.set({ position: 310 });
    // iOS `inactive` (Control Center, notifications) is not leaving the app.
    const calls = progressed.mock.calls.length;
    await act(() => appStateListener?.('inactive'));
    expect(progressed).toHaveBeenCalledTimes(calls);
    await act(() => appStateListener?.('background'));
    expect(progressed).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ PositionTicks: ticks(310) }),
    );
  });

  it('stopped with the last position on leave, then everything refetches', async () => {
    const { unmount } = await mount();
    progress.set({ position: 812 });
    await unmount();
    expect(stopped).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ PositionTicks: ticks(812) }));
    await act(async () => {});
    expect(invalidate).toHaveBeenCalled();
    progressed.mockClear();
    await act(() => jest.advanceTimersByTime(PROGRESS_INTERVAL_MS * 2));
    expect(progressed).not.toHaveBeenCalled();
  });

  it('a new load (Retry) stops the old session before starting the new one', async () => {
    const { rerender } = await mount();
    await act(async () => rerender({ ...base, play: { ...play, playSessionId: 'ps2' } }));
    expect(stopped).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ PlaySessionId: 'ps' }));
    expect(start).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ PlaySessionId: 'ps2' }));
    expect(stopped.mock.invocationCallOrder[0]).toBeLessThan(start.mock.invocationCallOrder.at(-1)!);
  });

  it('a playback error (player gone) stops with the last position', async () => {
    const { rerender } = await mount();
    progress.set({ position: 205 });
    await act(async () => rerender({ ...base, play: undefined }));
    expect(stopped).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ PositionTicks: ticks(205) }));
  });

  // Regression: an in-flight Progress could land after Stopped and revive the session / rewrite the position.
  it('stopped waits for a report still in flight', async () => {
    let finish: () => void = () => {};
    const { result, unmount } = await mount();
    await act(async () => {});
    progressed.mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)));
    await act(() => result.current.seeked());
    await unmount();
    await act(async () => {});
    expect(stopped).not.toHaveBeenCalled();
    await act(async () => finish());
    expect(stopped).toHaveBeenCalled();
  });

  it('a failed report is dropped quietly', async () => {
    start.mockRejectedValue(new api.ApiError('network'));
    await mount();
    await act(async () => {});
    expect(start).toHaveBeenCalled();
  });

  it('signed out (no connection) reports nothing', async () => {
    jest.spyOn(session, 'connectionFor').mockReturnValue(null);
    await mount();
    expect(start).not.toHaveBeenCalled();
  });
});
