// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { createRef } from 'react';

import type { MpvPlayerViewProps, SubtitleTrack } from '../../modules/mpv';
import { frameSubtitleScale, MpvPlayer } from './mpv';
import type { PlayerProps, PlayerRef } from './Player';

// The native view, as a stub that records its props and exposes the imperative calls the adapter makes.
const mockNative = {
  play: jest.fn(async () => {}),
  pause: jest.fn(async () => {}),
  destroy: jest.fn(async () => {}),
  seekTo: jest.fn(async (s: number) => {
    mockPosition = s;
  }),
  setAudioTrack: jest.fn(async (_id: number) => {}),
  setSubtitleTrack: jest.fn(async (_id: number) => {}),
  disableSubtitles: jest.fn(async () => {}),
  getAudioTracks: jest.fn(async () => [{ id: 1, lang: 'eng', title: 'Stereo', codec: 'aac', channels: 2 }]),
  getSubtitleTracks: jest.fn(async (): Promise<SubtitleTrack[]> => [
    { id: 1, lang: 'ger', codec: 'subrip', external: true },
  ]),
  getDuration: jest.fn(async () => 888),
  setSpeed: jest.fn(async (_speed: number) => {}),
  setSubtitleScale: jest.fn(async (_scale: number) => {}),
  setSubtitleDelay: jest.fn(async (_seconds: number) => {}),
  setZoomedToFill: jest.fn(async (_zoomed: boolean) => {}),
  // mpv's position: progress and seeks move it.
  getCurrentPosition: jest.fn(async () => mockPosition),
};
let mockPosition = 0;
let mockViewProps: MpvPlayerViewProps;

jest.mock('../../modules/mpv', () => {
  const { forwardRef, useImperativeHandle } = jest.requireActual<typeof import('react')>('react');
  return {
    MpvPlayerView: forwardRef((props: MpvPlayerViewProps, ref) => {
      mockViewProps = props;
      useImperativeHandle(ref, () => mockNative);
      return null;
    }),
  };
});

const source = { uri: 'https://jf.example.com/Videos/i/stream?static=true&mediaSourceId=ms', headers: { A: 'b' } };
const subs = [{ uri: 'https://jf.example.com/Videos/i/ms/Subtitles/3/Stream.srt', lang: 'ger' }];

const progress = (position: number) => {
  mockPosition = position;
  return act(() =>
    mockViewProps.onProgress?.({ nativeEvent: { position, duration: 888, progress: 0, cacheSeconds: 0 } }),
  );
};
const tracksReady = () => act(async () => mockViewProps.onTracksReady?.({ nativeEvent: {} }));
const readyToSeek = () =>
  act(async () => mockViewProps.onPlaybackStateChange?.({ nativeEvent: { isReadyToSeek: true } }));

beforeEach(() => {
  jest.clearAllMocks();
  mockPosition = 0;
});

describe('MpvPlayer', () => {
  it('hands the source, headers, sidecar subs and start to the native view', async () => {
    await render(<MpvPlayer source={source} externalSubs={subs} startSeconds={40} subtitleTrack={-1} />);
    expect(mockViewProps.source).toEqual({
      url: source.uri,
      headers: { A: 'b' },
      externalSubtitles: [subs[0].uri],
      startPosition: 40,
      autoplay: true,
      initialAudioId: undefined,
      initialSubtitleId: -1,
      cacheConfig: { maxBytes: 100, maxBackBytes: 32 },
    });
  });

  it('paused at load = no autoplay; later changes call pause / play', async () => {
    const { rerender } = await render(<MpvPlayer source={source} paused />);
    expect(mockViewProps.source?.autoplay).toBe(false);
    expect(mockNative.play).not.toHaveBeenCalled();
    await rerender(<MpvPlayer source={source} paused={false} />);
    expect(mockNative.play).toHaveBeenCalledTimes(1);
    await rerender(<MpvPlayer source={source} paused />);
    expect(mockNative.pause).toHaveBeenCalledTimes(1);
  });

  it('reports load (duration + tracks), then progress - none before the tracks are ready (I3)', async () => {
    const onLoad = jest.fn<NonNullable<PlayerProps['onLoad']>>();
    const onProgress = jest.fn<NonNullable<PlayerProps['onProgress']>>();
    await render(<MpvPlayer source={source} onLoad={onLoad} onProgress={onProgress} />);
    await progress(1234); // stale position of the previous file
    expect(onProgress).not.toHaveBeenCalled();
    await tracksReady();
    expect(onLoad).toHaveBeenCalledWith({
      duration: 888,
      audio: [{ id: 1, lang: 'eng', title: 'Stereo', codec: 'aac' }],
      // A sidecar without mpv's filename: still external (no URI to match by).
      subs: [{ id: 1, lang: 'ger', title: undefined, codec: 'subrip', external: '' }],
    });
    await progress(5);
    expect(onProgress).toHaveBeenCalledWith({ position: 5, duration: 888 });
  });

  it('one onLoad per load, though mpv fires tracks-ready several times', async () => {
    const onLoad = jest.fn();
    await render(<MpvPlayer source={source} onLoad={onLoad} />);
    await tracksReady();
    await tracksReady();
    await tracksReady();
    expect(onLoad).toHaveBeenCalledTimes(1);
  });

  it('the full track list once the file opened (sidecars added), once per load, sidecars with their URI', async () => {
    const onTracks = jest.fn<NonNullable<PlayerProps['onTracks']>>();
    const onLoad = jest.fn();
    await render(<MpvPlayer source={source} externalSubs={subs} onLoad={onLoad} onTracks={onTracks} />);
    await tracksReady();
    // Before the file opened the sidecars may be missing: no full list yet.
    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(onTracks).not.toHaveBeenCalled();
    mockNative.getSubtitleTracks.mockResolvedValueOnce([
      { id: 1, lang: 'eng', codec: 'subrip', external: false },
      { id: 2, lang: 'ger', codec: 'subrip', external: true, externalFilename: subs[0].uri },
    ]);
    await readyToSeek();
    expect(onTracks).toHaveBeenCalledWith({
      audio: [{ id: 1, lang: 'eng', title: 'Stereo', codec: 'aac' }],
      subs: [
        { id: 1, lang: 'eng', title: undefined, codec: 'subrip' },
        { id: 2, lang: 'ger', title: undefined, codec: 'subrip', external: subs[0].uri },
      ],
    });
    await tracksReady();
    expect(onTracks).toHaveBeenCalledTimes(1);
    expect(onLoad).toHaveBeenCalledTimes(1);
  });

  it('a read started before the file opened is not the full list', async () => {
    const onTracks = jest.fn();
    await render(<MpvPlayer source={source} onTracks={onTracks} />);
    // The file opens while the first read is still waiting for mpv.
    await act(async () => {
      mockViewProps.onTracksReady?.({ nativeEvent: {} });
      mockViewProps.onPlaybackStateChange?.({ nativeEvent: { isReadyToSeek: true } });
    });
    expect(onTracks).toHaveBeenCalledTimes(1);
    expect(mockNative.getSubtitleTracks).toHaveBeenCalledTimes(2);
  });

  it('a new externalSubs array alone is not a new load', async () => {
    const { rerender } = await render(<MpvPlayer source={source} externalSubs={[...subs]} />);
    const first = mockViewProps.source;
    await rerender(<MpvPlayer source={source} externalSubs={[...subs]} />);
    expect(mockViewProps.source).toBe(first);
    expect(mockNative.seekTo).not.toHaveBeenCalled();
  });

  it('gates progress again for a new file', async () => {
    const onProgress = jest.fn<NonNullable<PlayerProps['onProgress']>>();
    const { rerender } = await render(<MpvPlayer source={source} onProgress={onProgress} />);
    await tracksReady();
    await rerender(<MpvPlayer source={{ uri: 'https://jf.example.com/other' }} onProgress={onProgress} />);
    await progress(300);
    expect(onProgress).not.toHaveBeenCalled();
  });

  it('a new source with the same URL restarts at its start and reports the load again (I4)', async () => {
    const onLoad = jest.fn();
    const onTracks = jest.fn();
    const { rerender } = await render(<MpvPlayer source={source} onLoad={onLoad} onTracks={onTracks} />);
    await tracksReady();
    await act(async () => {
      await rerender(<MpvPlayer source={{ ...source }} startSeconds={0} onLoad={onLoad} onTracks={onTracks} />);
    });
    expect(mockNative.seekTo).toHaveBeenCalledWith(0);
    expect(mockNative.play).toHaveBeenCalledTimes(1);
    expect(onLoad).toHaveBeenCalledTimes(2);
    // Same file, sidecars long added: the full list right away (no native open follows).
    expect(onTracks).toHaveBeenCalledTimes(1);
  });

  it('same URL, paused, with tracks: pauses and applies them', async () => {
    const { rerender } = await render(<MpvPlayer source={source} />);
    await rerender(<MpvPlayer source={{ ...source }} paused audioTrack={2} subtitleTrack={-1} />);
    expect(mockNative.pause).toHaveBeenCalled();
    expect(mockNative.play).not.toHaveBeenCalled();
    expect(mockNative.setAudioTrack).toHaveBeenCalledWith(2);
    expect(mockNative.disableSubtitles).toHaveBeenCalled();
  });

  it('the same source object does not reload', async () => {
    const { rerender } = await render(<MpvPlayer source={source} />);
    const first = mockViewProps.source;
    await rerender(<MpvPlayer source={source} startSeconds={99} />);
    expect(mockViewProps.source).toBe(first);
    expect(mockNative.seekTo).not.toHaveBeenCalled();
  });

  it('track changes after load: audio, subtitle, subtitles off', async () => {
    const { rerender } = await render(<MpvPlayer source={source} />);
    await rerender(<MpvPlayer source={source} audioTrack={2} subtitleTrack={3} />);
    expect(mockNative.setAudioTrack).toHaveBeenCalledWith(2);
    expect(mockNative.setSubtitleTrack).toHaveBeenCalledWith(3);
    await rerender(<MpvPlayer source={source} audioTrack={2} subtitleTrack={-1} />);
    expect(mockNative.disableSubtitles).toHaveBeenCalledTimes(1);
  });

  it('ref seek / play / pause reach mpv', async () => {
    const ref = createRef<PlayerRef>();
    await render(<MpvPlayer ref={ref} source={source} />);
    ref.current?.seek(12);
    ref.current?.pause();
    ref.current?.play();
    expect(mockNative.seekTo).toHaveBeenCalledWith(12);
    expect(mockNative.pause).toHaveBeenCalledTimes(1);
    expect(mockNative.play).toHaveBeenCalledTimes(1);
  });

  const end = () =>
    act(async () => {
      await mockViewProps.onPlaybackEnd?.({ nativeEvent: {} });
    });

  it('passes the end on once the load is ready, though mpv paused itself (I8)', async () => {
    const onEnd = jest.fn();
    const onProgress = jest.fn<NonNullable<PlayerProps['onProgress']>>();
    await render(<MpvPlayer source={source} onEnd={onEnd} onProgress={onProgress} />);
    await end(); // EOF of the previous file
    expect(onEnd).not.toHaveBeenCalled();
    await tracksReady();
    await progress(886); // throttled: the last one before the end
    await end();
    expect(onEnd).toHaveBeenCalledTimes(1);
    // The end lands on the duration.
    expect(onProgress).toHaveBeenLastCalledWith({ position: 888, duration: 888 });
  });

  it('drops an EOF of the previous file after a new source (I8)', async () => {
    const onEnd = jest.fn();
    const { rerender } = await render(<MpvPlayer source={source} onEnd={onEnd} />);
    await tracksReady();
    await rerender(<MpvPlayer source={{ uri: 'https://jf.example.com/other' }} onEnd={onEnd} />);
    await end();
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('play after the end replays from the start (I8)', async () => {
    const { rerender } = await render(<MpvPlayer source={source} />);
    await tracksReady();
    await progress(886);
    await end();
    await rerender(<MpvPlayer source={source} paused />);
    await rerender(<MpvPlayer source={source} paused={false} />);
    expect(mockNative.seekTo).toHaveBeenCalledWith(0);
    expect(mockNative.play).toHaveBeenCalledTimes(1);
    // Only once: a later pause / play is a plain one.
    await rerender(<MpvPlayer source={source} paused />);
    await rerender(<MpvPlayer source={source} paused={false} />);
    expect(mockNative.seekTo).toHaveBeenCalledTimes(1);
  });

  it('after a seek away from the end, play resumes there (I8)', async () => {
    const ref = createRef<PlayerRef>();
    await render(<MpvPlayer ref={ref} source={source} />);
    await tracksReady();
    await progress(886);
    await end();
    ref.current?.seek(50);
    ref.current?.play();
    expect(mockNative.seekTo).toHaveBeenLastCalledWith(50);
    expect(mockNative.seekTo).toHaveBeenCalledTimes(1);
  });

  it('a seek made outside the app (lock screen) also leaves the end (I8)', async () => {
    const ref = createRef<PlayerRef>();
    await render(<MpvPlayer ref={ref} source={source} />);
    await tracksReady();
    await progress(886);
    await end();
    await progress(300);
    ref.current?.play();
    expect(mockNative.seekTo).not.toHaveBeenCalled();
  });

  it('one end per end: a native reload at the end does not repeat it (I8)', async () => {
    const onEnd = jest.fn();
    await render(<MpvPlayer source={source} onEnd={onEnd} />);
    await tracksReady();
    await progress(886);
    await end();
    await end();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  // Regression: the end used the previous file's duration until the new one sent progress.
  it('the end lands on the duration of this load (I8)', async () => {
    const onProgress = jest.fn<NonNullable<PlayerProps['onProgress']>>();
    const { rerender } = await render(<MpvPlayer source={source} onProgress={onProgress} />);
    await tracksReady();
    await progress(5);
    mockNative.getDuration.mockResolvedValueOnce(30);
    await rerender(
      <MpvPlayer source={{ uri: 'https://jf.example.com/other' }} startSeconds={28} onProgress={onProgress} />,
    );
    await tracksReady();
    mockPosition = 29.9;
    await end();
    expect(onProgress).toHaveBeenLastCalledWith({ position: 30, duration: 30 });
  });

  it('an early end reloads the stream where it stopped, with the current tracks, and is no end (I11)', async () => {
    const onEnd = jest.fn();
    const onLoad = jest.fn();
    const onBuffering = jest.fn();
    const props = { source, startSeconds: 40, onEnd, onLoad, onBuffering };
    const { rerender } = await render(<MpvPlayer {...props} />);
    await tracksReady();
    await rerender(<MpvPlayer {...props} audioTrack={2} subtitleTrack={-1} />);
    await progress(300);
    await end();
    expect(onEnd).not.toHaveBeenCalled();
    expect(mockViewProps.source).toMatchObject({
      url: source.uri,
      startPosition: 300,
      autoplay: true,
      initialAudioId: 2,
      initialSubtitleId: -1,
      reload: true,
    });
    expect(onBuffering).toHaveBeenLastCalledWith(true);
    // The native view loads it again (`reload`): no same-URL restart (I4), progress waits for the reload's tracks.
    expect(mockNative.seekTo).not.toHaveBeenCalled();
    const onProgress = jest.fn();
    await rerender(<MpvPlayer {...props} audioTrack={2} subtitleTrack={-1} onProgress={onProgress} />);
    await progress(301);
    expect(onProgress).not.toHaveBeenCalled();
    await tracksReady();
    expect(onLoad).toHaveBeenCalledTimes(2);
  });

  it('a reloaded stream that plays on and ends early again reloads again (I11)', async () => {
    const onError = jest.fn();
    await render(<MpvPlayer source={source} onError={onError} />);
    await tracksReady();
    await progress(300);
    await end();
    await tracksReady();
    await progress(600);
    await end();
    expect(mockViewProps.source?.startPosition).toBe(600);
    expect(onError).not.toHaveBeenCalled();
  });

  it('ending early again where it was reloaded is an error, not an end (I11)', async () => {
    const onEnd = jest.fn();
    const onError = jest.fn();
    await render(<MpvPlayer source={source} onEnd={onEnd} onError={onError} />);
    await tracksReady();
    await progress(300);
    await end();
    await tracksReady();
    await progress(302);
    await end();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('an end within a few seconds of the duration is the end (I11)', async () => {
    const onEnd = jest.fn();
    await render(<MpvPlayer source={source} onEnd={onEnd} />);
    await tracksReady();
    await progress(884);
    await end();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(mockViewProps.source?.startPosition).toBe(0);
  });

  // Regression: the end after a lock-screen seek near the end came before any progress and looked early.
  it("judges the end by mpv's own position, not the last progress (I11)", async () => {
    const onEnd = jest.fn();
    await render(<MpvPlayer source={source} onEnd={onEnd} />);
    await tracksReady();
    await progress(300);
    mockPosition = 887.9;
    await end();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(mockViewProps.source?.reload).toBeUndefined();
  });

  it('a second end event while the first is checked is the same end (I11)', async () => {
    const onBuffering = jest.fn();
    await render(<MpvPlayer source={source} onBuffering={onBuffering} />);
    await tracksReady();
    await progress(300);
    const first = mockViewProps.source;
    await act(async () => {
      await Promise.all([
        mockViewProps.onPlaybackEnd?.({ nativeEvent: {} }),
        mockViewProps.onPlaybackEnd?.({ nativeEvent: {} }),
      ]);
    });
    expect(mockViewProps.source).not.toBe(first);
    expect(onBuffering).toHaveBeenCalledTimes(1);
    const reloaded = mockViewProps.source;
    await end(); // the old load's end again, before the reload's tracks are ready
    expect(mockViewProps.source).toBe(reloaded);
  });

  it('after a reload, seeking back and playing on, an early end reloads again (I11)', async () => {
    const ref = createRef<PlayerRef>();
    const onError = jest.fn();
    await render(<MpvPlayer ref={ref} source={source} onError={onError} />);
    await tracksReady();
    await progress(300);
    await end();
    await tracksReady();
    ref.current?.seek(100);
    await progress(290);
    await end();
    expect(onError).not.toHaveBeenCalled();
    expect(mockViewProps.source?.startPosition).toBe(290);
  });

  it('a pause made while the reload loads holds once it is ready (I11)', async () => {
    const { rerender } = await render(<MpvPlayer source={source} />);
    await tracksReady();
    await progress(300);
    await end();
    await rerender(<MpvPlayer source={source} paused />);
    mockNative.pause.mockClear();
    await tracksReady();
    expect(mockNative.pause).toHaveBeenCalled();
  });

  // Regression: progress is throttled, so the end after a seek near the end looked early and reloaded the old spot.
  it('an end right after a seek near the end is the end (I11)', async () => {
    const ref = createRef<PlayerRef>();
    const onEnd = jest.fn();
    await render(<MpvPlayer ref={ref} source={source} onEnd={onEnd} />);
    await tracksReady();
    await progress(300);
    ref.current?.seek(886);
    await end();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('a new source after a reload starts at its own start (I11)', async () => {
    const { rerender } = await render(<MpvPlayer source={source} />);
    await tracksReady();
    await progress(300);
    await end();
    await rerender(<MpvPlayer source={{ uri: 'https://jf.example.com/other' }} startSeconds={10} />);
    expect(mockViewProps.source?.startPosition).toBe(10);
  });

  it("passes mpv's waiting for data on (load, seek, paused for cache)", async () => {
    const onBuffering = jest.fn();
    await render(<MpvPlayer source={source} onBuffering={onBuffering} />);
    await act(() => mockViewProps.onPlaybackStateChange?.({ nativeEvent: { isLoading: true } }));
    await act(() => mockViewProps.onPlaybackStateChange?.({ nativeEvent: { isPaused: false, isPlaying: true } }));
    await act(() => mockViewProps.onPlaybackStateChange?.({ nativeEvent: { isLoading: false } }));
    expect(onBuffering.mock.calls).toEqual([[true], [false]]);
  });

  it('passes errors on', async () => {
    const onError = jest.fn();
    await render(<MpvPlayer source={source} onError={onError} />);
    await act(() => mockViewProps.onError?.({ nativeEvent: { error: 'Failed to open' } }));
    expect(onError).toHaveBeenCalledWith('Failed to open');
  });

  // destroy() is for reusing a view (iOS restarts mpv); on unmount the native view tears down by itself.
  it('leaves teardown to the native view on unmount', async () => {
    const { unmount } = await render(<MpvPlayer source={source} />);
    await unmount();
    expect(mockNative.destroy).not.toHaveBeenCalled();
  });

  it('speed, subtitle size, subtitle timing and zoom go to mpv on every change', async () => {
    const { rerender } = await render(<MpvPlayer source={source} />);
    expect(mockNative.setSpeed).toHaveBeenLastCalledWith(1);
    expect(mockNative.setSubtitleDelay).toHaveBeenLastCalledWith(0);
    expect(mockNative.setZoomedToFill).toHaveBeenLastCalledWith(false);
    await rerender(<MpvPlayer source={source} speed={1.5} subtitleScale={1.25} subtitleDelay={-0.5} zoom="fill" />);
    expect(mockNative.setSpeed).toHaveBeenLastCalledWith(1.5);
    expect(mockNative.setSubtitleScale).toHaveBeenLastCalledWith(1.25);
    expect(mockNative.setSubtitleDelay).toHaveBeenLastCalledWith(-0.5);
    expect(mockNative.setZoomedToFill).toHaveBeenLastCalledWith(true);
  });

  // Regression: Android has no renderer before the file loads, so speed / size set at mount went nowhere (Retry).
  it('speed, subtitle size, subtitle timing and zoom are sent again once the load is ready', async () => {
    await render(<MpvPlayer source={source} speed={1.5} subtitleScale={1.25} subtitleDelay={2} zoom="fill" />);
    mockNative.setSpeed.mockClear();
    mockNative.setSubtitleScale.mockClear();
    mockNative.setSubtitleDelay.mockClear();
    mockNative.setZoomedToFill.mockClear();
    await tracksReady();
    expect(mockNative.setSpeed).toHaveBeenCalledWith(1.5);
    expect(mockNative.setSubtitleScale).toHaveBeenCalledWith(1.25);
    expect(mockNative.setSubtitleDelay).toHaveBeenCalledWith(2);
    expect(mockNative.setZoomedToFill).toHaveBeenCalledWith(true);
  });

  describe('subtitle size on the picture (iOS draws subtitles into it)', () => {
    // Landscape iPhone view (fit: clear of the Dynamic Island), 2.39:1 film.
    const layout = (width: number, height: number) =>
      fireEvent(screen.getByTestId('player-frame'), 'layout', { nativeEvent: { layout: { width, height } } });

    it('iOS, landscape: a wide picture gets its text scaled up to the view height', async () => {
      await render(<MpvPlayer source={source} subtitleScale={1.2} aspect={2.39} />);
      await act(() => layout(760, 390));
      // Picture 760 / 2.39 = 318 high in a 390 view.
      expect(mockNative.setSubtitleScale).toHaveBeenLastCalledWith(1.2 * 1.23);
      mockNative.setSubtitleScale.mockClear();
      await tracksReady();
      expect(mockNative.setSubtitleScale).toHaveBeenCalledWith(1.2 * 1.23);
    });

    it('Android sizes text to the view itself: the scale goes as given', async () => {
      const os = Platform.OS;
      Platform.OS = 'android';
      try {
        await render(<MpvPlayer source={source} subtitleScale={1.2} aspect={2.39} />);
        await act(() => layout(760, 390));
        expect(mockNative.setSubtitleScale).toHaveBeenLastCalledWith(1.2);
      } finally {
        Platform.OS = os;
      }
    });
  });
});

describe('frameSubtitleScale', () => {
  const landscape = { width: 800, height: 400 };

  it('fit: up for a picture wider than the view, 1 for one that fills its height', () => {
    expect(frameSubtitleScale(landscape, 2.4, 'fit')).toBe(1.2);
    expect(frameSubtitleScale(landscape, 16 / 9, 'fit')).toBe(1);
    expect(frameSubtitleScale(landscape, 4 / 3, 'fit')).toBe(1);
  });

  it('fill: down for a picture taller than the view, 1 for a wider one', () => {
    expect(frameSubtitleScale(landscape, 1.6, 'fill')).toBe(0.8);
    expect(frameSubtitleScale(landscape, 2.4, 'fill')).toBe(1);
  });

  it('1 in portrait, without a shape or before layout; odd shapes clamp', () => {
    expect(frameSubtitleScale({ width: 400, height: 800 }, 2.4, 'fit')).toBe(1);
    expect(frameSubtitleScale(landscape, undefined, 'fit')).toBe(1);
    expect(frameSubtitleScale(undefined, 2.4, 'fit')).toBe(1);
    expect(frameSubtitleScale(landscape, 10, 'fit')).toBe(2);
    expect(frameSubtitleScale(landscape, 0.5, 'fill')).toBe(0.5);
  });
});
