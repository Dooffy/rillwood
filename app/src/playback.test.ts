// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from '@jest/globals';

import { ApiError, type Connection, type MediaSourceDto, type PlaybackInfoResponse } from './api';
import {
  externalSubs,
  playbackInfoBody,
  playbackReport,
  playErrorMessage,
  playSource,
  streamUrl,
  streamAuthHeader,
  subtitleUrl,
  type PlayProblem,
} from './playback';

const conn: Connection = {
  baseUrl: 'https://jf.example.com/jf',
  deviceId: 'dev-1',
  token: 'tok-secret',
  accountId: 'acc-1',
};

const source: MediaSourceDto = {
  Id: 'ms1',
  SupportsDirectPlay: true,
  DefaultAudioStreamIndex: 1,
  DefaultSubtitleStreamIndex: 3,
  MediaStreams: [
    { Type: 'Video', Index: 0 },
    { Type: 'Audio', Index: 1 },
    { Type: 'Subtitle', Index: 2, Codec: 'subrip' }, // embedded
    { Type: 'Subtitle', Index: 3, Codec: 'subrip', IsExternal: true, Language: 'eng', DisplayTitle: 'English' },
    { Type: 'Subtitle', Index: 4, Codec: 'ASS', IsExternal: true, Title: 'Signs' },
    { Type: 'Subtitle', Index: 5, Codec: 'pgssub', IsExternal: true }, // image subs: no text stream
  ],
};

const info = (over: Partial<PlaybackInfoResponse> = {}): PlaybackInfoResponse => ({
  MediaSources: [source],
  PlaySessionId: 'ps1',
  ...over,
});

describe('urls', () => {
  it('static stream of the chosen source, keeping the reverse-proxy sub-path', () => {
    expect(streamUrl(conn.baseUrl, 'it em', 'ms1')).toBe(
      'https://jf.example.com/jf/Videos/it%20em/stream?static=true&mediaSourceId=ms1',
    );
  });

  it('subtitle stream by codec; ssa as ass, image formats none', () => {
    const url = (Codec: string) => subtitleUrl(conn.baseUrl, 'i', 'ms', { Type: 'Subtitle', Index: 7, Codec });
    expect(url('subrip')).toBe('https://jf.example.com/jf/Videos/i/ms/Subtitles/7/Stream.srt');
    expect(url('ssa')).toMatch(/Stream\.ass$/);
    expect(url('webvtt')).toMatch(/Stream\.vtt$/);
    expect(url('pgssub')).toBeNull();
  });

  it('lists sidecar text subtitles only', () => {
    expect(externalSubs(conn.baseUrl, 'i', source)).toEqual([
      { uri: 'https://jf.example.com/jf/Videos/i/ms1/Subtitles/3/Stream.srt', index: 3, lang: 'eng', title: 'English' },
      {
        uri: 'https://jf.example.com/jf/Videos/i/ms1/Subtitles/4/Stream.ass',
        index: 4,
        lang: undefined,
        title: 'Signs',
      },
    ]);
  });
});

describe('playSource', () => {
  it('first source: stream URL, token-only header, subs, defaults, session id', () => {
    const result = playSource(conn, 'i', info());
    expect(result).toEqual({
      ok: true,
      play: {
        mediaSourceId: 'ms1',
        playSessionId: 'ps1',
        source: {
          uri: 'https://jf.example.com/jf/Videos/i/stream?static=true&mediaSourceId=ms1',
          headers: { Authorization: 'MediaBrowser Token="tok-secret"' },
        },
        externalSubs: expect.any(Array),
        defaultAudio: 1,
        defaultSubtitle: 3,
      },
    });
  });

  it('never puts the token in a URL', () => {
    const result = playSource(conn, 'i', info());
    if (!result.ok) throw new Error('expected a source');
    const urls = [result.play.source.uri, ...result.play.externalSubs.map((s) => s.uri)];
    urls.forEach((u) => expect(u).not.toMatch(/tok-secret|api_?key/i));
  });

  it('picks the requested version', () => {
    const other = { ...source, Id: 'ms2' };
    const result = playSource(conn, 'i', info({ MediaSources: [source, other] }), 'ms2');
    expect(result.ok && result.play.mediaSourceId).toBe('ms2');
  });

  it.each([
    ['no sources', info({ MediaSources: [] }), undefined, 'none'],
    ['requested version missing', info(), 'nope', 'none'],
    [
      'SupportsDirectPlay false (no error code)',
      info({ MediaSources: [{ ...source, SupportsDirectPlay: false }] }),
      undefined,
      'directPlay',
    ],
    ['SupportsDirectPlay missing', info({ MediaSources: [{ Id: 'ms1' }] }), undefined, 'directPlay'],
    ['NotAllowed', info({ ErrorCode: 'NotAllowed' }), undefined, 'notAllowed'],
    ['other error code', info({ ErrorCode: 'NoCompatibleStream' }), undefined, 'directPlay'],
  ] as [string, PlaybackInfoResponse, string | undefined, PlayProblem][])('%s → %s', (_, answer, msId, problem) => {
    expect(playSource(conn, 'i', answer, msId)).toEqual({ ok: false, problem });
  });
});

describe('playbackInfoBody', () => {
  it('direct-play profile; MediaSourceId only when a version is picked', () => {
    const body = playbackInfoBody('ms1');
    expect(body.MediaSourceId).toBe('ms1');
    expect(body.DeviceProfile.MaxStreamingBitrate).toBe(400_000_000);
    expect(body.DeviceProfile.DirectPlayProfiles).toEqual([{ Type: 'Video' }]);
    // Sidecar SRT only direct plays with an External profile, multi-subs only with Embed.
    expect(body.DeviceProfile.SubtitleProfiles).toEqual(
      expect.arrayContaining([
        { Format: 'srt', Method: 'Embed' },
        { Format: 'srt', Method: 'External' },
        { Format: 'pgssub', Method: 'Embed' },
      ]),
    );
    expect(playbackInfoBody().MediaSourceId).toBeUndefined();
  });

  it('stream header carries the token only (mpv splits on commas)', () => {
    expect(streamAuthHeader('tok')).toBe('MediaBrowser Token="tok"');
  });
});

describe('playErrorMessage', () => {
  it.each([
    ['directPlay', /as-is/],
    ['notAllowed', /isn't allowed/],
    ['none', /isn't available/],
    [new ApiError('network'), /reach the server/],
    [new ApiError('http', 404), /isn't available/],
    [new ApiError('http', 500), /Couldn't start playback/],
  ] as [PlayProblem | ApiError, RegExp][])('%s', (error, text) => {
    expect(playErrorMessage(error)).toMatch(text);
  });
});

describe('playbackReport', () => {
  const play = { mediaSourceId: 'ms', playSessionId: 'ps' };

  it('direct play body with ticks, ids and the extra fields', () => {
    expect(playbackReport('i', play, 12.34, { IsPaused: true })).toEqual({
      ItemId: 'i',
      MediaSourceId: 'ms',
      PlaySessionId: 'ps',
      PositionTicks: 123_400_000,
      PlayMethod: 'DirectPlay',
      CanSeek: true,
      IsPaused: true,
    });
    expect(playbackReport('i', play, -3).PositionTicks).toBe(0);
  });
});
