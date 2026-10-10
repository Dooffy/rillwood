// SPDX-License-Identifier: GPL-3.0-or-later
// What a download row does (Downloads tab, a show's downloaded episodes): play, delete after asking, the long-press menu.
import { useCallback, useRef, useState } from 'react';

import { request, type BaseItemDto } from '@/api';
import type { Download } from '@/downloads';
import { itemDetail, playback } from '@/items';
import { openPlayer } from '@/navigation';
import { connectionFor, getSession } from '@/session';
import { confirmDeleteDownloads } from '@/useDownloadControl';

import { ActionSheet } from './ActionSheet';

/** Row handlers plus the menu sheet to render once on the screen. */
export function useDownloadActions() {
  const [menu, setMenu] = useState<Download | null>(null);
  const close = useCallback(() => setMenu(null), []);
  const remove = useCallback((d: Download) => confirmDeleteDownloads(d.title, [d.id]), []);

  // Streams for now (the local file plays with offline mode, M6), from the server's resume point; lookup failed →
  // from the start. One at a time; dropped if the account changed meanwhile.
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

  const sheet = (
    <ActionSheet
      visible={menu !== null}
      title={menu?.title}
      actions={menu ? [{ label: 'Delete Download', onPress: () => remove(menu) }] : []}
      onClose={close}
    />
  );

  return { play, remove, openMenu: setMenu, sheet };
}
