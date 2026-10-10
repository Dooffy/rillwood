// SPDX-License-Identifier: GPL-3.0-or-later
// Per-download snapshot (docs/context/downloads.md): the item JSON, poster, backdrop and external subtitle files, in
// the item's folder next to the video - what offline browsing and playback read. Images and subtitle streams are
// served without auth (docs/context/api.md): no token goes into these requests. Paths stored are relative to
// `Paths.document`.
import { Directory, File, Paths } from 'expo-file-system';

import type { BaseItemDto, MediaSourceDto } from '@/api';
import { backdropImage, imageUrl, posterImage, type ImageRef } from '@/items';
import { subtitleExtension, subtitleUrl } from '@/playback';

/** What was saved; `undefined` fields had nothing on the server (no poster, ...) or failed for good (a 404). */
export type Snapshot = {
  poster?: string;
  backdrop?: string;
  /** External (sidecar) subtitles of the downloaded version, by Jellyfin stream index. */
  subtitles: { index: number; path: string }[];
};

/** Pixels: a poster sharp at 2:3 card + detail sizes, a backdrop for the full-width hero. */
const POSTER_PX = 720;
const BACKDROP_PX = 1920;

const ITEM_JSON = 'item.json';

/** `downloads/<account>/<item>` - the folder of a download's `path`. */
export const itemFolder = (path: string) => path.slice(0, path.lastIndexOf('/'));

/** A version's subtitle files start with this (`<folder>/<source>.sub-`): named after the video, a safe segment. */
export const subtitlePrefix = (path: string) => `${path.slice(0, path.lastIndexOf('.'))}.sub-`;

const fileAt = (path: string) => new File(Paths.document, path);

/** `file://` URI of a saved snapshot file (poster, backdrop) for an image view. */
export const snapshotUri = (path: string) => fileAt(path).uri;

/**
 * Saves the snapshot of one version. The item JSON is written when `item` is fresh from the server (always with the
 * downloaded version in `MediaSources`); assets already on disk are kept (a retry, or the item's other version).
 * Partial results count: only when every fetch fails (offline) does it throw, for a retry later.
 */
export async function saveSnapshot(
  baseUrl: string,
  path: string,
  item: BaseItemDto,
  source: MediaSourceDto,
  writeItem: boolean,
): Promise<Snapshot> {
  const folder = itemFolder(path);
  new Directory(Paths.document, folder).create({ intermediates: true, idempotent: true });
  const json = fileAt(`${folder}/${ITEM_JSON}`);
  if (writeItem || !json.exists) {
    const sources = item.MediaSources ?? [];
    const MediaSources = sources.some((s) => s.Id === source.Id) ? sources : [...sources, source];
    if (!json.exists) json.create();
    await json.write(JSON.stringify({ ...item, MediaSources }));
  }

  const image = (ref: ImageRef | undefined, px: number, name: string) =>
    ref ? { url: imageUrl(baseUrl, ref, px, 1), path: `${folder}/${name}` } : undefined;
  const poster = image(posterImage(item), POSTER_PX, 'poster.jpg');
  const backdrop = image(backdropImage(item), BACKDROP_PX, 'backdrop.jpg');
  const subtitles = (source.MediaStreams ?? []).flatMap((s) => {
    // The index goes into a file name: a whole number only (server JSON isn't checked against the type).
    const sidecar = s.Type === 'Subtitle' && s.IsExternal && Number.isInteger(s.Index) && s.Index >= 0;
    const url = sidecar ? subtitleUrl(baseUrl, item.Id, source.Id, s) : null;
    // Image-based formats the server can't serve as text play from the video file only.
    return url ? [{ index: s.Index, url, path: `${subtitlePrefix(path)}${s.Index}.${subtitleExtension(s)}` }] : [];
  });

  const wanted = [poster, backdrop, ...subtitles].filter((a) => a !== undefined);
  const missing = wanted.filter((a) => !fileAt(a.path).exists);
  const results = await Promise.allSettled(
    missing.map((a) => File.downloadFileAsync(a.url, fileAt(a.path), { idempotent: true })),
  );
  if (missing.length > 0 && results.every((r) => r.status === 'rejected')) throw new Error('snapshot: nothing saved');

  const saved = (a: { path: string } | undefined) => (a && fileAt(a.path).exists ? a.path : undefined);
  return {
    poster: saved(poster),
    backdrop: saved(backdrop),
    subtitles: subtitles.filter((s) => saved(s)).map(({ index, path: p }) => ({ index, path: p })),
  };
}

/** The item as it was when downloaded (offline detail), or null when it isn't there / unreadable. */
export function readSnapshotItem(path: string): BaseItemDto | null {
  try {
    const json = fileAt(`${itemFolder(path)}/${ITEM_JSON}`);
    return json.exists ? (JSON.parse(json.textSync()) as BaseItemDto) : null;
  } catch {
    return null;
  }
}
