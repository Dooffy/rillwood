// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV player controls (screen draft 10): the title on top, the scrubber + track buttons at the bottom, and the
// remote - click / Play-Pause, Left / Right 10 s (held: repeats, faster the longer), a swipe scrubs with a preview, Back hides the controls then closes.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { AccessibilityInfo, AppState, BackHandler, Platform, StyleSheet } from 'react-native';

import * as api from '@/api';
import type { BaseItemDto, MediaSourceDto } from '@/api';
import PlayerScreen from '@/app/player';
import { TvMenuHost } from '@/components/tv/TvMenu';
import * as downloads from '@/downloads';
import type { PlayerProps } from '@/player/Player';
import type { RemoteEvent } from '@/player/tvRemote';
import * as session from '@/session';
import * as settings from '@/settings';
import { resetDevice, setDevice } from '@/testDevice';
import { tv } from '@/theme';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), setParams: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ id: 'ecdda3284954ff60759e87e5ddb37fb8', start: '100' })),
}));
jest.mock('expo-status-bar', () => ({ StatusBar: jest.fn(() => null) }));
const mockSeek = jest.fn();
jest.mock('@/player/Player', () => {
  const { forwardRef, useImperativeHandle } = jest.requireActual<typeof import('react')>('react');
  const render = jest.fn((props: unknown, ref: unknown) => {
    useImperativeHandle(ref as never, () => ({ seek: mockSeek, play: jest.fn(), pause: jest.fn() }));
    return null;
  });
  return { Player: forwardRef(render), renderPlayer: render };
});
// The remote: the screen's handler, called by the tests as the remote would.
let mockRemote: ((event: RemoteEvent) => void) | undefined;
jest.mock('react-native/Libraries/Components/TV/useTVEventHandler', () => ({
  __esModule: true,
  default: (handler: (event: RemoteEvent) => void) => {
    mockRemote = handler;
  },
}));

const { router, useLocalSearchParams } = jest.requireMock<{
  router: { back: jest.Mock; setParams: jest.Mock };
  useLocalSearchParams: jest.Mock;
}>('expo-router');
const { renderPlayer: Player } = jest.requireMock<{ renderPlayer: jest.Mock }>('@/player/Player');
const lastPlayer = () => Player.mock.calls.at(-1)![0] as PlayerProps;

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
    { Type: 'Subtitle', Index: 2, Codec: 'subrip', IsExternal: true, Language: 'eng', DisplayTitle: 'English - SRT' },
  ],
};
const movie: BaseItemDto = {
  Id: 'ecdda3284954ff60759e87e5ddb37fb8',
  Name: 'Sintel',
  Type: 'Movie',
  ProductionYear: 2010,
};

const isTV = Object.getOwnPropertyDescriptor(Platform, 'isTV')!;
let back: (() => boolean)[] = [];
beforeEach(() => {
  jest.clearAllMocks();
  back = [];
  Object.defineProperty(Platform, 'isTV', { get: () => true, configurable: true });
  jest.spyOn(session, 'useSession').mockReturnValue({ accounts: [account], active: account });
  jest.spyOn(session, 'getSession').mockReturnValue({ accounts: [account], active: account });
  jest.spyOn(session, 'connectionFor').mockImplementation((a) => ({
    baseUrl: a.server.url,
    deviceId: a.deviceId,
    token: 'tok-secret',
    accountId: a.id,
  }));
  jest.spyOn(api, 'getPlaybackInfo').mockResolvedValue({ MediaSources: [source], PlaySessionId: 'ps' });
  jest.spyOn(api, 'request').mockImplementation(() => Promise.resolve(movie) as Promise<never>);
  jest.spyOn(api, 'reportPlaybackStart').mockResolvedValue();
  jest.spyOn(api, 'reportPlaybackProgress').mockResolvedValue();
  jest.spyOn(api, 'reportPlaybackStopped').mockResolvedValue();
  jest.spyOn(downloads, 'localCopy').mockReturnValue(null);
  jest.spyOn(downloads, 'savedItem').mockReturnValue(null);
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
  settings.setSubtitleMode('server');
  settings.setAudioLanguage('server');
  settings.setSubtitleLanguage('server');
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_, handler) => {
    back.push(handler as () => boolean);
    return { remove: () => (back = back.filter((h) => h !== handler)) };
  });
});
afterEach(() => {
  Object.defineProperty(Platform, 'isTV', isTV);
});

/** Renders, lets mpv load (9000 s) and report 100 s. */
async function renderPlaying() {
  await render(
    <TvMenuHost>
      <PlayerScreen />
    </TvMenuHost>,
  );
  await act(() => lastPlayer().onLoad?.({ duration: 9000, audio: [], subs: [] }));
  await act(() => lastPlayer().onProgress?.({ position: 100, duration: 9000 }));
}
const press = (eventType: string, body?: RemoteEvent['body']) =>
  act(() => mockRemote!({ eventType, eventKeyAction: 1, body }));

describe('Player on Apple TV', () => {
  it('controls: the title on top, the scrubber and track buttons at the bottom; no close or ⟲ ⏯ ⟳ buttons', async () => {
    await renderPlaying();
    expect(screen.getByTestId('tv-player-top')).toHaveTextContent(/Sintel/);
    expect(screen.getByTestId('tv-scrubber').props.hasTVPreferredFocus).toBe(true);
    expect(screen.getByRole('button', { name: 'Subtitles, off' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Audio' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Speed, 1×' })).toBeOnTheScreen();
    // Speed shows as text in its circle.
    expect(screen.getByRole('button', { name: 'Speed, 1×' })).toHaveTextContent('1×');
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Back 10 seconds' })).toBeNull();
  });

  it('the video always fits, even with fill saved (no zoom button on a TV) - regression', async () => {
    await setDevice(1920, 1080);
    settings.setVideoZoom('fill');
    try {
      await renderPlaying();
      expect((Player.mock.calls.at(-1)?.[0] as { zoom: string }).zoom).toBe('fit');
    } finally {
      settings.setVideoZoom('fit');
      resetDevice();
    }
  });

  it('Play-Pause and a click on the scrubber play / pause', async () => {
    await renderPlaying();
    await press('playPause');
    expect(lastPlayer().paused).toBe(true);
    await fireEvent.press(screen.getByTestId('tv-scrubber'));
    expect(lastPlayer().paused).toBe(false);
  });

  it('Left / Right seek 10 s - not while a track button has focus (focus moves there)', async () => {
    await renderPlaying();
    await press('right');
    expect(mockSeek).toHaveBeenLastCalledWith(110);
    await fireEvent(screen.getByRole('button', { name: 'Audio' }), 'focus', { currentTarget: {} });
    await press('left');
    expect(mockSeek).toHaveBeenCalledTimes(1);
    await fireEvent(screen.getByTestId('tv-scrubber'), 'focus', { currentTarget: {} });
    await press('left');
    expect(mockSeek).toHaveBeenLastCalledWith(100);
  });

  describe('Left / Right held', () => {
    afterEach(() => {
      jest.useRealTimers();
    });
    const hold = (eventType: 'longLeft' | 'longRight', eventKeyAction: 0 | 1) =>
      act(() => mockRemote!({ eventType, eventKeyAction }));
    const advance = (ms: number) => act(() => jest.advanceTimersByTime(ms));
    const seekReports = () =>
      jest
        .mocked(api.reportPlaybackProgress)
        .mock.calls.filter(([, report]) => (report as { EventName?: string }).EventName === 'TimeUpdate').length;

    it('keeps seeking every 300 ms, 10 s then 30 s after 2 s; reported once, at the end; no extra click', async () => {
      await renderPlaying();
      jest.useFakeTimers();
      await hold('longRight', 0);
      expect(mockSeek).toHaveBeenLastCalledWith(110);
      await advance(300);
      expect(mockSeek).toHaveBeenLastCalledWith(120);
      // 600 - 1800 ms: five more 10 s steps; 2100 ms: 30 s.
      await advance(1800);
      expect(mockSeek).toHaveBeenLastCalledWith(200);
      expect(seekReports()).toBe(0);
      await hold('longRight', 1);
      expect(seekReports()).toBe(1);
      // The release's own click (if one comes): no extra 10 s.
      await press('right');
      await advance(1000);
      expect(mockSeek).toHaveBeenCalledTimes(8);
      await press('left');
      expect(mockSeek).toHaveBeenLastCalledWith(190);
    });

    it('shows the controls; on a track button it moves focus instead - no seek', async () => {
      await renderPlaying();
      await act(() => {
        mockRemote!({ eventType: 'down', eventKeyAction: 1 });
      });
      await fireEvent(screen.getByRole('button', { name: 'Audio' }), 'focus', { currentTarget: {} });
      jest.useFakeTimers();
      await hold('longLeft', 0);
      await advance(900);
      expect(mockSeek).not.toHaveBeenCalled();
    });

    it('with the controls down, a hold brings them up', async () => {
      await renderPlaying();
      await act(() => back.at(-1)!());
      expect(screen.queryByTestId('tv-player-bar')).toBeNull();
      jest.useFakeTimers();
      await hold('longLeft', 0);
      expect(mockSeek).toHaveBeenLastCalledWith(90);
      expect(screen.getByTestId('tv-player-bar')).toBeOnTheScreen();
    });

    it('stops when the app is left (no release comes) or a menu opens', async () => {
      const listeners: ((state: string) => void)[] = [];
      jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
        listeners.push(listener as (state: string) => void);
        return { remove: jest.fn() } as never;
      });
      await renderPlaying();
      jest.useFakeTimers();
      await hold('longRight', 0);
      await act(() => listeners.forEach((l) => l('background')));
      await advance(900);
      expect(mockSeek).toHaveBeenCalledTimes(1);
      expect(seekReports()).toBe(1);

      await act(() => listeners.forEach((l) => l('active')));
      await hold('longRight', 0);
      expect(mockSeek).toHaveBeenCalledTimes(2);
      await fireEvent.press(screen.getByRole('button', { name: 'Speed, 1×' }));
      await advance(900);
      expect(mockSeek).toHaveBeenCalledTimes(2);
    });
  });

  it('a swipe scrubs: the bar shows where it lands, the seek happens on release', async () => {
    await renderPlaying();
    await press('pan', { state: 'Began', x: 0 });
    await press('pan', { state: 'Changed', x: 300 });
    // 100 s + 300 pt × 0.2 s.
    // Over the playhead and as the elapsed time.
    expect(screen.getAllByText('2:40')).toHaveLength(2);
    expect(mockSeek).not.toHaveBeenCalled();
    await press('pan', { state: 'Ended', x: 300 });
    expect(mockSeek).toHaveBeenLastCalledWith(160);
  });

  it('a tiny swipe is a touch: no seek', async () => {
    await renderPlaying();
    await press('pan', { state: 'Began', x: 0 });
    await press('pan', { state: 'Ended', x: 5 });
    expect(mockSeek).not.toHaveBeenCalled();
  });

  it('Back hides the controls first; with them down it leaves Back to the system (closes)', async () => {
    await renderPlaying();
    expect(back.length).toBeGreaterThan(0);
    let handled = false;
    await act(() => {
      handled = back.at(-1)!();
    });
    expect(handled).toBe(true);
    expect(screen.queryByTestId('tv-player-bar')).toBeNull();
    expect(router.back).not.toHaveBeenCalled();
    // Down: the screen no longer takes Back.
    expect(back).toHaveLength(0);
    // Any press brings them back.
    await press('down');
    expect(screen.getByTestId('tv-player-bar')).toBeOnTheScreen();
  });

  it('CC opens the subtitles above the buttons; once on, Subtitle Timing is at its end: − / + / Reset', async () => {
    await renderPlaying();
    await fireEvent.press(screen.getByRole('button', { name: 'Subtitles, off' }));
    const card = screen.getByTestId('tv-menu-card');
    // A small menu at the bottom-right, the video undimmed around it; the controls stay up.
    expect(StyleSheet.flatten(card.props.style)).toMatchObject({ width: tv.menu.popoverWidth });
    expect(StyleSheet.flatten(screen.getByTestId('tv-menu').props.style)).toMatchObject({ right: tv.margin });
    expect(StyleSheet.flatten(screen.getByTestId('tv-menu').props.style).backgroundColor).toBeUndefined();
    expect(screen.getByTestId('tv-player-bar')).toBeOnTheScreen();
    const panel = within(card);
    expect(panel.queryByRole('button', { name: /^Subtitle Timing/ })).toBeNull();
    await fireEvent.press(panel.getByRole('button', { name: 'English - SRT' }));
    expect(lastPlayer().subtitleTrack).not.toBe(-1);
    // The CC button fills while subtitles are on.
    expect(screen.getByRole('button', { name: 'Subtitles, on' }).props.accessibilityState).toMatchObject({
      selected: true,
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Subtitles, on' }));
    await fireEvent.press(
      within(screen.getByTestId('tv-menu-card')).getByRole('button', { name: 'Subtitle Timing, In sync' }),
    );
    const timing = within(screen.getByTestId('tv-timing'));
    expect(timing.getByText('In sync')).toBeOnTheScreen();
    await fireEvent.press(timing.getByRole('button', { name: 'Later by 0.1 seconds' }));
    await fireEvent.press(timing.getByRole('button', { name: 'Later by 0.1 seconds' }));
    expect(lastPlayer().subtitleDelay).toBeCloseTo(0.2);
    await fireEvent.press(timing.getByRole('button', { name: 'Earlier by 0.1 seconds' }));
    expect(lastPlayer().subtitleDelay).toBeCloseTo(0.1);
    await fireEvent.press(timing.getByRole('button', { name: 'Reset' }));
    expect(lastPlayer().subtitleDelay).toBe(0);
  });

  it('with a menu open, swipes and Left / Right move through it - no seek', async () => {
    await renderPlaying();
    await fireEvent.press(screen.getByRole('button', { name: 'Speed, 1×' }));
    await press('pan', { state: 'Began', x: 0 });
    await press('pan', { state: 'Changed', x: 300 });
    await press('pan', { state: 'Ended', x: 300 });
    await fireEvent(screen.getByTestId('tv-scrubber'), 'focus', { currentTarget: {} });
    await press('right');
    expect(mockSeek).not.toHaveBeenCalled();
  });

  it('with a menu open, focus stays in it: the bar takes focus again once it closes', async () => {
    await renderPlaying();
    await fireEvent.press(screen.getByRole('button', { name: 'Speed, 1×' }));
    for (const name of ['Subtitles, off', 'Audio', 'Speed, 1×'])
      expect(screen.getByRole('button', { name }).props.focusable).toBe(false);
    expect(screen.getByTestId('tv-scrubber').props.focusable).toBe(false);
    // Menu (Back): the menu's handler, the latest.
    await act(() => {
      back.at(-1)!();
    });
    expect(screen.queryByTestId('tv-menu')).toBeNull();
    expect(screen.getByRole('button', { name: 'Speed, 1×' }).props.focusable).toBe(true);
    expect(screen.getByTestId('tv-scrubber').props.focusable).toBe(true);
  });

  describe('Up Next', () => {
    const EP1 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1';
    const EP2 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa2';
    const episode = (Id: string, n: number): BaseItemDto => ({
      Id,
      Name: n === 1 ? 'Pilot' : 'Second',
      Type: 'Episode',
      SeriesId: 'show',
      SeriesName: 'Test Show',
      ParentIndexNumber: 1,
      IndexNumber: n,
    });
    const episodes = [episode(EP1, 1), episode(EP2, 2)];

    beforeEach(() => {
      useLocalSearchParams.mockReturnValue({ id: EP1, start: '0' });
      jest
        .spyOn(api, 'request')
        .mockImplementation(((_c: unknown, path: string) =>
          Promise.resolve(
            path === '/Shows/show/Episodes'
              ? { Items: episodes, TotalRecordCount: 2 }
              : episodes.find((e) => path === `/Items/${e.Id}`),
          )) as never);
    });
    afterEach(() => {
      useLocalSearchParams.mockReturnValue({ id: 'ecdda3284954ff60759e87e5ddb37fb8', start: '100' });
    });

    async function playAt(position: number) {
      await render(
        <TvMenuHost>
          <PlayerScreen />
        </TvMenuHost>,
      );
      await act(() => lastPlayer().onLoad?.({ duration: 1400, audio: [], subs: [] }));
      await act(() => lastPlayer().onProgress?.({ position, duration: 1400 }));
    }

    it('the last 30 s: a card over the video with Play Now focused; the remote leaves playback alone', async () => {
      await playAt(1300);
      expect(screen.queryByTestId('tv-up-next')).toBeNull();
      await act(() => lastPlayer().onProgress?.({ position: 1388.2, duration: 1400 }));
      const upNext = within(screen.getByTestId('tv-up-next'));
      // Text, no ring: reads from the sofa.
      expect(upNext.getByText('NEXT EPISODE IN 12')).toBeOnTheScreen();
      expect(upNext.getByText('S1, E2 · Second')).toBeOnTheScreen();
      expect(upNext.getByRole('button', { name: 'Play next episode, S1, E2 · Second' }).props.hasTVPreferredFocus).toBe(
        true,
      );
      // The video stays full screen; the card sits at the bottom-right over it.
      expect(StyleSheet.flatten(screen.getByLabelText('Video').props.style).position).toBeUndefined();
      expect(StyleSheet.flatten(screen.getByTestId('tv-up-next').props.style)).toMatchObject({
        width: tv.upNext.width,
      });
      // No player controls over it; a click or a swipe doesn't pause or show them.
      expect(screen.queryByTestId('tv-player-bar')).toBeNull();
      await press('select');
      await press('down');
      expect(lastPlayer().paused).toBe(false);
      expect(screen.queryByTestId('tv-player-bar')).toBeNull();

      await fireEvent.press(upNext.getByRole('button', { name: 'Play next episode, S1, E2 · Second' }));
      expect(router.setParams).toHaveBeenCalledWith(expect.objectContaining({ id: EP2 }));
    });

    it('Back hides the card: the end pauses instead of playing on', async () => {
      await playAt(1390);
      expect(screen.getByTestId('tv-up-next')).toBeOnTheScreen();
      await act(() => {
        back.at(-1)!();
      });
      expect(screen.queryByTestId('tv-up-next')).toBeNull();
      await act(() => lastPlayer().onEnd?.());
      expect(router.setParams).not.toHaveBeenCalled();
      expect(lastPlayer().paused).toBe(true);
    });

    it('Cancel hides the card: no autoplay, the end pauses', async () => {
      await playAt(1390);
      await fireEvent.press(screen.getByRole('button', { name: 'Cancel Up Next' }));
      expect(screen.queryByTestId('tv-up-next')).toBeNull();
      await act(() => lastPlayer().onEnd?.());
      expect(router.setParams).not.toHaveBeenCalled();
      expect(lastPlayer().paused).toBe(true);
    });

    it('autoplay off: "UP NEXT", no countdown', async () => {
      settings.setAutoplayNext('off');
      try {
        await playAt(1390);
        expect(within(screen.getByTestId('tv-up-next')).getByText('UP NEXT')).toBeOnTheScreen();
      } finally {
        settings.setAutoplayNext('on');
      }
    });
  });
});
