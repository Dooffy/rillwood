// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from '@jest/globals';

import { ApiError, type Connection, type MediaSourceDto, type MediaStreamDto, type PlaybackInfoResponse } from './api';
import {
  carryTracks,
  picksOf,
  externalSubs,
  localPlaySource,
  matchTracks,
  trackOptions,
  playbackInfoBody,
  playbackReport,
  pictureAspect,
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

describe('pictureAspect', () => {
  const video = (stream: Partial<MediaStreamDto>) => ({
    Id: 'ms',
    MediaStreams: [
      { Type: 'Audio', Index: 0 },
      { Type: 'Video', Index: 1, ...stream },
    ],
  });

  it("the server's display shape, else Width / Height", () => {
    expect(pictureAspect(video({ AspectRatio: '2.40:1', Width: 1920, Height: 800 }))).toBe(2.4);
    // Anamorphic DVD: 720x480 stored, 16:9 shown.
    expect(pictureAspect(video({ AspectRatio: '16:9', Width: 720, Height: 480 }))).toBe(16 / 9);
    expect(pictureAspect(video({ AspectRatio: '0:1', Width: 1920, Height: 1080 }))).toBe(16 / 9);
    expect(pictureAspect(video({ Width: 1920, Height: 800 }))).toBe(2.4);
  });

  it('none without a video stream or its size', () => {
    expect(pictureAspect({ Id: 'ms', MediaStreams: [{ Type: 'Audio', Index: 0 }] })).toBeUndefined();
    expect(pictureAspect(video({}))).toBeUndefined();
    expect(pictureAspect({ Id: 'ms' })).toBeUndefined();
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
        audio: [{ id: 1, index: 1, label: 'Track 1' }],
        subtitles: [
          { id: 1, index: 2, label: 'subrip' },
          { id: 2, index: 3, label: 'English', lang: 'eng' },
          { id: 3, index: 4, label: 'Signs' },
        ],
        // Server defaults, as Jellyfin indexes.
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

describe('localPlaySource', () => {
  const file = 'file:///docs/downloads/a/i/ms1.mkv';
  const subFiles = [
    { index: 3, uri: 'file:///docs/downloads/a/i/ms1.sub-3.srt' },
    { index: 4, uri: 'file:///docs/downloads/a/i/ms1.sub-4.ass' },
  ];

  it('the downloaded version from its file: no auth, saved subtitles, the same tracks + defaults as streaming', () => {
    const play = localPlaySource({ item: { MediaSources: [source] }, sourceId: 'ms1', uri: file, subtitles: subFiles });
    const streamed = playSource(conn, 'i', info());
    if (!streamed.ok) throw new Error('expected a source');
    expect(play).toEqual({
      ...streamed.play,
      playSessionId: undefined,
      source: { uri: file, headers: {} },
      externalSubs: [
        { uri: subFiles[0].uri, index: 3, lang: 'eng', title: 'English' },
        { uri: subFiles[1].uri, index: 4, lang: undefined, title: 'Signs' },
      ],
    });
    expect(play && 'playSessionId' in play).toBe(false);
  });

  it('a subtitle file that failed to save is left out of the menu', () => {
    const play = localPlaySource({
      item: { MediaSources: [source] },
      sourceId: 'ms1',
      uri: file,
      subtitles: [subFiles[1]],
    });
    expect(play?.externalSubs.map((s) => s.index)).toEqual([4]);
    expect(play?.subtitles.map((s) => [s.id, s.index])).toEqual([
      [1, 2],
      [2, 4],
    ]);
  });

  it('picks the downloaded version among the saved ones; a file for a stream the item lacks is ignored', () => {
    const other = { ...source, Id: 'ms2' };
    const play = localPlaySource({
      item: { MediaSources: [other, source] },
      sourceId: 'ms1',
      uri: file,
      subtitles: [{ index: 9, uri: 'file:///x.srt' }],
    });
    expect(play?.mediaSourceId).toBe('ms1');
    expect(play?.externalSubs).toEqual([]);
  });

  it.each([
    ['version not in the saved item', { MediaSources: [source] }, 'ms2'],
    ['no sources saved', {}, 'ms1'],
  ])('%s → null (streams instead)', (_, item, sourceId) => {
    expect(localPlaySource({ item, sourceId, uri: file, subtitles: subFiles })).toBeNull();
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
    [new ApiError('http', 500), /The server ran into a problem/],
    [new ApiError('http', 400), /Couldn't start playback/],
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

describe('trackOptions', () => {
  const ms = (streams: MediaSourceDto['MediaStreams']): MediaSourceDto => ({ Id: 'ms', MediaStreams: streams });

  it('mpv ids: per type in file order, sidecars after the embedded subtitles in the order they are added', () => {
    const src = ms([
      { Type: 'Subtitle', Index: 0, Codec: 'srt', IsExternal: true, DisplayTitle: 'German - SRT - External' },
      { Type: 'Video', Index: 1 },
      { Type: 'Audio', Index: 2, DisplayTitle: 'English - AAC - Stereo - Default' },
      { Type: 'Audio', Index: 3, DisplayTitle: 'French - AC3 - 5.1' },
      { Type: 'Subtitle', Index: 4, Codec: 'pgssub', DisplayTitle: 'English - PGS' },
      { Type: 'Subtitle', Index: 5, Codec: 'ass', DisplayTitle: 'Signs - Default - ASS' },
    ]);
    const { audio, subtitles } = trackOptions(src, externalSubs('https://jf', 'i', src));
    expect(audio).toEqual([
      { id: 1, index: 2, label: 'English - AAC - Stereo' },
      { id: 2, index: 3, label: 'French - AC3 - 5.1' },
    ]);
    expect(subtitles).toEqual([
      { id: 1, index: 4, label: 'English - PGS' },
      { id: 2, index: 5, label: 'Signs - ASS' },
      { id: 3, index: 0, label: 'German - SRT - External' },
    ]);
  });

  it('image sidecars are not loaded, so they get no id (and shift nothing)', () => {
    const src = ms([
      { Type: 'Subtitle', Index: 0, Codec: 'pgssub', IsExternal: true },
      { Type: 'Subtitle', Index: 1, Codec: 'srt', IsExternal: true, Title: 'English' },
    ]);
    expect(trackOptions(src, externalSubs('https://jf', 'i', src)).subtitles).toEqual([
      { id: 1, index: 1, label: 'English' },
    ]);
  });

  it('no server default subtitle → off; no default audio → the first', () => {
    const result = playSource(
      conn,
      'i',
      info({ MediaSources: [{ ...source, DefaultAudioStreamIndex: undefined, DefaultSubtitleStreamIndex: -1 }] }),
    );
    expect(result.ok && result.play.defaultAudio).toBe(1);
    expect(result.ok && result.play.defaultSubtitle).toBe(-1);
  });
});

describe('picksOf', () => {
  const options = {
    audio: [{ id: 1, index: 1, label: 'Ukrainian - AAC', lang: 'ukr' }],
    subtitles: [{ id: 1, index: 3, label: 'English - SUBRIP', lang: 'eng' }],
  };

  it('language + label of the chosen options; subtitles off = null; untouched types left out', () => {
    expect(picksOf(options, { audio: 1, subtitle: 3 })).toEqual({
      audio: { lang: 'ukr', label: 'Ukrainian - AAC' },
      subtitle: { lang: 'eng', label: 'English - SUBRIP' },
    });
    expect(picksOf(options, { subtitle: -1 })).toEqual({ subtitle: null });
    expect(picksOf(options, { speed: 2 } as never)).toEqual({});
  });

  it('an index not in the options leaves the earlier pick alone (no key)', () => {
    expect(picksOf(options, { audio: 9, subtitle: 9 })).toEqual({});
  });
});

describe('carryTracks', () => {
  // The next episode lists Ukrainian first (Jellyfin indexes differ from the episode the picks were made on).
  const next = {
    audio: [
      { id: 1, index: 1, label: 'Ukrainian - AAC - Stereo', lang: 'ukr' },
      { id: 2, index: 2, label: 'English - AAC - Stereo', lang: 'eng' },
      { id: 3, index: 3, label: 'English - Commentary', lang: 'eng' },
    ],
    subtitles: [
      { id: 1, index: 4, label: 'Ukrainian - SUBRIP', lang: 'ukr' },
      { id: 2, index: 5, label: 'English - Forced - SUBRIP', lang: 'eng' },
      { id: 3, index: 6, label: 'English - SUBRIP', lang: 'ENG' },
    ],
  };

  it('finds the same language, the same label first', () => {
    expect(
      carryTracks(next, {
        audio: { label: 'English - Commentary', lang: 'eng' },
        subtitle: { label: 'English - SUBRIP', lang: 'eng' },
      }),
    ).toEqual({ audio: 3, subtitle: 6 });
  });

  it('another label: the first track in that language', () => {
    expect(
      carryTracks(next, {
        audio: { label: 'English - AC3 - 5.1', lang: 'eng' },
        subtitle: { label: 'Ukrainian - ASS', lang: 'ukr' },
      }),
    ).toEqual({ audio: 2, subtitle: 4 });
  });

  // Regression (review): full English subtitles became the forced-only track listed first when labels differed.
  it('another label: full subtitles stay full, forced stay forced', () => {
    const forcedFirst = {
      audio: [],
      subtitles: [
        { id: 1, index: 3, label: 'English - Forced - SUBRIP', lang: 'eng', forced: true },
        { id: 2, index: 4, label: 'English - SRT', lang: 'eng' },
      ],
    };
    expect(carryTracks(forcedFirst, { subtitle: { label: 'English - SUBRIP', lang: 'eng' } }).subtitle).toBe(4);
    expect(carryTracks(forcedFirst, { subtitle: { label: 'Forced', lang: 'eng', forced: true } }).subtitle).toBe(3);
    // Only forced ones in the language: still that language.
    expect(
      carryTracks({ audio: [], subtitles: [forcedFirst.subtitles[0]] }, { subtitle: { label: 'X', lang: 'eng' } }),
    ).toEqual({ audio: undefined, subtitle: 3 });
  });

  it('subtitles off stay off; nothing picked keeps the defaults', () => {
    expect(carryTracks(next, { subtitle: null })).toEqual({ audio: undefined, subtitle: -1 });
    expect(carryTracks(next, {})).toEqual({ audio: undefined, subtitle: undefined });
  });

  it('a language the next episode lacks keeps its default', () => {
    expect(
      carryTracks(next, { audio: { label: 'French', lang: 'fre' }, subtitle: { label: 'French', lang: 'fre' } }),
    ).toEqual({ audio: undefined, subtitle: undefined });
  });

  it('a pick without a language (or `und`) carries only by its label', () => {
    const plain = {
      audio: [
        { id: 1, index: 1, label: 'Track 1' },
        { id: 2, index: 2, label: 'Track 2' },
      ],
      subtitles: [],
    };
    expect(carryTracks(plain, { audio: { label: 'Track 2', lang: 'und' } }).audio).toBe(2);
    expect(carryTracks(plain, { audio: { label: 'Stereo' } }).audio).toBeUndefined();
  });
});

describe('matchTracks', () => {
  // Embedded: audio eng + fre, subtitle eng; sidecars: ger (index 0), fre (index 5).
  const play = {
    audio: [
      { id: 1, index: 2, label: 'English', lang: 'eng' },
      { id: 2, index: 3, label: 'French', lang: 'fre' },
    ],
    subtitles: [
      { id: 1, index: 4, label: 'English', lang: 'eng' },
      { id: 2, index: 0, label: 'German', lang: 'ger' },
      { id: 3, index: 5, label: 'French', lang: 'fre' },
    ],
    externalSubs: [
      { uri: 'https://jf/0.srt', index: 0 },
      { uri: 'https://jf/5.srt', index: 5 },
    ],
  };
  const embedded = [{ id: 1, lang: 'eng' }];
  const audio = [
    { id: 1, lang: 'eng' },
    { id: 2, lang: 'fre' },
  ];

  it('everything loaded: the predicted ids hold', () => {
    const subs = [...embedded, { id: 2, external: 'https://jf/0.srt' }, { id: 3, external: 'https://jf/5.srt' }];
    expect(matchTracks(play, { audio, subs })).toEqual({ audio: play.audio, subtitles: play.subtitles });
  });

  it('a sidecar that failed to load is left out; the next one gets its real id', () => {
    const subs = [...embedded, { id: 2, external: 'https://jf/5.srt' }];
    expect(matchTracks(play, { audio, subs }).subtitles).toEqual([
      { id: 1, index: 4, label: 'English', lang: 'eng' },
      { id: 2, index: 5, label: 'French', lang: 'fre' },
    ]);
  });

  it('a stream mpv dropped: the rest match in order by language', () => {
    expect(matchTracks(play, { audio: [{ id: 1, lang: 'fre' }], subs: [] }).audio).toEqual([
      { id: 1, index: 3, label: 'French', lang: 'fre' },
    ]);
    // No language on either side matches any.
    const unnamed = [
      { id: 1, index: 2, label: 'Track 2' },
      { id: 2, index: 3, label: 'Track 3' },
    ];
    expect(matchTracks({ ...play, audio: unnamed }, { audio: [{ id: 1 }], subs: [] }).audio).toEqual([
      { id: 1, index: 2, label: 'Track 2' },
    ]);
  });

  it('und matches any language; no language lining up falls back to position, never an empty menu', () => {
    expect(matchTracks(play, { audio: [{ id: 1, lang: 'und' }], subs: [] }).audio).toEqual([play.audio[0]]);
    expect(matchTracks(play, { audio: [{ id: 1, lang: 'ger' }], subs: [] }).audio).toEqual([play.audio[0]]);
  });
});
