// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, render } from '@testing-library/react-native';
import { createRef } from 'react';

import type { MpvPlayerViewProps } from '../../modules/mpv';
import { MpvPlayer } from './mpv';
import type { PlayerProps, PlayerRef } from './Player';

// The native view, as a stub that records its props and exposes the imperative calls the adapter makes.
const mockNative = {
  play: jest.fn(async () => {}),
  pause: jest.fn(async () => {}),
  destroy: jest.fn(async () => {}),
  seekTo: jest.fn(async (_s: number) => {}),
  setAudioTrack: jest.fn(async (_id: number) => {}),
  setSubtitleTrack: jest.fn(async (_id: number) => {}),
  disableSubtitles: jest.fn(async () => {}),
  getAudioTracks: jest.fn(async () => [{ id: 1, lang: 'eng', title: 'Stereo', codec: 'aac', channels: 2 }]),
  getSubtitleTracks: jest.fn(async () => [{ id: 1, lang: 'ger', codec: 'subrip', external: true }]),
  getDuration: jest.fn(async () => 888),
};
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

const progress = (position: number) =>
  act(() => mockViewProps.onProgress?.({ nativeEvent: { position, duration: 888, progress: 0, cacheSeconds: 0 } }));
const tracksReady = () => act(async () => mockViewProps.onTracksReady?.({ nativeEvent: {} }));

beforeEach(() => {
  jest.clearAllMocks();
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
      subs: [{ id: 1, lang: 'ger', title: undefined, codec: 'subrip' }],
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
    const { rerender } = await render(<MpvPlayer source={source} onLoad={onLoad} />);
    await tracksReady();
    await act(async () => {
      await rerender(<MpvPlayer source={{ ...source }} startSeconds={0} onLoad={onLoad} />);
    });
    expect(mockNative.seekTo).toHaveBeenCalledWith(0);
    expect(mockNative.play).toHaveBeenCalledTimes(1);
    expect(onLoad).toHaveBeenCalledTimes(2);
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
});
