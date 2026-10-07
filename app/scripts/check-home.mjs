// SPDX-License-Identifier: GPL-3.0-or-later
// Checks the Home + detail data layer (src/items.ts) against a dev server: rows, Recently Added shaping, time left,
// detail facts / tracks / cast, series, library paging / sorts / unwatched, search + filters, image URLs, and
// playback sources (src/playback.ts): every movie + an episode direct plays, stream + sidecar subtitle URLs answer,
// and playback reporting (Playing / Progress / Stopped bodies) lands as resume point / watched / remembered tracks.
// Sets a resume point on a movie >= 6 min and marks Test Show S01E01 played as the dev user `test`, then restores both.
// Usage (from app/): npm run check:home [-- --server http://localhost:8097]. Needs dev/jellyfin running.
// Dev-only credentials - never use them on a real server.
import {
  castAndCrew,
  changedUserData,
  continueWatching,
  detailFacts,
  itemDetail,
  mediaRows,
  homeLibraries,
  imageUrl,
  latest,
  nextUp,
  playback,
  posterImage,
  recentlyAdded,
  cardTitles,
  genresEndpoint,
  groupResults,
  NO_FILTERS,
  searchTerm,
  LIBRARY_SORTS,
  ROW_LIMIT,
  listItems,
  mergePage,
  nextPageStart,
  nextEpisode as episodeAfter,
  nextEpisodes,
  defaultSeasonId,
  episodes,
  episodeTitle,
  seasons,
  seriesNextUp,
  seriesPlayTarget,
  similar,
  TICKS_PER_SECOND,
  ticksToSeconds,
  userViews,
  yearRange,
} from '../src/items.ts';
import { playbackInfoBody, playbackReport, playSource } from '../src/playback.ts';

const args = process.argv.slice(2);
const flag = args.indexOf('--server');
const server = (flag === -1 ? 'http://localhost:8096' : (args[flag + 1] ?? '')).replace(/\/+$/, '');
if (!/^https?:\/\/[^/]+$/.test(server)) {
  process.stderr.write(`--server needs a full URL like http://localhost:8097 (got "${server}")\n`);
  process.exit(1);
}

const auth = (token) =>
  `MediaBrowser Client="Rillwood dev check", Device="script", DeviceId="rillwood-dev-check", Version="0.1.0"` +
  (token ? `, Token="${token}"` : '');

let token;

async function call(method, path, { query, body } = {}) {
  const params = new URLSearchParams(
    Object.entries(query ?? {})
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)]),
  );
  const res = await fetch(`${server}${path}${params.size ? `?${params}` : ''}`, {
    method,
    headers: { Authorization: auth(token), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const get = (endpoint) => call('GET', endpoint.path, { query: endpoint.query });

/** Library query as the screen builds it (term, type, sort, filters). */
const lib = (change = {}) => ({ scope: 'movies', sort: 'name', filters: NO_FILTERS, ...change });
const page = (change, startIndex, limit = 50) => listItems(lib(change), limit, startIndex);

let failures = 0;
function check(ok, message) {
  process.stdout.write(`${ok ? 'ok  ' : 'FAIL'} ${message}\n`);
  if (!ok) failures++;
}

const info = await call('GET', '/System/Info/Public');
process.stdout.write(`Jellyfin ${info.Version} at ${server}\n`);
({ AccessToken: token } = await call('POST', '/Users/AuthenticateByName', {
  body: { Username: 'test', Pw: 'test-rillwood' },
}));

const restore = [];
try {
  // Libraries + Recently Added. Remembers a movie long enough for a server resume point (>= 300 s).
  let movie;
  const views = (await get(userViews)).Items;
  const libraries = homeLibraries(views);
  check(libraries.length > 0, `libraries: ${libraries.map((l) => `${l.Name} (${l.CollectionType})`).join(', ')}`);
  for (const library of libraries) {
    const items = await get(latest(library.Id));
    check(Array.isArray(items), `${library.Name}: Latest is a bare array (${items.length} items)`);
    const cards = recentlyAdded(items);
    const raw = [...new Set(items.map((i) => i.Type))].join('/');
    const want = library.CollectionType === 'tvshows' ? 'Series' : 'Movie';
    check(
      cards.length > 0 && cards.every((c) => c.Type === want),
      `${library.Name}: server sent ${raw}, cards are ${want}: ${cards.map((c) => c.Name).join(', ')}`,
    );
    movie ??= items.find((i) => i.Type === 'Movie' && i.RunTimeTicks >= 360 * TICKS_PER_SECOND);
  }

  // Watch state for the rows (restored in finally).
  const [show] = (
    await call('GET', '/Items', { query: { searchTerm: 'Test Show', includeItemTypes: 'Series', recursive: true } })
  ).Items;
  if (!movie || !show) throw new Error('No movie >= 6 min or no Test Show - run dev/jellyfin/make-test-media.sh');
  const showEpisodes = (await call('GET', `/Shows/${show.Id}/Episodes`)).Items;
  if (showEpisodes.length < 2) throw new Error('Test Show needs 2+ episodes - run dev/jellyfin/make-test-media.sh');
  const now = new Date().toISOString();
  // First movie by name, marked watched for the library's unwatched filter.
  const [watchedMovie] = (await get(page({}, 0))).Items;
  for (const [item, change] of [
    [movie, { PlaybackPositionTicks: 120 * TICKS_PER_SECOND, LastPlayedDate: now }],
    [showEpisodes[0], { Played: true, LastPlayedDate: now }],
    [watchedMovie, { Played: true, LastPlayedDate: now }],
  ]) {
    const { PlaybackPositionTicks, Played, LastPlayedDate } = await call('GET', `/UserItems/${item.Id}/UserData`);
    restore.push([item.Id, { PlaybackPositionTicks, Played, LastPlayedDate }]);
    await call('POST', `/UserItems/${item.Id}/UserData`, { body: change });
  }

  // Continue Watching: video items only, time left from ticks.
  const resume = (await get(continueWatching)).Items;
  check(
    resume.every((i) => i.MediaType === 'Video'),
    `Continue Watching: ${resume.map((i) => `${i.Name} (${i.Type})`).join(', ')}`,
  );
  const resumed = resume.find((i) => i.Id === movie.Id);
  const state = resumed && playback(resumed);
  const left = ticksToSeconds(movie.RunTimeTicks) - 120;
  check(
    state?.remainingSeconds !== undefined && Math.abs(state.remainingSeconds - left) < 1,
    `${movie.Name}: ${state?.remainingSeconds?.toFixed(1)}s left (want ${left.toFixed(1)}), progress ${state?.progress?.toFixed(2)}`,
  );

  // Next Up: the episode after the played one.
  const next = (await get(nextUp)).Items;
  const titles = next[0] && cardTitles(next[0]);
  check(
    next[0]?.Id === showEpisodes[1].Id && titles.subtitle.startsWith('S1:E2'),
    `Next Up: ${titles ? `${titles.title} / ${titles.subtitle}` : 'empty'}`,
  );

  // Series: seasons, the season to open, its episodes, and what Play starts (S01E01 is watched now).
  const seriesItem = await get(itemDetail(show.Id));
  const seasonList = (await get(seasons(show.Id))).Items;
  const [nextEpisode] = (await get(seriesNextUp(show.Id))).Items;
  const seasonId = defaultSeasonId(seasonList, nextEpisode);
  const seasonEpisodes = seasonId ? (await get(episodes(show.Id, seasonId))).Items : [];
  const target = seriesPlayTarget(nextEpisode, seasonEpisodes);
  check(
    target?.episode.Id === showEpisodes[1].Id && !target.resume && seasonEpisodes[0]?.UserData?.Played === true,
    `Series ${seriesItem.Name} (${yearRange(seriesItem)}, ${seasonList.length} season(s)): opens ${seasonList.find((x) => x.Id === seasonId)?.Name}, ${seasonEpisodes.map(episodeTitle).join(' / ')}; Play → ${target?.episode.Name}`,
  );
  // Up Next in the player: the episode after each one, from its own detail; none after the last.
  const after = [];
  for (const ep of showEpisodes) {
    const detail = await get(itemDetail(ep.Id));
    after.push(episodeAfter((await get(nextEpisodes(detail))).Items, ep.Id)?.Id);
  }
  check(
    after.every((id, i) => id === showEpisodes[i + 1]?.Id),
    `Up Next: ${showEpisodes.map(episodeTitle).join(' → ')} → none`,
  );
  const similarItems = await get(similar(movie.Id));
  check(Array.isArray(similarItems.Items), `Similar to ${movie.Name}: ${similarItems.Items.length} item(s)`);

  // Library: every movie across libraries, paged to the end, sorted, and without watched ones.
  const first = await get(page({}, 0));
  const tail = await get(page({}, first.TotalRecordCount - 2));
  const merged = mergePage(first.Items, tail.Items);
  check(
    first.TotalRecordCount > 2 &&
      tail.Items.length === 2 &&
      merged.length === first.TotalRecordCount &&
      nextPageStart(merged.length, first.TotalRecordCount) === undefined,
    `Library movies: ${first.TotalRecordCount} across libraries, last page of 2 merges to the whole list`,
  );
  const firstNames = [];
  for (const { key } of LIBRARY_SORTS) {
    firstNames.push((await get(page({ sort: key }, 0))).Items[0]?.Name);
  }
  check(
    new Set(firstNames).size > 1,
    `Library sorts change the order (${LIBRARY_SORTS.map((x, i) => `${x.key}: ${firstNames[i]}`).join(', ')})`,
  );
  const unwatched = await get(page({ filters: { ...NO_FILTERS, show: 'unwatched' } }, 0));
  check(
    unwatched.TotalRecordCount === first.TotalRecordCount - 1 && !unwatched.Items.some((i) => i.Id === watchedMovie.Id),
    `Library unwatched: ${unwatched.TotalRecordCount} (${watchedMovie.Name} hidden)`,
  );
  const shows = await get(page({ scope: 'shows', sort: 'added' }, 0));
  const rowMovies = await get(page({ scope: 'movies' }, undefined, ROW_LIMIT));
  const rowShows = await get(page({ scope: 'shows' }, undefined, ROW_LIMIT));
  check(
    rowMovies.Items.every((i) => i.Type === 'Movie') &&
      rowShows.Items.every((i) => i.Type === 'Series') &&
      rowShows.Items.length > 0,
    `Library All rows: ${rowMovies.Items.length} movie(s), ${rowShows.Items.length} show(s) (one request each)`,
  );
  check(
    shows.Items.every((i) => i.Type === 'Series'),
    `Library shows by date added: ${shows.Items.map((i) => i.Name).join(', ')}`,
  );

  // Search: one mixed request, grouped by the app; one letter already matches words starting with it.
  const found = groupResults((await get(page({ term: searchTerm('test'), scope: 'all' }, 0, 60))).Items);
  const oneLetter = (await get(page({ term: searchTerm('s'), scope: 'all' }, 0, 60))).Items;
  check(
    oneLetter.length > 0 &&
      found.shows.some((i) => i.Id === show.Id) &&
      found.episodes.length === showEpisodes.length &&
      found.episodes.every((i) => i.SeriesId === show.Id),
    `Search "test": ${found.shows.length} show(s), ${found.episodes.length} episode(s), ${found.movies.length} movie(s); "s": ${oneLetter.length} item(s)`,
  );

  // Filters: genres from /Genres, then search narrowed by genre / decade / rating / 4K / type; count-only request.
  const genreNames = (await get(genresEndpoint)).Items.map((g) => g.Name);
  const filtered = async (scope, f) =>
    (await get(page({ term: 's', scope, filters: { ...NO_FILTERS, ...f } }, undefined, 0))).TotalRecordCount;
  const all = await filtered('all', {});
  const counts = {
    genre: await filtered('all', { genres: genreNames.slice(0, 1) }),
    decade2010s: await filtered('all', { decades: [2010] }),
    rating7: await filtered('all', { minRating: 7 }),
    only4K: await filtered('all', { only4K: true }),
    movies: await filtered('movies', {}),
    unwatched: await filtered('all', { show: 'unwatched' }),
  };
  check(
    genreNames.length > 0 &&
      Object.values(counts).every((n) => n <= all) &&
      counts.genre < all &&
      counts.only4K < all &&
      counts.movies < all,
    `Filters on "s" (${all}): ${Object.entries(counts)
      .map(([k, n]) => `${k} ${n}`)
      .join(', ')}; genres ${genreNames.join(', ')}`,
  );

  // Detail: the movie's facts, default tracks and cast from /Items/{id}.
  const detail = await get(itemDetail(movie.Id));
  const facts = detailFacts(detail);
  const rows = mediaRows(detail.MediaSources?.[0]);
  check(
    facts.runtimeSeconds > 0 && facts.resolution !== undefined && rows.video !== undefined && rows.audio !== undefined,
    `Detail ${detail.Name}: ${Object.values(facts).filter(Boolean).join(', ')}; audio "${rows.audio?.value}" (${rows.audio?.count}), subtitles "${rows.subtitles?.value ?? 'none'}" (${rows.subtitles?.count ?? 0}), ${castAndCrew(detail.People).length} cast & crew`,
  );

  // Mark watched / favourite: each answer is what `changedUserData` predicts (the app shows it before the server
  // answers); a season marks its episodes. Restored first (unshift), before the older restore entries.
  const userData = async (id) => call('GET', `/UserItems/${id}/UserData`);
  const keep = async (id) => {
    const { PlaybackPositionTicks, Played, LastPlayedDate } = await userData(id);
    restore.unshift([id, { PlaybackPositionTicks, Played, LastPlayedDate }]);
  };
  await keep(movie.Id);
  const matches = [];
  for (const [flag, value, path] of [
    ['played', true, '/UserPlayedItems/'],
    ['played', false, '/UserPlayedItems/'],
    ['favourite', true, '/UserFavoriteItems/'],
    ['favourite', false, '/UserFavoriteItems/'],
  ]) {
    const predicted = changedUserData(await userData(movie.Id), flag, value);
    const answer = await call(value ? 'POST' : 'DELETE', `${path}${movie.Id}`);
    matches.push(
      answer.Played === predicted.Played &&
        answer.PlaybackPositionTicks === predicted.PlaybackPositionTicks &&
        !!answer.IsFavorite === !!predicted.IsFavorite,
    );
  }
  for (const ep of seasonEpisodes) await keep(ep.Id);
  await call('POST', `/UserPlayedItems/${seasonId}`);
  const marked = (await get(episodes(show.Id, seasonId))).Items.filter((e) => e.UserData?.Played).length;
  await call('DELETE', `/UserPlayedItems/${seasonId}`);
  const cleared = (await get(episodes(show.Id, seasonId))).Items.filter((e) => e.UserData?.Played).length;
  check(
    matches.every(Boolean) && marked === seasonEpisodes.length && cleared === 0,
    `Mark watched / favourite: answers as predicted (${matches.filter(Boolean).length}/${matches.length}); season marks ${marked}/${seasonEpisodes.length} episodes, unmarks to ${cleared}`,
  );

  const ref = posterImage(movie);
  if (ref) {
    const res = await fetch(imageUrl(server, ref, 120, 3));
    check(
      res.ok &&
        res.headers.get('content-type')?.startsWith('image/') &&
        /max-age=31536000/.test(res.headers.get('cache-control') ?? ''),
      `poster without auth: ${res.status} ${res.headers.get('content-type')}, ${res.headers.get('cache-control')}`,
    );
  } else {
    check(false, `${movie.Name} has no Primary image tag`);
  }
  // Playback (src/playback.ts): the app's profile direct plays every movie and an episode; the built stream URL
  // answers a Range request with the token-only header, sidecar subtitle URLs answer as text, no token in any URL.
  const movies = (await call('GET', '/Items', { query: { includeItemTypes: 'Movie', recursive: true } })).Items;
  let srtPlay; // H264 AAC SRT: the one movie with a sidecar SRT
  for (const item of [...movies, showEpisodes[0]]) {
    const answer = await call('POST', `/Items/${item.Id}/PlaybackInfo`, { body: playbackInfoBody() });
    const result = playSource({ baseUrl: server, token }, item.Id, answer);
    if (!result.ok) {
      check(false, `${item.Name}: no direct play (${result.problem})`);
      continue;
    }
    const { play } = result;
    if (item.Name.startsWith('H264 AAC SRT')) srtPlay = play;
    const urls = [play.source.uri, ...play.externalSubs.map((s) => s.uri)];
    check(
      Boolean(play.playSessionId) && urls.every((u) => !u.includes(token) && !/api_?key=/i.test(u)),
      `${item.Name}: direct play, PlaySessionId, ${play.externalSubs.length} sidecar subs, no token in URLs`,
    );
  }
  if (srtPlay) {
    const { source, externalSubs } = srtPlay;
    const stream = await fetch(source.uri, { headers: { ...source.headers, Range: 'bytes=0-0' } });
    await stream.body?.cancel();
    check(stream.status === 206, `H264 AAC SRT: static stream answers Range with 206 (${stream.status})`);
    const sub = externalSubs[0];
    const subText = sub ? await (await fetch(sub.uri, { headers: source.headers })).text() : '';
    check(subText.includes('English subtitle'), `H264 AAC SRT: sidecar SRT served at ${sub?.uri.replace(server, '')}`);
  } else {
    check(false, 'No playable "H264 AAC SRT" movie - run dev/jellyfin/make-test-media.sh');
  }
  // Reporting (playbackReport): on the movie >= 6 min (resume points need >= 5 min), a session stopped at 2:00 leaves a
  // resume point; one stopped at 95% marks it watched. `keep` restores it first in finally.
  await keep(movie.Id);
  // One playback session of `item` stopped at `stopAt`, every report with `tracks`: its play source + user data after.
  const session = async (item, stopAt, tracks = {}) => {
    const answer = await call('POST', `/Items/${item.Id}/PlaybackInfo`, { body: playbackInfoBody() });
    const result = playSource({ baseUrl: server, token }, item.Id, answer);
    if (!result.ok) throw new Error(`${item.Name}: no direct play (${result.problem})`);
    const report = (seconds, extra) => ({
      body: playbackReport(item.Id, result.play, seconds, { ...tracks, ...extra }),
    });
    await call('POST', '/Sessions/Playing', report(0, { IsPaused: false }));
    await call('POST', '/Sessions/Playing/Progress', report(stopAt, { IsPaused: false, EventName: 'TimeUpdate' }));
    await call('POST', '/Sessions/Playing/Stopped', report(stopAt));
    return { play: result.play, data: await userData(item.Id) };
  };
  await call('DELETE', `/UserPlayedItems/${movie.Id}`);
  const afterResume = (await session(movie, 120)).data;
  check(
    afterResume.PlaybackPositionTicks === 120 * TICKS_PER_SECOND &&
      !afterResume.Played &&
      Boolean(afterResume.LastPlayedDate),
    `Reporting ${movie.Name}: stopped at 2:00 → resume point ${afterResume.PlaybackPositionTicks / TICKS_PER_SECOND} s, LastPlayedDate set`,
  );
  const afterWatched = (await session(movie, Math.round((movie.RunTimeTicks / TICKS_PER_SECOND) * 0.95))).data;
  check(
    afterWatched.Played && afterWatched.PlaybackPositionTicks === 0,
    'Reporting: stopped at 95% → watched, no resume',
  );
  // Tracks (AudioStreamIndex / SubtitleStreamIndex in the reports): the server keeps them per item, the next
  // PlaybackInfo starts with them. Reported back to the server's own defaults afterwards (UserData can't clear them).
  const multi = movies.find((m) => m.Name.startsWith('Multi Audio Multi Subs'));
  if (multi) {
    await keep(multi.Id);
    const tracksSession = async (AudioStreamIndex, SubtitleStreamIndex) =>
      (await session(multi, 10, { AudioStreamIndex, SubtitleStreamIndex })).play;
    const first = await tracksSession(undefined, undefined);
    const other = first.audio.find((t) => t.index !== first.defaultAudio)?.index;
    // The session that reads the remembered tracks reports the defaults again; if anything before it throws, the
    // defaults go back here instead (a later manual test must not start with the other audio).
    let remembered;
    try {
      await tracksSession(other, -1);
      remembered = await tracksSession(first.defaultAudio, first.defaultSubtitle);
    } finally {
      if (!remembered) await tracksSession(first.defaultAudio, first.defaultSubtitle);
    }
    check(
      other !== undefined && remembered.defaultAudio === other && remembered.defaultSubtitle === -1,
      `Reporting ${multi.Name}: picked audio ${other} + subtitles off → next PlaybackInfo starts with them (${remembered.defaultAudio}, ${remembered.defaultSubtitle})`,
    );
  } else {
    check(false, 'No "Multi Audio Multi Subs" movie - run dev/jellyfin/make-test-media.sh');
  }
} finally {
  // UserData can't clear LastPlayedDate (null is ignored); marking unplayed resets it, then the old state goes back.
  // Best effort per step: one failure must not leave the other item changed or the session open.
  const attempt = (label, run) =>
    run().catch((e) => {
      failures++;
      process.stderr.write(`FAIL cleanup ${label}: ${e.message}\n`);
    });
  for (const [id, data] of restore) {
    await attempt(`restore ${id}`, async () => {
      await call('DELETE', `/UserPlayedItems/${id}`);
      if (data.Played || data.PlaybackPositionTicks > 0 || data.LastPlayedDate) {
        await call('POST', `/UserItems/${id}/UserData`, { body: data });
      }
    });
  }
  await attempt('logout', () => call('POST', '/Sessions/Logout'));
}

process.stdout.write(`${failures ? `${failures} check(s) failed` : 'All checks passed'}\n`);
process.exit(failures ? 1 : 0);
