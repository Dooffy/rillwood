// SPDX-License-Identifier: GPL-3.0-or-later
// What a download row does (Downloads tab, a show's downloaded episodes): play, delete after asking, the menu (ring tap,
// long press): Pause / Resume + Cancel Download while not finished, Delete Download once done.
import { useCallback, useEffect, useRef, useState } from 'react';

import { request, type BaseItemDto } from '@/api';
import { cancelDownloads, pauseDownload, resumeDownload, summarize, useDownload, type Download } from '@/downloads';
import { itemDetail, playback } from '@/items';
import { openPlayer } from '@/navigation';
import { connectionFor, getSession } from '@/session';
import { confirmDeleteDownloads, downloadActions } from '@/useDownloadControl';

import { ActionSheet } from './ActionSheet';

/** Row handlers plus the menu sheet to render once on the screen. */
export function useDownloadActions() {
  const [menu, setMenu] = useState<Download | null>(null);
  const close = useCallback(() => setMenu(null), []);
  const remove = useCallback((d: Download) => confirmDeleteDownloads(d.title, [d.id]), []);

  // Plays the file on the phone (the player picks the download), from the server's resume point; lookup failed
  // (offline) → from the start until offline progress (M6). One at a time; dropped if the account changed meanwhile.
  const opening = useRef(false);
  const play = useCallback(async (d: Download) => {
    if (opening.current) return;
    opening.current = true;
    let start = 0;
    try {
      const account = getSession().active;
      const conn = account && connectionFor(account);
      if (conn) start = playback(await request<BaseItemDto>(conn, itemDetail(d.itemId).path)).resumeSeconds ?? 0;
    } catch {}
    opening.current = false;
    if (getSession().active?.id === d.accountId) openPlayer({ Id: d.itemId }, start);
  }, []);

  const sheet = <DownloadMenu of={menu} remove={remove} onClose={close} />;

  return { play, remove, openMenu: setMenu, sheet };
}

/**
 * One download's menu (the item menu's rules): live on its own, so progress re-renders only the sheet, not the screen.
 * Gone meanwhile (deleted elsewhere) → closes, so a re-download with the same id never reopens it.
 */
function DownloadMenu({
  of,
  remove,
  onClose,
}: {
  of: Download | null;
  remove: (d: Download) => void;
  onClose: () => void;
}) {
  const d = useDownload(of?.id ?? null);
  const gone = of !== null && d === null;
  useEffect(() => {
    if (gone) onClose();
  }, [gone, onClose]);
  const actions = d
    ? downloadActions({
        available: true,
        summary: summarize([d]),
        partial: false,
        starting: false,
        start: () => {},
        pause: () => pauseDownload(d.id),
        resume: () => resumeDownload(d.id),
        remove: () => remove(d),
        cancel: () => cancelDownloads([d.id]),
      })
    : [];
  return <ActionSheet visible={d !== null} title={of?.title} actions={actions} onClose={onClose} />;
}
