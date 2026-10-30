// SPDX-License-Identifier: GPL-3.0-or-later
// Writes src/licences.json for Settings → Licences (CLAUDE.md §7): Rillwood's own licence, the native parts npm can't
// see (listed by hand below - keep in step with THIRD_PARTY_NOTICES.md) and every production npm package, grouped by
// source repository. Runs on postinstall; the output is gitignored.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8').trim();

const licence = read('../../LICENSE');
// The GPL text without Rillwood's App Store permission, for the GPL builds of other projects.
const gpl = licence.split(/\n-{20,}\n/)[0].trim();
const standard = {
  'GPL-3.0': gpl,
  'MPL-2.0': read('../modules/mpv/LICENSE'),
  'Apache-2.0': read('../licences/Apache-2.0.txt'),
  'OFL-1.1': read('../licences/OFL-1.1.txt'),
};

/** Native code and assets, by platform (`platform` unset = both). */
const native = [
  {
    name: 'mpv player module',
    licence: 'MPL-2.0',
    url: 'https://github.com/streamyfin/streamyfin',
    note: 'Expo module, vendored with changes (app/modules/mpv).',
  },
  {
    name: 'MPVKit (mpv, FFmpeg)',
    licence: 'GPL-3.0',
    platform: 'ios',
    url: 'https://github.com/streamyfin/MPVKit',
    note: 'Build 0.41.0-av5: mpv (mpv.io), FFmpeg (ffmpeg.org) and libsmbclient.',
  },
  {
    name: 'libmpv (mpv, FFmpeg)',
    licence: 'GPL-3.0',
    platform: 'android',
    url: 'https://github.com/jarnedemeulemeester/libmpv-android',
    note: 'dev.jdtech.mpv:libmpv 1.0.0: mpv (mpv.io) and FFmpeg (ffmpeg.org).',
  },
  {
    name: 'WorkManager',
    licence: 'Apache-2.0',
    platform: 'android',
    url: 'https://developer.android.com/jetpack/androidx/releases/work',
    note: 'androidx.work 2.12.0, with kotlinx-coroutines (Apache-2.0).',
  },
  {
    name: 'Noto fonts',
    licence: 'OFL-1.1',
    platform: 'ios',
    url: 'https://github.com/notofonts',
    note: 'Noto Sans, Serif, Sans Mono, Sans Arabic, Sans Hebrew and Sans CJK, for subtitles.',
  },
];

const texts = [];
/** Index of `text` in `texts`, added once. */
const textId = (text) => {
  const i = texts.indexOf(text);
  return i >= 0 ? i : texts.push(text) - 1;
};

const out = execFileSync('license-checker-rseidelsohn', ['--production', '--json'], {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});

// One entry per source repository (a monorepo's packages together); packages without one stand alone.
const groups = new Map();
for (const [id, info] of Object.entries(JSON.parse(out))) {
  if (id.startsWith('rillwood@')) continue;
  const at = id.lastIndexOf('@');
  const name = id.slice(0, at);
  const repo = info.repository?.replace(/(\.git)?(#.*)?$/, '');
  const key = repo?.toLowerCase() ?? name;
  const group = groups.get(key) ?? { repo, packages: [], licences: new Set(), texts: new Set() };
  group.packages.push({ name, version: id.slice(at + 1) });
  group.licences.add(String(info.licenses ?? 'Unknown'));
  // Only real licence files: the checker falls back to a README when a package has none.
  if (info.licenseFile && /licen[cs]e|copying/i.test(info.licenseFile)) {
    group.texts.add(textId(readFileSync(info.licenseFile, 'utf8').trim()));
  }
  groups.set(key, group);
}

const packages = [...groups.values()]
  .map((g) => ({
    // A repository's path (owner/repo) for a monorepo, else the package's own name.
    name: g.packages.length > 1 && g.repo ? g.repo.replace(/^[\w+.-]+:\/\/[^/]+\//, '') : g.packages[0].name,
    licence: [...g.licences].join(', '),
    url: g.repo,
    packages: g.packages.map((p) => `${p.name} ${p.version}`).sort(),
    texts: [...g.texts],
  }))
  .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));

const data = {
  app: {
    name: 'Rillwood',
    // The repo link from app.json (`extra.sourceUrl`), the one Settings → About opens.
    url: JSON.parse(read('../app.json')).expo.extra?.sourceUrl,
    licence: 'GPL-3.0-or-later',
    note: 'Free software under the GNU GPL version 3 or later, with an additional permission for app stores (end of the licence).',
    texts: [textId(licence)],
  },
  native: native.map(({ licence, ...rest }) => ({ ...rest, licence, texts: [textId(standard[licence])] })),
  packages,
  texts,
};
writeFileSync(new URL('../src/licences.json', import.meta.url), JSON.stringify(data));
process.stdout.write(`Wrote src/licences.json - ${packages.length} packages, ${native.length} native parts\n`);
