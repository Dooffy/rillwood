// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { AccessibilityInfo } from 'react-native';
import { State } from 'react-native-gesture-handler';
import {
  createGestureController,
  fireGestureHandler,
  getByGestureTestId,
} from 'react-native-gesture-handler/jest-utils';

import * as api from '@/api';
import { ApiError, type BaseItemDto, type MediaSourceDto, type PlaybackInfoResponse } from '@/api';
import PlayerScreen from '@/app/player';
import type { PlayerProps } from '@/player/Player';
import * as session from '@/session';
import { palettes } from '@/theme';

jest.mock('expo-router', () => ({ router: { back: jest.fn() }, useLocalSearchParams: jest.fn() }));
jest.mock('expo-status-bar', () => ({ StatusBar: jest.fn(() => null) }));
// The engine is tested on its own (src/player/mpv.test.tsx); here it records what the screen hands it and its ref calls.
const mockSeek = jest.fn();
jest.mock('@/player/Player', () => {
  const { forwardRef, useImperativeHandle } = jest.requireActual<typeof import('react')>('react');
  const render = jest.fn((props: unknown, ref: unknown) => {
    useImperativeHandle(ref as never, () => ({ seek: mockSeek, play: jest.fn(), pause: jest.fn() }));
    return null;
  });
  return { Player: forwardRef(render), renderPlayer: render };
});

const { router, useLocalSearchParams } = jest.requireMock<{
  router: { back: jest.Mock };
  useLocalSearchParams: jest.Mock;
}>('expo-router');
const { StatusBar } = jest.requireMock<{ StatusBar: jest.Mock }>('expo-status-bar');
const { renderPlayer: Player } = jest.requireMock<{ renderPlayer: jest.Mock }>('@/player/Player');

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
// Title + chapters come from the item (useFetch → api.request).
const movie: BaseItemDto = {
  Id: ID,
  Name: 'Sintel',
  Type: 'Movie',
  ProductionYear: 2010,
  Chapters: [
    { StartPositionTicks: 0 },
    { StartPositionTicks: 3000 * 10_000_000 },
    { StartPositionTicks: 6000 * 10_000_000 },
  ],
};
const itemRequest = jest.spyOn(api, 'request');
let reply: () => Promise<PlaybackInfoResponse | undefined>;

const lastPlayer = () => Player.mock.calls.at(-1)![0] as PlayerProps;

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
  itemRequest.mockImplementation(() => Promise.resolve(movie) as Promise<never>);
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
});

/** Renders, lets mpv report the load (duration 888 s) and a position. */
async function renderPlaying(position = 100) {
  await render(<PlayerScreen />);
  await act(() => lastPlayer().onLoad?.({ duration: 9000, audio: [], subs: [] }));
  await act(() => lastPlayer().onProgress?.({ position, duration: 9000 }));
}

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
    expect(StatusBar).toHaveBeenLastCalledWith({ style: 'light', hidden: false }, undefined);
    expect(await screen.findByText("Couldn't reach the server.")).toHaveStyle({ color: palettes.dark.textSecondary });
  });

  it('top bar: close + the item title, before playback starts too', async () => {
    reply = () => new Promise(() => {});
    await render(<PlayerScreen />);
    expect(screen.getByRole('button', { name: 'Close' })).toBeOnTheScreen();
    expect(await screen.findByText('Sintel')).toBeOnTheScreen();
    expect(screen.getByText('2010')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
  });

  it('controls hide 3 s after playback starts, status bar with them; a tap brings them back', async () => {
    jest.useFakeTimers();
    try {
      await renderPlaying();
      expect(screen.getByRole('button', { name: 'Pause' })).toBeOnTheScreen();
      await act(() => jest.advanceTimersByTime(3000));
      expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
      expect(StatusBar).toHaveBeenLastCalledWith({ style: 'light', hidden: true }, undefined);
      await act(() => fireGestureHandler(getByGestureTestId('player-tap')));
      expect(screen.getByRole('button', { name: 'Close' })).toBeOnTheScreen();
    } finally {
      jest.useRealTimers();
    }
  });

  it('pause keeps the controls up and pauses the player', async () => {
    jest.useFakeTimers();
    try {
      await renderPlaying();
      await fireEvent.press(screen.getByRole('button', { name: 'Pause' }));
      expect(lastPlayer().paused).toBe(true);
      await act(() => jest.advanceTimersByTime(10_000));
      expect(screen.getByRole('button', { name: 'Play' })).toBeOnTheScreen();
    } finally {
      jest.useRealTimers();
    }
  });

  it('VoiceOver on: controls never hide', async () => {
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
    jest.useFakeTimers();
    try {
      await renderPlaying();
      await act(() => jest.advanceTimersByTime(10_000));
      expect(screen.getByRole('button', { name: 'Close' })).toBeOnTheScreen();
    } finally {
      jest.useRealTimers();
    }
  });

  it('±10 s buttons seek from the current position, clamped to the file', async () => {
    await renderPlaying(5);
    await fireEvent.press(screen.getByRole('button', { name: 'Back 10 seconds' }));
    expect(mockSeek).toHaveBeenLastCalledWith(0);
    await act(() => lastPlayer().onProgress?.({ position: 8995, duration: 9000 }));
    await fireEvent.press(screen.getByRole('button', { name: 'Forward 10 seconds' }));
    expect(mockSeek).toHaveBeenLastCalledWith(9000);
  });

  // The test helper fills states it isn't given with defaults: give x in every one.
  const doubleTapAt = (absoluteX: number) =>
    fireGestureHandler(getByGestureTestId('player-double-tap'), [
      { state: State.BEGAN, absoluteX },
      { state: State.ACTIVE, absoluteX },
      { state: State.END, absoluteX },
    ]);

  it('double tap: left half back, right half forward', async () => {
    await renderPlaying(100);
    await act(() => doubleTapAt(10));
    expect(mockSeek).toHaveBeenLastCalledWith(90);
    await act(() => doubleTapAt(10_000));
    expect(mockSeek).toHaveBeenLastCalledWith(100);
  });

  it('scrubber: drag and release seeks to that point; chapter marks inside the track', async () => {
    await renderPlaying(0);
    const scrubber = screen.getByTestId('scrubber');
    await fireEvent(scrubber, 'layout', { nativeEvent: { layout: { width: 300 } } });
    await fireEvent(scrubber, 'responderGrant', { nativeEvent: { locationX: 30 } });
    await fireEvent(scrubber, 'responderMove', { nativeEvent: { locationX: 150 } });
    expect(screen.getByText('1:15:00')).toBeOnTheScreen(); // shown while dragging
    expect(mockSeek).not.toHaveBeenCalled();
    await fireEvent(scrubber, 'responderRelease', { nativeEvent: { locationX: 150 } });
    expect(mockSeek).toHaveBeenLastCalledWith(4500);
    expect(screen.getAllByTestId('chapter-mark', { includeHiddenElements: true })).toHaveLength(2);
  });

  it('scrubber with VoiceOver: swipe up / down = ±10 s', async () => {
    await renderPlaying(100);
    const scrubber = screen.getByRole('adjustable', { name: 'Playback position' });
    await fireEvent(scrubber, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(mockSeek).toHaveBeenLastCalledWith(110);
  });

  it('pull down past the threshold closes, a short pull springs back', async () => {
    await renderPlaying();
    await act(() => fireGestureHandler(getByGestureTestId('player-pull'), [{ translationY: 60, velocityY: 0 }]));
    expect(router.back).not.toHaveBeenCalled();
    await act(() => fireGestureHandler(getByGestureTestId('player-pull'), [{ translationY: 200, velocityY: 0 }]));
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('pulling past the threshold shows "Release to close"; pulling back up hides it and springs back', async () => {
    await renderPlaying();
    const pull = createGestureController(getByGestureTestId('player-pull'));
    await act(() => pull.begin({ translationY: 0 }));
    await act(() => pull.activate({ translationY: 20 }));
    await act(() => pull.update({ translationY: 80 }));
    expect(screen.queryByText('Release to close')).toBeNull();
    await act(() => pull.update({ translationY: 160 }));
    expect(screen.getByText('Release to close')).toBeOnTheScreen();
    await act(() => pull.update({ translationY: 60 }));
    expect(screen.queryByText('Release to close')).toBeNull();
    await act(() => pull.end({ translationY: 60, velocityY: 0 }));
    expect(router.back).not.toHaveBeenCalled();
  });

  it('the only screen that rotates: unlocked while open, upright portrait again on leave', async () => {
    const lock = jest.spyOn(ScreenOrientation, 'lockAsync').mockResolvedValue();
    const { unmount } = await render(<PlayerScreen />);
    expect(lock).toHaveBeenLastCalledWith(ScreenOrientation.OrientationLock.DEFAULT);
    await unmount();
    expect(lock).toHaveBeenLastCalledWith(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  });

  // Regression: taps during loading toggled the hidden "shown" flag (and swallowed Retry on Android), so the controls
  // vanished the moment playback started.
  it('taps before playback starts do nothing; the controls still show when it does', async () => {
    reply = () => Promise.reject(new ApiError('network'));
    await render(<PlayerScreen />);
    await screen.findByText("Couldn't reach the server.");
    await act(() => fireGestureHandler(getByGestureTestId('player-tap')));
    reply = () => Promise.resolve({ MediaSources: [source] });
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    await act(() => lastPlayer().onLoad?.({ duration: 9000, audio: [], subs: [] }));
    expect(screen.getByRole('button', { name: 'Pause' })).toBeOnTheScreen();
  });
});
