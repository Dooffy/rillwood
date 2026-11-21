// SPDX-License-Identifier: GPL-3.0-or-later
// Kids mode kept shows (docs/context/kids.md, Downloads; roadmap 9b): after every sync run (and auto-remove, which
// takes a kept show's watched episodes a day after watching), each show the active account keeps asks the server for
// its next episodes and downloads the missing ones - the store skips what's here, the Wi-Fi rule, limit and free space
// apply as always. Quiet: nothing on screen; out of reach or a problem → the next run tries again.
import { request, type ItemsResult } from '@/api';
import { features } from '@/device';
import { downloadSources, seriesNextUp } from '@/items';
import { episodesToKeep, showFiles } from '@/kidsDownloads';
import { getKids } from '@/kidsSettings';
import { connectionFor, getSession } from '@/session';
import { startDownloads } from '@/downloads';

/** One kept show's next episodes with their files. */
export async function keptEpisodes(conn: NonNullable<ReturnType<typeof connectionFor>>, seriesId: string) {
  const files = showFiles(seriesId);
  const next = seriesNextUp(seriesId);
  const [all, up] = await Promise.all([
    request<ItemsResult>(conn, files.path, { query: files.query }),
    request<ItemsResult>(conn, next.path, { query: next.query }),
  ]);
  return episodesToKeep(all.Items, up.Items[0]?.Id);
}

let running = false;

/** Top up every show the active account keeps (one run at a time). */
export async function topUpKept(): Promise<void> {
  const account = getSession().active;
  const conn = account && connectionFor(account);
  const kept = account ? (getKids(account.id).kept ?? []) : [];
  if (!features.downloads || !account || !conn || kept.length === 0 || running) return;
  running = true;
  try {
    for (const seriesId of kept) {
      try {
        const requests = downloadSources(await keptEpisodes(conn, seriesId)).filter((r) => r.source.Size);
        // Switched account meanwhile: not theirs.
        if (getSession().active?.id !== account.id) return;
        if (requests.length > 0) await startDownloads(requests);
      } catch {
        // This show this time; the others still go, the next run tries again.
      }
    }
  } finally {
    running = false;
  }
}
