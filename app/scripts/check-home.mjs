// SPDX-License-Identifier: GPL-3.0-or-later
// Checks the Home data layer (src/items.ts) against a dev server: rows, Recently Added shaping, time left, image URLs.
// Sets a resume point on a movie >= 6 min and marks Test Show S01E01 played as the dev user `test`, then restores both.
// Usage (from app/): npm run check:home [-- --server http://localhost:8097]. Needs dev/jellyfin running.
// Dev-only credentials - never use them on a real server.
import {
  continueWatching,
  homeLibraries,
  imageUrl,
  latest,
  nextUp,
  playback,
  posterImage,
  recentlyAdded,
  cardTitles,
  TICKS_PER_SECOND,
  ticksToSeconds,
  userViews,
} from '../src/items.ts';

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
  const episodes = (await call('GET', `/Shows/${show.Id}/Episodes`)).Items;
  if (episodes.length < 2) throw new Error('Test Show needs 2+ episodes - run dev/jellyfin/make-test-media.sh');
  const now = new Date().toISOString();
  for (const [item, change] of [
    [movie, { PlaybackPositionTicks: 120 * TICKS_PER_SECOND, LastPlayedDate: now }],
    [episodes[0], { Played: true, LastPlayedDate: now }],
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
    next[0]?.Id === episodes[1].Id && titles.subtitle.startsWith('S1:E2'),
    `Next Up: ${titles ? `${titles.title} / ${titles.subtitle}` : 'empty'}`,
  );

  // Images: no auth, long cache via the tag.
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
