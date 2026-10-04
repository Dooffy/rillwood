// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import * as api from '@/api';
import { ApiError, type MediaSourceDto, type PlaybackInfoResponse } from '@/api';
import PlayerScreen from '@/app/player';
import type { PlayerProps } from '@/player/Player';
import * as session from '@/session';
import { palettes } from '@/theme';

jest.mock('expo-router', () => ({ router: { back: jest.fn() }, useLocalSearchParams: jest.fn() }));
jest.mock('expo-status-bar', () => ({ StatusBar: jest.fn(() => null) }));
// The engine is tested on its own (src/player/mpv.test.tsx); here it only records what the screen hands it.
jest.mock('@/player/Player', () => ({ Player: jest.fn(() => null) }));

const { router, useLocalSearchParams } = jest.requireMock<{
  router: { back: jest.Mock };
  useLocalSearchParams: jest.Mock;
}>('expo-router');
const { StatusBar } = jest.requireMock<{ StatusBar: jest.Mock }>('expo-status-bar');
const { Player } = jest.requireMock<{ Player: jest.Mock<(props: PlayerProps) => null> }>('@/player/Player');

const ID = 'ecdda3284954ff60759e87e5ddb37fb8';
const account: session.Account = {
  id: 'srv.a',
  server: { id: 'srv', url: 'https://jf.example.com', name: 'Home server', version: '12.1.0' },
  userId: 'a',
  userName: 'anna',
  deviceId: 'dev',
};
const source: MediaSourceDto = {
  Id: 'ms',
  SupportsDirectPlay: true,
  MediaStreams: [{ Type: 'Subtitle', Index: 2, Codec: 'subrip', IsExternal: true, Language: 'ger' }],
};
const request = jest.spyOn(api, 'getPlaybackInfo');
let reply: () => Promise<PlaybackInfoResponse | undefined>;

const lastPlayer = () => Player.mock.calls.at(-1)![0];

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(session, 'useSession').mockReturnValue({ accounts: [account], active: account });
  jest.spyOn(session, 'getSession').mockReturnValue({ accounts: [account], active: account });
  jest.spyOn(session, 'connectionFor').mockImplementation((a) => ({
    baseUrl: a.server.url,
    deviceId: a.deviceId,
    token: 'tok-secret',
    accountId: a.id,
  }));
  useLocalSearchParams.mockReturnValue({ id: ID, start: '40' });
  reply = () => Promise.resolve({ MediaSources: [source], PlaySessionId: 'ps' });
  request.mockImplementation(() => reply() as ReturnType<typeof api.getPlaybackInfo>);
});

describe('Player screen', () => {
  it('loads the play source, then plays it from the route start', async () => {
    let answer: (v: PlaybackInfoResponse) => void = () => {};
    reply = () => new Promise((resolve) => (answer = resolve));
    await render(<PlayerScreen />);
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(Player).not.toHaveBeenCalled();
    await act(async () => answer({ MediaSources: [source], PlaySessionId: 'ps' }));
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'tok-secret' }),
      ID,
      expect.objectContaining({ DeviceProfile: expect.anything() }),
      expect.any(AbortSignal),
    );
    expect(lastPlayer()).toMatchObject({
      source: {
        uri: `https://jf.example.com/Videos/${ID}/stream?static=true&mediaSourceId=ms`,
        headers: { Authorization: 'MediaBrowser Token="tok-secret"' },
      },
      externalSubs: [{ uri: `https://jf.example.com/Videos/${ID}/ms/Subtitles/2/Stream.srt`, lang: 'ger' }],
      startSeconds: 40,
    });
    // The spinner stays over the video until mpv reports the file loaded.
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    await act(() => lastPlayer().onLoad?.({ duration: 888, audio: [], subs: [] }));
    expect(screen.queryByLabelText('Loading')).toBeNull();
  });

  // mpv sends no error when a file fails to open (I15): a load that never starts must not leave a black screen.
  it('no load within 30 s → playback error + Retry', async () => {
    jest.useFakeTimers();
    try {
      await render(<PlayerScreen />);
      await act(() => jest.advanceTimersByTime(29_000));
      expect(screen.queryByText("Couldn't play this video.")).toBeNull();
      await act(() => jest.advanceTimersByTime(1_000));
      expect(screen.getByText("Couldn't play this video.")).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Retry' })).toBeOnTheScreen();
    } finally {
      jest.useRealTimers();
    }
  });

  it('a started load never times out', async () => {
    jest.useFakeTimers();
    try {
      await render(<PlayerScreen />);
      await act(() => lastPlayer().onLoad?.({ duration: 888, audio: [], subs: [] }));
      await act(() => jest.advanceTimersByTime(60_000));
      expect(screen.queryByText("Couldn't play this video.")).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it("a file the server won't send as-is: message + Retry, no player", async () => {
    reply = () => Promise.resolve({ MediaSources: [{ ...source, SupportsDirectPlay: false }] });
    await render(<PlayerScreen />);
    expect(await screen.findByText(/won't send this file as-is/)).toBeOnTheScreen();
    expect(Player).not.toHaveBeenCalled();
  });

  it('network error → Retry asks again and plays', async () => {
    reply = () => Promise.reject(new ApiError('network'));
    await render(<PlayerScreen />);
    expect(await screen.findByText("Couldn't reach the server.")).toBeOnTheScreen();
    reply = () => Promise.resolve({ MediaSources: [source] });
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(request).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Couldn't reach the server.")).toBeNull();
    expect(lastPlayer().startSeconds).toBe(40);
  });

  it('a playback error → Retry reloads from the last position', async () => {
    await render(<PlayerScreen />);
    await act(() => lastPlayer().onProgress?.({ position: 123, duration: 888 }));
    await act(() => lastPlayer().onError?.('Failed to open'));
    expect(screen.getByText("Couldn't play this video.")).toBeOnTheScreen();
    const calls = Player.mock.calls.length;
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.queryByText("Couldn't play this video.")).toBeNull();
    expect(Player.mock.calls.length).toBeGreaterThan(calls);
    expect(lastPlayer().startSeconds).toBe(123);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('an empty / zero id never asks the server', async () => {
    useLocalSearchParams.mockReturnValue({ id: '00000000000000000000000000000000' });
    await render(<PlayerScreen />);
    expect(screen.getByText("This video isn't available.")).toBeOnTheScreen();
    expect(request).not.toHaveBeenCalled();
  });

  it('a late answer after leaving the screen is dropped', async () => {
    let answer: (v: PlaybackInfoResponse) => void = () => {};
    reply = () => new Promise((resolve) => (answer = resolve));
    const { unmount } = await render(<PlayerScreen />);
    const signal = request.mock.calls[0][3];
    await unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => answer({ MediaSources: [source] }));
    expect(Player).not.toHaveBeenCalled();
  });

  it('Close goes back', async () => {
    await render(<PlayerScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  // Regression: the always-black player kept the root status bar style, so light mode drew black icons on black.
  it('forces light status bar icons and the dark palette', async () => {
    reply = () => Promise.reject(new ApiError('network'));
    await render(<PlayerScreen />);
    expect(StatusBar).toHaveBeenLastCalledWith({ style: 'light' }, undefined);
    expect(await screen.findByText("Couldn't reach the server.")).toHaveStyle({ color: palettes.dark.textSecondary });
  });
});
