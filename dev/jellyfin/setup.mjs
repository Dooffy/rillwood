// SPDX-License-Identifier: GPL-3.0-or-later
// Configures a fresh local Jellyfin for development: finishes the startup wizard,
// creates the dev users and the Movies / Shows / Real libraries, then the showcase (showcase.mjs: Films / TV Shows,
// user demo). Idempotent.
// Usage: node setup.mjs [--server http://localhost:8096]
// Dev-only credentials - never use them on a real server.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const flag = args.indexOf('--server');
const server = (flag === -1 ? 'http://localhost:8096' : (args[flag + 1] ?? '')).replace(/\/+$/, '');
if (!/^https?:\/\/[^/]+$/.test(server)) {
  console.error(`--server needs a full URL like http://localhost:8097 (got "${server}")`);
  process.exit(1);
}

const ADMIN = { Name: 'admin', Password: 'admin-rillwood' };
const TEST = { Name: 'test', Password: 'test-rillwood' };
const LIBRARIES = [
  { name: 'Movies', collectionType: 'movies', path: '/media/movies' },
  { name: 'Shows', collectionType: 'tvshows', path: '/media/shows' },
  { name: 'Real', collectionType: 'movies', path: '/media/real' },
];

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

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      return await call('GET', '/System/Info/Public');
    } catch {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error(`Jellyfin not reachable at ${server} - is it running? (docker compose up -d)`);
}

const info = await waitForServer();
console.log(`Jellyfin ${info.Version} at ${server}`);

if (!info.StartupWizardCompleted) {
  await call('POST', '/Startup/Configuration', {
    body: { UICulture: 'en-US', MetadataCountryCode: 'US', PreferredMetadataLanguage: 'en' },
  });
  await call('GET', '/Startup/User');
  await call('POST', '/Startup/User', { body: ADMIN });
  // LAN clients (phone) still work; this only blocks access from outside the LAN.
  await call('POST', '/Startup/RemoteAccess', { body: { EnableRemoteAccess: false } });
  await call('POST', '/Startup/Complete');
  console.log('Startup wizard completed (admin / admin-rillwood)');
}

const { AccessToken: token } = await call('POST', '/Users/AuthenticateByName', {
  body: { Username: ADMIN.Name, Pw: ADMIN.Password },
});

const users = await call('GET', '/Users', { token });
if (!users.some((u) => u.Name === TEST.Name)) {
  await call('POST', '/Users/New', { token, body: TEST });
  console.log('Created user test / test-rillwood');
}

const folders = await call('GET', '/Library/VirtualFolders', { token });
for (const lib of LIBRARIES) {
  if (folders.some((f) => f.Name === lib.name)) continue;
  const q = new URLSearchParams({ name: lib.name, collectionType: lib.collectionType, refreshLibrary: 'false' });
  await call('POST', `/Library/VirtualFolders?${q}`, {
    token,
    body: { LibraryOptions: { PathInfos: [{ Path: lib.path }] } },
  });
  console.log(`Created library ${lib.name} -> ${lib.path}`);
}

await call('POST', '/Library/Refresh', { token });
console.log('Library scan started. Done - users: admin / admin-rillwood, test / test-rillwood');
await call('POST', '/Sessions/Logout', { token });

// Showcase library + demo user (README.md "Showcase library"), once make-test-media.sh has built its media
if (existsSync(join(process.env.RILLWOOD_MEDIA || join(homedir(), 'rillwood-media'), 'showcase'))) {
  const run = spawnSync(process.execPath, [join(import.meta.dirname, 'showcase.mjs'), '--server', server], {
    stdio: 'inherit',
  });
  process.exitCode = run.status ?? 1;
} else {
  console.log('No showcase media yet - run ./make-test-media.sh, then node setup.mjs again for the demo user');
}
