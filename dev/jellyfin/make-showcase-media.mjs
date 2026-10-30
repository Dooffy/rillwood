// SPDX-License-Identifier: GPL-3.0-or-later
// Builds the showcase library (fake movies + shows for store screenshots) into $RILLWOOD_MEDIA/showcase from
// showcase/showcase.json + showcase/art: NFO metadata, Jellyfin artwork names, and a still-image video per title at
// its full runtime (the backdrop for movies, the episode still for episodes; ~15 MB per 2 h). Needs ffmpeg.
// Re-runnable: skips videos that exist, rewrites NFOs and artwork.
// --large-files: pads the titles with `downloadGB` to that size (download screenshots); --small-files: undoes it.
// Usage: node make-showcase-media.mjs [--large-files | --small-files]
import { spawnSync } from 'node:child_process';
import {
  closeSync,
  copyFileSync,
  existsSync,
  ftruncateSync,
  fstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const here = import.meta.dirname;
const fixture = JSON.parse(readFileSync(join(here, 'showcase/showcase.json'), 'utf8'));
const art = (slug, file) => join(here, 'showcase/art', slug, file);
const out = join(process.env.RILLWOOD_MEDIA || join(homedir(), 'rillwood-media'), 'showcase');
const size = process.argv.includes('--large-files') ? 'large' : process.argv.includes('--small-files') ? 'small' : null;

if (spawnSync('ffmpeg', ['-version']).status !== 0) {
  console.error('ffmpeg not found (brew install ffmpeg)');
  process.exit(1);
}

const subtitle = join(out, '.showcase.srt');
mkdirSync(out, { recursive: true });
writeFileSync(subtitle, '1\n00:00:02,000 --> 00:00:08,000\n♪ Quiet music ♪\n');

const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// A value per tag; an array repeats the tag; an object nests its fields (<actor><name>..</name><role>..</role></actor>).
const tags = (fields) =>
  Object.entries(fields)
    .flatMap(([tag, value]) => (Array.isArray(value) ? value : [value]).map((v) => ({ tag, v })))
    .filter(({ v }) => v !== undefined)
    .map(({ tag, v }) =>
      typeof v === 'object'
        ? `  <${tag}>\n${Object.entries(v)
            .map(([k, x]) => `    <${k}>${escape(x)}</${k}>`)
            .join('\n')}\n  </${tag}>`
        : `  <${tag}>${escape(v)}</${tag}>`,
    )
    .join('\n');
/** Fictional cast as NFO actors (Jellyfin: Type Actor, Role = character). */
const actors = (cast = []) => cast.map(({ name, role }) => ({ name, role, type: 'Actor' }));
// lockdata: the server never looks the fake titles up online
const nfo = (root, fields) =>
  `<?xml version="1.0" encoding="utf-8" standalone="yes"?>\n<${root}>\n${tags(fields)}\n  <lockdata>true</lockdata>\n</${root}>\n`;

function video(image, minutes, file) {
  if (existsSync(file)) return console.log(`skip  ${file.slice(out.length + 1)}`);
  console.log(`make  ${file.slice(out.length + 1)}`);
  // 1 fps still, keyframe every 5 min; silent 5.1 audio; an English subtitle track (off by default) for the tracks menu
  // prettier-ignore
  const args = [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-loop', '1', '-framerate', '1', '-i', image,
    '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=5.1',
    '-i', subtitle,
    '-t', String(minutes * 60), '-map', '0:v', '-map', '1:a', '-map', '2:s',
    '-vf', 'scale=1920:1080,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'stillimage', '-crf', '28', '-g', '300',
    '-c:a', 'aac', '-b:a', '64k', '-c:s', 'srt',
    '-metadata:s:a:0', 'language=eng', '-metadata:s:s:0', 'language=eng', '-disposition:s:0', '0',
    '-f', 'matroska', `${file}.part`,
  ];
  const run = spawnSync('ffmpeg', args, { stdio: 'inherit' });
  if (run.status !== 0) throw new Error(`ffmpeg failed for ${file}`);
  renameSync(`${file}.part`, file);
}

// Large files: Matroska Void elements (filler players skip) appended inside the Segment, whose size field ffmpeg writes
// 8 bytes wide so it can grow in place. 100 MB each - ffmpeg scans a multi-GB element byte by byte. Sparse on APFS /
// ext4, so the Mac keeps the small file's space; a download writes every byte. Playback and runtime don't change.
const VOID = 0xec;
const CHUNK = 100_000_000;

function vint(fd, at) {
  const b = Buffer.alloc(8);
  readSync(fd, b, 0, 8, at);
  let len = 1;
  while (len <= 8 && !(b[0] & (0x80 >> (len - 1)))) len++;
  let value = b[0] & (0xff >> len);
  for (let i = 1; i < len; i++) value = value * 256 + b[i];
  return { len, value, first: b[0] };
}

const vintBytes = (value, len) => {
  const b = Buffer.alloc(len);
  for (let i = len - 1, v = value; i >= 0; i--, v = Math.floor(v / 256)) b[i] = v % 256;
  b[0] |= 0x80 >> (len - 1);
  return b;
};

/** Pads (target bytes) or unpads (0) a file. Answers whether it changed. */
function resize(file, target) {
  const fd = openSync(file, 'r+');
  try {
    const header = vint(fd, 4); // EBML header: 4-byte id, size
    const sizeAt = 4 + header.len + header.value + 4; // Segment: 4-byte id, then its size field
    const segment = vint(fd, sizeAt);
    if (segment.len !== 8) throw new Error(`${file}: Segment size is ${segment.len} bytes wide, expected 8`);
    const start = sizeAt + 8;
    // The video ends where the trailing run of Voids starts
    let end = start;
    for (let at = start; at < start + segment.value;) {
      const id = vint(fd, at); // id length = vint length; its value is irrelevant here
      const length = vint(fd, at + id.len);
      if (id.first !== VOID) end = at + id.len + length.len + length.value;
      at += id.len + length.len + length.value;
    }
    const total = target - end >= 9 ? target : end; // a Void needs its 9-byte header
    if (fstatSync(fd).size === total && start + segment.value === total) return false;
    writeSync(fd, vintBytes(total - start, 8), 0, 8, sizeAt);
    for (let at = end; at < total; at += CHUNK) {
      const n = total - at - CHUNK < 9 ? total - at : CHUNK; // a too-small tail joins the last Void
      writeSync(fd, Buffer.concat([Buffer.from([VOID]), vintBytes(n - 9, 8)]), 0, 9, at);
    }
    ftruncateSync(fd, total);
    return true;
  } finally {
    closeSync(fd);
  }
}

// Episodes vary a little, like real ones
const SPREAD = [1, 0.94, 1.06, 0.97, 1.03, 0.91];
function setSize(file, gb, i = 0) {
  if (!size) return;
  const target = size === 'large' && gb ? Math.round(gb * SPREAD[i % SPREAD.length] * 1e9) : 0;
  if (resize(file, target)) console.log(`${target ? 'large' : 'small'} ${file.slice(out.length + 1)}`);
}

for (const m of fixture.movies) {
  const name = `${m.title} (${m.year})`;
  const dir = join(out, 'movies', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'movie.nfo'),
    nfo('movie', {
      title: m.title,
      year: m.year,
      premiered: m.premiered,
      mpaa: m.rating,
      rating: m.communityRating,
      genre: m.genres,
      tagline: m.tagline,
      plot: m.overview,
      studio: m.studio,
      director: m.directors,
      // Jellyfin reads <credits> as Writer.
      credits: m.writers,
      actor: actors(m.cast),
    }),
  );
  copyFileSync(art(m.slug, 'poster.jpg'), join(dir, 'poster.jpg'));
  copyFileSync(art(m.slug, 'backdrop.jpg'), join(dir, 'backdrop.jpg'));
  video(art(m.slug, 'backdrop.jpg'), m.minutes, join(dir, `${name}.mkv`));
  setSize(join(dir, `${name}.mkv`), m.downloadGB);
}

for (const s of fixture.shows) {
  const dir = join(out, 'shows', `${s.title} (${s.year})`);
  const season = join(dir, 'Season 01');
  mkdirSync(season, { recursive: true });
  writeFileSync(
    join(dir, 'tvshow.nfo'),
    nfo('tvshow', {
      title: s.title,
      year: s.year,
      premiered: s.premiered,
      enddate: s.ended,
      status: s.status,
      mpaa: s.rating,
      rating: s.communityRating,
      genre: s.genres,
      plot: s.overview,
      studio: s.studio,
      actor: actors(s.cast),
    }),
  );
  copyFileSync(art(s.slug, 'poster.jpg'), join(dir, 'poster.jpg'));
  copyFileSync(art(s.slug, 'backdrop.jpg'), join(dir, 'backdrop.jpg'));
  s.episodes.forEach((e, i) => {
    const code = `S01E${String(i + 1).padStart(2, '0')}`;
    const base = join(season, `${s.title} ${code}`);
    const aired = new Date(Date.parse(s.premiered) + i * 7 * 86_400_000).toISOString().slice(0, 10);
    writeFileSync(
      `${base}.nfo`,
      nfo('episodedetails', { title: e.title, season: 1, episode: i + 1, aired, plot: e.overview }),
    );
    copyFileSync(art(s.slug, `${code}.jpg`), `${base}-thumb.jpg`);
    video(art(s.slug, `${code}.jpg`), s.minutes, `${base}.mkv`);
    setSize(`${base}.mkv`, s.downloadGB, i);
  });
}

console.log(`\nDone: ${out}\nNext: node setup.mjs (runs showcase.mjs: libraries, demo user, watch state)`);
