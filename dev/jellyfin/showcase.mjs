// SPDX-License-Identifier: GPL-3.0-or-later
// Showcase library for store screenshots (setup.mjs runs it once make-test-media.sh built the media): creates the
// libraries Films / TV Shows (Home says "Recently Added in Films"; local NFO + artwork only, no online lookups, no
// trickplay), the dev user `demo` who sees only them (`test` stops seeing them), scans, then resets demo's watch
// state to showcase.json `demo`: watched, Continue Watching, Next Up, favourites. Safe to re-run - same state back.
// Usage: node showcase.mjs [--server http://localhost:8096]
// Dev-only credentials - never use them on a real server.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const flag = args.indexOf('--server');
const server = (flag === -1 ? 'http://localhost:8096' : (args[flag + 1] ?? '')).replace(/\/+$/, '');
if (!/^https?:\/\/[^/]+$/.test(server)) {
  console.error(`--server needs a full URL like http://localhost:8097 (got "${server}")`);
  process.exit(1);
}

const fixture = JSON.parse(readFileSync(join(import.meta.dirname, 'showcase/showcase.json'), 'utf8'));
const ADMIN = { Name: 'admin', Password: 'admin-rillwood' };
const DEMO = { Name: 'demo', Password: 'demo-rillwood' };
const TEST = 'test';
const LIBRARIES = [
  { name: 'Films', collectionType: 'movies', path: '/media/showcase/movies', types: ['Movie'] },
  {
    name: 'TV Shows',
    collectionType: 'tvshows',
    path: '/media/showcase/shows',
    types: ['Series', 'Season', 'Episode'],
  },
];
const TICKS_PER_MINUTE = 600_000_000;

const auth = (token) =>
  `MediaBrowser Client="Rillwood dev setup", Device="script", DeviceId="rillwood-dev-setup", Version="0.1.0"` +
  (token ? `, Token="${token}"` : '');

async function call(method, path, { token, body, ok = [200, 204] } = {}) {
  const res = await fetch(server + path, {
    method,
    headers: { Authorization: auth(token), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!ok.includes(res.status)) throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const signIn = async (user) =>
  (await call('POST', '/Users/AuthenticateByName', { body: { Username: user.Name, Pw: user.Password } })).AccessToken;

const info = await call('GET', '/System/Info/Public').catch(() => {
  throw new Error(`Jellyfin not reachable at ${server} - run docker compose up -d and node setup.mjs first`);
});
console.log(`Jellyfin ${info.Version} at ${server}`);
const admin = await signIn(ADMIN);

// Libraries: only the NFOs and artwork next to the files, nothing written back to the read-only media
let folders = await call('GET', '/Library/VirtualFolders', { token: admin });
for (const lib of LIBRARIES) {
  if (folders.some((f) => f.Name === lib.name)) continue;
  const q = new URLSearchParams({ name: lib.name, collectionType: lib.collectionType, refreshLibrary: 'false' });
  await call('POST', `/Library/VirtualFolders?${q}`, {
    token: admin,
    body: {
      LibraryOptions: {
        PathInfos: [{ Path: lib.path }],
        MetadataSavers: [],
        TypeOptions: lib.types.map((Type) => ({ Type, MetadataFetchers: [], ImageFetchers: [] })),
        EnableTrickplayImageExtraction: false,
        ExtractTrickplayImagesDuringLibraryScan: false,
        EnableChapterImageExtraction: false,
        ExtractChapterImagesDuringLibraryScan: false,
        EnableEmbeddedTitles: false,
      },
    },
  });
  console.log(`Created library ${lib.name} -> ${lib.path}`);
}
// A library just created or renamed lists an all-zero ItemId for a moment - a policy with it shows nothing
const ready = (f) => f.ItemId && !/^0+$/.test(f.ItemId.replace(/-/g, ''));
for (let i = 0; i < 30; i++) {
  if (i) await new Promise((r) => setTimeout(r, 1000));
  folders = await call('GET', '/Library/VirtualFolders', { token: admin });
  if (folders.every(ready)) break;
}
if (!folders.every(ready)) throw new Error('Libraries have no id yet - wait a moment and retry');
const showcaseIds = folders.filter((f) => LIBRARIES.some((l) => l.name === f.Name)).map((f) => f.ItemId);
const otherIds = folders.filter((f) => !showcaseIds.includes(f.ItemId)).map((f) => f.ItemId);

// Users: demo sees only the showcase, test everything else (keeps its Home and npm run check:home as before)
let users = await call('GET', '/Users', { token: admin });
if (!users.some((u) => u.Name === DEMO.Name)) {
  await call('POST', '/Users/New', { token: admin, body: DEMO });
  console.log(`Created user ${DEMO.Name} / ${DEMO.Password}`);
  users = await call('GET', '/Users', { token: admin });
}
for (const [name, ids] of [
  [DEMO.Name, showcaseIds],
  [TEST, otherIds],
]) {
  const user = users.find((u) => u.Name === name);
  if (!user) continue;
  await call('POST', `/Users/${user.Id}/Policy`, {
    token: admin,
    body: { ...user.Policy, EnableAllFolders: false, EnabledFolders: ids },
  });
}

// Scan, then wait until demo sees every title with its runtime
await call('POST', '/Library/Refresh', { token: admin });
const demo = await signIn(DEMO);
// File name make-showcase-media.mjs writes for "glass-orbit" or "driftline S01E04"
function fileOf(key) {
  const [slug, code] = key.split(' ');
  const entry = [...fixture.movies, ...fixture.shows].find((x) => x.slug === slug);
  if (!entry) throw new Error(`showcase.json: no title with slug ${slug}`);
  return code ? `/${entry.title} ${code}.mkv` : `/${entry.title} (${entry.year}).mkv`;
}
const files = [
  ...fixture.movies.map((m) => fileOf(m.slug)),
  ...fixture.shows.flatMap((s) => s.episodes.map((_, i) => fileOf(`${s.slug} S01E${String(i + 1).padStart(2, '0')}`))),
];
let items = [];
const missing = () => files.filter((f) => !items.some((i) => i.Path?.endsWith(f)));
// Up to 10 min: on a first run the test libraries scan at the same time
for (let i = 0; i < 300 && (i === 0 || missing().length); i++) {
  if (i) await new Promise((r) => setTimeout(r, 2000));
  const q = new URLSearchParams({
    includeItemTypes: 'Movie,Episode',
    recursive: 'true',
    fields: 'Path',
    enableImages: 'false',
  });
  items = (await call('GET', `/Items?${q}`, { token: demo })).Items.filter((i) => i.RunTimeTicks > 0);
}
if (missing().length) {
  throw new Error(`Scan is missing ${missing().join(', ')} - run node make-showcase-media.mjs, then retry`);
}
console.log(`Scan done: ${files.length} titles`);

function find(key) {
  const item = items.find((i) => i.Path?.endsWith(fileOf(key)));
  if (!item) throw new Error(`No item for ${key}`);
  return item;
}
// A show by its first episode's series
const series = (slug) => ({ Id: find(`${slug} S01E01`).SeriesId });

// Demo watch state: clear every showcase title, then mark. Watched: later entries are newer (Next Up follows a show's
// most recently played episode). In progress: first entry newest (Continue Watching order), all newer than the watched ones.
const ago = (hours) => new Date(Date.now() - hours * 3_600_000).toISOString();
// Resolve every key first, so a typo in showcase.json fails before demo's state is cleared
const favourites = fixture.demo.favourites.map((key) =>
  fixture.shows.some((s) => s.slug === key) ? series(key) : find(key),
);
[...fixture.demo.watched, ...fixture.demo.resume.map((r) => r.item)].forEach(find);
for (const item of items) await call('DELETE', `/UserPlayedItems/${item.Id}`, { token: demo });
const all = [...items, ...fixture.shows.map((s) => series(s.slug))];
for (const item of all) {
  const on = favourites.some((f) => f.Id === item.Id);
  await call(on ? 'POST' : 'DELETE', `/UserFavoriteItems/${item.Id}`, { token: demo });
}
for (const [i, key] of fixture.demo.watched.entries()) {
  const q = new URLSearchParams({ datePlayed: ago(48 + fixture.demo.watched.length - i) });
  await call('POST', `/UserPlayedItems/${find(key).Id}?${q}`, { token: demo });
}
for (const [i, { item: key, minutes }] of fixture.demo.resume.entries()) {
  await call('POST', `/UserItems/${find(key).Id}/UserData`, {
    token: demo,
    body: { PlaybackPositionTicks: minutes * TICKS_PER_MINUTE, LastPlayedDate: ago(i + 1) },
  });
}
console.log(
  `Demo state: ${fixture.demo.watched.length} watched, ${fixture.demo.resume.length} in progress, ` +
    `${fixture.demo.favourites.length} favourites. Sign in as ${DEMO.Name} / ${DEMO.Password}`,
);
await call('POST', '/Sessions/Logout', { token: demo });
await call('POST', '/Sessions/Logout', { token: admin });
