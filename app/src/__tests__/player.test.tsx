// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { AccessibilityInfo, Dimensions } from 'react-native';
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

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), setParams: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
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
  router: { back: jest.Mock; setParams: jest.Mock };
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
  DefaultAudioStreamIndex: 1,
  DefaultSubtitleStreamIndex: -1,
  MediaStreams: [
    { Type: 'Audio', Index: 1, DisplayTitle: 'English - AAC - Stereo - Default' },
    { Type: 'Subtitle', Index: 2, Codec: 'subrip', IsExternal: true, Language: 'ger', DisplayTitle: 'German - SRT' },
  ],
};
const request = jest.spyOn(api, 'getPlaybackInfo');
// The title comes from the item (useFetch → api.request).
const movie: BaseItemDto = {
  Id: ID,
  Name: 'Sintel',
  Type: 'Movie',
  ProductionYear: 2010,
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
// Reporting is tested on its own (src/player/useReporting.test.ts); here only that the screen drives it.
const started = jest.spyOn(api, 'reportPlaybackStart').mockResolvedValue();
const progressed = jest.spyOn(api, 'reportPlaybackProgress').mockResolvedValue();
const stopped = jest.spyOn(api, 'reportPlaybackStopped').mockResolvedValue();

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

  // I15: a file mpv can't open (404, unsupported) shows the error at once, not after a load timeout.
  it('a file that fails to open → playback error + Retry right away', async () => {
    await render(<PlayerScreen />);
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    await act(() => lastPlayer().onError?.('loading failed'));
    expect(screen.getByText("Couldn't play this video.")).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeOnTheScreen();
    expect(screen.queryByLabelText('Loading')).toBeNull();
  });

  // The 30 s load timeout is gone (I15): a slow server keeps the spinner, mpv's own error ends the wait.
  it('a slow load keeps the spinner', async () => {
    jest.useFakeTimers();
    try {
      await render(<PlayerScreen />);
      await act(() => jest.advanceTimersByTime(60_000));
      expect(screen.queryByText("Couldn't play this video.")).toBeNull();
      expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
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

  // Regression: the menu page outlived a failed load, so the sheet reopened by itself once Retry played.
  it('a playback error with the tracks menu open: Retry plays without the menu', async () => {
    await renderPlaying();
    await fireEvent.press(screen.getByRole('button', { name: 'Audio, subtitles and speed' }));
    expect(screen.getByText('Subtitle size')).toBeOnTheScreen();
    await act(() => lastPlayer().onError?.('Failed to open'));
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    await act(() => lastPlayer().onLoad?.({ duration: 9000, audio: [], subs: [] }));
    expect(screen.queryByText('Subtitle size')).toBeNull();
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

  it('scrubber: drag and release seeks to that point', async () => {
    await renderPlaying(0);
    const scrubber = screen.getByTestId('scrubber');
    await fireEvent(scrubber, 'layout', { nativeEvent: { layout: { width: 300 } } });
    await fireEvent(scrubber, 'responderGrant', { nativeEvent: { locationX: 30 } });
    await fireEvent(scrubber, 'responderMove', { nativeEvent: { locationX: 150 } });
    expect(screen.getByText('1:15:00')).toBeOnTheScreen(); // shown while dragging
    expect(mockSeek).not.toHaveBeenCalled();
    await fireEvent(scrubber, 'responderRelease', { nativeEvent: { locationX: 150 } });
    expect(mockSeek).toHaveBeenLastCalledWith(4500);
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

  it('reports the session: start once loaded, progress on seek, stopped on leave', async () => {
    const { unmount } = await render(<PlayerScreen />);
    expect(started).not.toHaveBeenCalled();
    await act(() => lastPlayer().onLoad?.({ duration: 9000, audio: [], subs: [] }));
    expect(started).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ ItemId: ID, MediaSourceId: 'ms', PlaySessionId: 'ps', PositionTicks: 400_000_000 }),
    );
    await act(() => lastPlayer().onProgress?.({ position: 100, duration: 9000 }));
    await fireEvent.press(screen.getByRole('button', { name: 'Forward 10 seconds' }));
    expect(progressed).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ PositionTicks: 1_100_000_000 }),
    );
    await unmount();
    expect(stopped).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ PositionTicks: 1_100_000_000 }));
  });

  // I8: mpv pauses on the last frame at EOF - the screen shows it paused, controls up, and reports the end.
  it('end of file: paused with the controls up, reported at the end', async () => {
    jest.useFakeTimers();
    try {
      await renderPlaying(8990);
      await act(() => jest.advanceTimersByTime(3000));
      expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
      // The engine sends a last progress at the duration, then the end.
      await act(() => lastPlayer().onProgress?.({ position: 9000, duration: 9000 }));
      await act(() => lastPlayer().onEnd?.());
      expect(lastPlayer().paused).toBe(true);
      expect(screen.getByRole('button', { name: 'Play' })).toBeOnTheScreen();
      expect(progressed).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ IsPaused: true, PositionTicks: 90_000_000_000 }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  // I11: a stalled stream (or a reload after an early end) froze the picture with no sign of life.
  it('waiting for data while playing: spinner after a moment, gone when frames flow', async () => {
    jest.useFakeTimers();
    try {
      await renderPlaying();
      await act(() => lastPlayer().onBuffering?.(true));
      await act(() => jest.advanceTimersByTime(400));
      expect(screen.queryByLabelText('Loading')).toBeNull();
      await act(() => jest.advanceTimersByTime(100));
      expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
      await act(() => lastPlayer().onBuffering?.(false));
      expect(screen.queryByLabelText('Loading')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  // Regression: an error mid-stall left the stall state on, so the retried video showed the spinner at once.
  it('an error ends the wait: after Retry the video plays without the stall spinner', async () => {
    await renderPlaying();
    await act(() => lastPlayer().onBuffering?.(true));
    await act(() => lastPlayer().onError?.('Stream ended early'));
    await act(() => fireEvent.press(screen.getByRole('button', { name: 'Retry' })));
    await act(() => lastPlayer().onLoad?.({ duration: 9000, audio: [], subs: [] }));
    expect(screen.queryByLabelText('Loading')).toBeNull();
  });

  it('a quick seek does not flash the spinner', async () => {
    jest.useFakeTimers();
    try {
      await renderPlaying();
      await act(() => lastPlayer().onBuffering?.(true));
      await act(() => jest.advanceTimersByTime(200));
      await act(() => lastPlayer().onBuffering?.(false));
      await act(() => jest.advanceTimersByTime(1000));
      expect(screen.queryByLabelText('Loading')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('starts with the server defaults (as mpv ids): audio 1, subtitles off', async () => {
    await renderPlaying();
    // The test window is portrait: subtitles a step larger.
    expect(lastPlayer()).toMatchObject({ audioTrack: 1, subtitleTrack: -1, speed: 1, subtitleScale: 1.25 });
  });

  it('subtitle size: a step larger in portrait, as chosen in landscape', async () => {
    const portrait = Dimensions.get('window');
    try {
      await renderPlaying();
      expect(lastPlayer().subtitleScale).toBe(1.25);
      await act(() => Dimensions.set({ window: { ...portrait, width: portrait.height, height: portrait.width } }));
      await fireEvent.press(screen.getByRole('button', { name: 'Audio, subtitles and speed' }));
      await fireEvent.press(screen.getByText('Subtitle size'));
      await fireEvent.press(screen.getByText('Large'));
      expect(lastPlayer().subtitleScale).toBe(1.25);
    } finally {
      await act(() => Dimensions.set({ window: portrait }));
    }
  });

  it('tracks menu: current values, pick a subtitle, change speed; controls stay up while it is open', async () => {
    jest.useFakeTimers();
    try {
      await renderPlaying();
      await fireEvent.press(screen.getByRole('button', { name: 'Audio, subtitles and speed' }));
      expect(screen.getByText('English - AAC - Stereo')).toBeOnTheScreen(); // Audio row's current value
      expect(screen.getByText('Off')).toBeOnTheScreen(); // Subtitles row
      await act(() => jest.advanceTimersByTime(10_000));
      expect(screen.getByRole('button', { name: 'Pause' })).toBeOnTheScreen();

      await fireEvent.press(screen.getByText('Subtitles'));
      await fireEvent.press(screen.getByText('German - SRT'));
      expect(lastPlayer().subtitleTrack).toBe(1);

      await fireEvent.press(screen.getByRole('button', { name: 'Audio, subtitles and speed' }));
      await fireEvent.press(screen.getByText('Speed'));
      await fireEvent.press(screen.getByText('1.5×'));
      expect(lastPlayer().speed).toBe(1.5);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('Up Next', () => {
  const [EP1, EP2] = ['e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1', 'e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2'];
  const episode = (Id: string, n: number): BaseItemDto => ({
    Id,
    Name: n === 1 ? 'Pilot' : 'Second',
    Type: 'Episode',
    SeriesId: 'show',
    SeriesName: 'Test Show',
    ParentIndexNumber: 1,
    IndexNumber: n,
  });
  // Item detail + `/Shows/{id}/Episodes?startItemId=`: this episode and the next (only itself for the last one).
  const episodes = [episode(EP1, 1), episode(EP2, 2)];

  beforeEach(() => {
    useLocalSearchParams.mockReturnValue({ id: EP1, start: '0' });
    itemRequest.mockImplementation(((_conn: unknown, path: string, opts?: { query?: { startItemId?: string } }) => {
      if (path === '/Shows/show/Episodes') {
        const at = episodes.findIndex((e) => e.Id === opts?.query?.startItemId);
        return Promise.resolve({ Items: episodes.slice(at, at + 2), TotalRecordCount: episodes.length - at });
      }
      return Promise.resolve(episodes.find((e) => path === `/Items/${e.Id}`));
    }) as never);
    router.setParams.mockImplementation((params) => useLocalSearchParams.mockReturnValue(params));
  });

  async function playAt(position: number) {
    const view = await render(<PlayerScreen />);
    await act(() => lastPlayer().onLoad?.({ duration: 1400, audio: [], subs: [] }));
    await act(() => lastPlayer().onProgress?.({ position, duration: 1400 }));
    return view;
  }

  it('shows in the last 30 s with the countdown, then the end plays the next episode in the same player', async () => {
    const { rerender } = await playAt(1300);
    expect(screen.queryByText('S1, E2 · Second')).toBeNull();
    // Speed stays for the next episode; a subtitle pick (an mpv id of this file) doesn't.
    await fireEvent.press(screen.getByRole('button', { name: 'Audio, subtitles and speed' }));
    await fireEvent.press(screen.getByText('Speed'));
    await fireEvent.press(screen.getByText('1.5×'));
    await fireEvent.press(screen.getByRole('button', { name: 'Audio, subtitles and speed' }));
    await fireEvent.press(screen.getByText('Subtitles'));
    await fireEvent.press(screen.getByText('German - SRT'));
    expect(lastPlayer().subtitleTrack).toBe(1);

    await act(() => lastPlayer().onProgress?.({ position: 1388.2, duration: 1400 }));
    expect(screen.getByText('S1, E2 · Second')).toBeOnTheScreen();
    expect(screen.getByText('Up Next · 12s')).toBeOnTheScreen();
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Up next: S1, E2 · Second');

    await act(() => lastPlayer().onProgress?.({ position: 1400, duration: 1400 }));
    await act(() => lastPlayer().onEnd?.());
    expect(router.setParams).toHaveBeenCalledWith({ id: EP2, start: '0' });
    await rerender(<PlayerScreen />);
    // The finished episode is stopped at its end (played), the next one loads from its start.
    expect(stopped).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ ItemId: EP1, PositionTicks: 14_000_000_000 }),
    );
    expect(request).toHaveBeenLastCalledWith(expect.anything(), EP2, expect.anything(), expect.any(AbortSignal));
    await act(async () => {});
    expect(lastPlayer()).toMatchObject({ startSeconds: 0, paused: false, speed: 1.5, subtitleTrack: -1 });
    expect(screen.queryByText('S1, E2 · Second')).toBeNull();
  });

  it('a tap on the tile plays the next episode right away', async () => {
    await playAt(1380);
    await fireEvent.press(screen.getByRole('button', { name: 'Play next episode, S1, E2 · Second' }));
    expect(router.setParams).toHaveBeenCalledWith({ id: EP2, start: '0' });
  });

  it('Hide: the card goes, the end pauses as without a next episode', async () => {
    await playAt(1380);
    await fireEvent.press(screen.getByRole('button', { name: 'Hide Up Next' }));
    expect(screen.queryByText('S1, E2 · Second')).toBeNull();
    await act(() => lastPlayer().onProgress?.({ position: 1400, duration: 1400 }));
    await act(() => lastPlayer().onEnd?.());
    expect(router.setParams).not.toHaveBeenCalled();
    expect(lastPlayer().paused).toBe(true);
  });

  // The tile stays mounted while the controls come and go: the ring keeps running, VoiceOver hears it once.
  it('stays up, without remounting, when the controls hide', async () => {
    jest.useFakeTimers();
    try {
      await playAt(1380);
      await act(() => jest.advanceTimersByTime(3000));
      expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
      expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: 'Play next episode, S1, E2 · Second' })).toBeOnTheScreen();
    } finally {
      jest.useRealTimers();
    }
  });

  it('the last episode has no Up Next and pauses at the end', async () => {
    useLocalSearchParams.mockReturnValue({ id: EP2, start: '0' });
    await playAt(1390);
    expect(screen.queryByRole('button', { name: 'Play next episode, S1, E2 · Second' })).toBeNull();
    await act(() => lastPlayer().onEnd?.());
    expect(router.setParams).not.toHaveBeenCalled();
    expect(lastPlayer().paused).toBe(true);
  });

  it('a movie has no Up Next', async () => {
    itemRequest.mockImplementation(() => Promise.resolve(movie) as Promise<never>);
    useLocalSearchParams.mockReturnValue({ id: ID, start: '0' });
    await playAt(1390);
    expect(screen.queryByRole('button', { name: 'Play next episode, S1, E2 · Second' })).toBeNull();
    expect(itemRequest).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('/Shows/'),
      expect.anything(),
    );
  });

  it('a next episode started before resumes at its saved position', async () => {
    episodes[1] = {
      ...episode(EP2, 2),
      RunTimeTicks: 14_000_000_000,
      UserData: { Played: false, PlaybackPositionTicks: 6_005_000_000 },
    };
    try {
      await playAt(1380);
      await fireEvent.press(screen.getByRole('button', { name: 'Play next episode, S1, E2 · Second' }));
      expect(router.setParams).toHaveBeenCalledWith({ id: EP2, start: '600' });
    } finally {
      episodes[1] = episode(EP2, 2);
    }
  });

  // Review fix: the scrubber unmounts with the finished episode mid-drag, so its release never reports.
  it('an end during a drag: the next episode hides its controls as usual', async () => {
    jest.useFakeTimers();
    try {
      const { rerender } = await playAt(1380);
      const scrubber = screen.getByTestId('scrubber');
      await fireEvent(scrubber, 'layout', { nativeEvent: { layout: { width: 300 } } });
      await fireEvent(scrubber, 'responderGrant', { nativeEvent: { locationX: 299 } });
      await act(() => lastPlayer().onEnd?.());
      await rerender(<PlayerScreen />);
      await act(async () => {});
      await act(() => lastPlayer().onLoad?.({ duration: 1400, audio: [], subs: [] }));
      expect(screen.getByRole('button', { name: 'Close' })).toBeOnTheScreen();
      await act(() => jest.advanceTimersByTime(3000));
      expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('steps aside while the video is pulled down, back when it springs back', async () => {
    await playAt(1380);
    const pull = createGestureController(getByGestureTestId('player-pull'));
    await act(() => pull.begin({ translationY: 0 }));
    await act(() => pull.activate({ translationY: 20 }));
    expect(screen.queryByText('S1, E2 · Second')).toBeNull();
    await act(() => pull.end({ translationY: 40, velocityY: 0 }));
    expect(screen.getByText('S1, E2 · Second')).toBeOnTheScreen();
  });

  it('VoiceOver hears it once, even when a seek leaves the last 30 s and comes back', async () => {
    await playAt(1380);
    await act(() => lastPlayer().onProgress?.({ position: 1300, duration: 1400 }));
    expect(screen.queryByText('S1, E2 · Second')).toBeNull();
    await act(() => lastPlayer().onProgress?.({ position: 1385, duration: 1400 }));
    expect(screen.getByText('S1, E2 · Second')).toBeOnTheScreen();
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledTimes(1);
  });
});
