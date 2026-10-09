// SPDX-License-Identifier: GPL-3.0-or-later
// Download from a button or menu (docs/context/downloads.md): the item's download state, start (looking up the files
// first when the item came from a list), pause / resume, delete after a confirmation, a toast when starting fails.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { ApiError, request, type BaseItemDto, type Connection, type ItemsResult, type UserDto } from '@/api';
import { useToast } from '@/components/Toast';
import {
  deleteDownloads,
  downloadId,
  pauseDownloads,
  resumeDownloads,
  startDownloads,
  downloadGroup,
  useDownloadSummary,
  useHasDownloads,
  type DownloadSummary,
} from '@/downloads';
import { currentUser, downloadSources, itemDetail, seasonFiles } from '@/items';
import { connectionFor, getSession, useSession } from '@/session';
import { useFetch } from '@/useFetch';

/** A show downloads a season at a time (its screen's header button), never all at once. */
const DOWNLOADABLE = new Set(['Movie', 'Episode', 'Video', 'Season']);

export const DOWNLOAD_FAILED = "Couldn't start the download. Check the connection and try again.";
export const DOWNLOAD_NOT_ALLOWED = "This account isn't allowed to download.";
export const DOWNLOAD_NO_SPACE = 'Not enough free space on this device.';
export const DOWNLOAD_NOTHING = "Nothing to download - the server didn't send a file.";

export type DownloadControl = {
  /** Offer Download: a downloadable type the user may download, or something of it is already here. */
  available: boolean;
  summary: DownloadSummary | null;
  /** A season with some episodes here and others still to download: Download gets the rest. */
  partial: boolean;
  /** Looking up the files before the download starts. */
  starting: boolean;
  start: () => void;
  pause: () => void;
  resume: () => void;
  /** Asks first. */
  remove: () => void;
};

/** The item's `downloadGroup` for the active account; null when it isn't downloadable or nobody is signed in. */
function useGroup(item: BaseItemDto | undefined): string | null {
  const accountId = useSession().active?.id;
  if (!accountId || !item || !DOWNLOADABLE.has(item.Type)) return null;
  return downloadGroup(accountId, item.Type === 'Season' ? { seasonId: item.Id } : { itemId: item.Id });
}

/**
 * Offer Download: a downloadable item the user may download (`/Users/Me` policy), or something of it is already here
 * (to delete it). Re-renders only when that changes, not on progress (the detail header).
 */
export function useCanDownload(item: BaseItemDto | undefined): boolean {
  const group = useGroup(item);
  const has = useHasDownloads(group);
  const user = useFetch<UserDto>(group ? currentUser.path : null);
  return !!group && (has || user.data?.Policy?.EnableContentDownloading === true);
}

/** The items to download with their files: a season's episodes; a card's item comes without `MediaSources`. */
async function withFiles(conn: Connection, item: BaseItemDto): Promise<BaseItemDto[]> {
  if (item.Type === 'Season') {
    if (!item.SeriesId) throw new ApiError('parse'); // can't look its episodes up
    const { path, query } = seasonFiles(item.SeriesId, item.Id);
    return (await request<ItemsResult>(conn, path, { query })).Items;
  }
  if (item.MediaSources?.length) return [item];
  return [await request<BaseItemDto>(conn, itemDetail(item.Id).path)];
}

export function useDownloadControl(item: BaseItemDto | undefined): DownloadControl {
  const toast = useToast();
  const available = useCanDownload(item);
  const summary = useDownloadSummary(useGroup(item));
  // A season with downloads: are episodes with a file (and a size - else they can't be downloaded) still missing?
  // Asked for only once something of it is here. Unknown (loading, offline) counts as complete.
  const season = item?.Type === 'Season' && item.SeriesId ? seasonFiles(item.SeriesId, item.Id) : undefined;
  const files = useFetch<ItemsResult>(season && summary ? season.path : null, { query: season?.query }).data;
  const partial =
    !!summary &&
    !!files &&
    downloadSources(files.Items).some((r) => r.source.Size && !summary.itemIds.includes(r.item.Id));
  const [starting, setStarting] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const start = useCallback(() => {
    const account = getSession().active;
    const conn = account && connectionFor(account);
    if (!item || !account || !conn || busy.current) return;
    busy.current = true;
    setStarting(true);
    void withFiles(conn, item)
      .then((items) => {
        // Switched account meanwhile: not theirs to download.
        if (getSession().active?.id !== account.id) return;
        const requests = downloadSources(items).filter((r) => r.source.Size);
        if (requests.length === 0) {
          toast(DOWNLOAD_NOTHING);
          return;
        }
        return startDownloads(requests).then((result) => {
          if (!result.ok) toast(result.problem === 'space' ? DOWNLOAD_NO_SPACE : DOWNLOAD_FAILED);
          // Download on a partial season also resumes its paused / failed episodes.
          else resumeDownloads(requests.map((r) => downloadId(account.id, r.item.Id, r.source.Id)));
        });
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.kind === 'aborted') return;
        toast(e instanceof ApiError && e.status === 403 ? DOWNLOAD_NOT_ALLOWED : DOWNLOAD_FAILED);
      })
      .finally(() => {
        busy.current = false;
        if (mounted.current) setStarting(false);
      });
  }, [item, toast]);

  const ids = summary?.ids;
  const pause = useCallback(() => ids && pauseDownloads(ids), [ids]);
  const resume = useCallback(() => ids && resumeDownloads(ids), [ids]);
  const name = item?.Name;
  const remove = useCallback(() => {
    if (!ids) return;
    Alert.alert(`Delete the download of ${name}?`, "It's removed from this device. You can download it again.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteDownloads(ids) },
    ]);
  }, [ids, name]);

  return { available, summary, partial, starting, start, pause, resume, remove };
}
