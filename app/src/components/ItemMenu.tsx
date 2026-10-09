// SPDX-License-Identifier: GPL-3.0-or-later
// Long press on a card (Home, Library, More Like This, series episodes): one shared action sheet for the item - play,
// mark watched, favourite, download / pause / resume / delete download. Mounted once in the root layout; cards open it with `useItemMenu()`.
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Keyboard } from 'react-native';

import type { BaseItemDto } from '@/api';
import { ActionSheet, type SheetAction } from '@/components/ActionSheet';
import { cardTitles, playback } from '@/items';
import { openPlayer } from '@/navigation';
import { useSession } from '@/session';
import { useDownloadControl, type DownloadControl } from '@/useDownloadControl';
import { useUserFlag } from '@/useUserFlag';

/** Opens the menu for an item; `title` overrides the heading (the series screen names episodes without the show). */
type OpenItemMenu = (item: BaseItemDto, title?: string) => void;

// Plays straight from the menu. A show or season needs its next episode first - its detail screen has Play.
const PLAYABLE = new Set(['Movie', 'Episode', 'Video']);

const ItemMenuContext = createContext<OpenItemMenu | null>(null);

/**
 * Download / Pause / Resume / Delete Download by the item's state (a partial season: Download the rest + Delete);
 * none when it can't be downloaded.
 */
export function downloadActions({ available, summary, partial, start, pause, resume, remove }: DownloadControl) {
  const del = { label: 'Delete Download', onPress: remove };
  if (!available) return [];
  if (!summary) return [{ label: 'Download', onPress: start }];
  if (summary.state === 'downloading') return [{ label: 'Pause Download', onPress: pause }];
  if (partial) return [{ label: 'Download', onPress: start }, del];
  return summary.state === 'paused' ? [{ label: 'Resume Download', onPress: resume }, del] : [del];
}

/** The actions for an item: Resume + Play from Start (or Play), watched, favourite, download. */
export function itemActions(
  item: BaseItemDto,
  { mark, download = [] }: { mark: ReturnType<typeof useUserFlag>; download?: SheetAction[] },
): SheetAction[] {
  const { progress, resumeSeconds = 0 } = playback(item);
  const play: SheetAction[] = !PLAYABLE.has(item.Type)
    ? []
    : progress !== undefined
      ? [
          { label: 'Resume', onPress: () => openPlayer(item, resumeSeconds) },
          { label: 'Play from Start', onPress: () => openPlayer(item, 0) },
        ]
      : [{ label: 'Play', onPress: () => openPlayer(item, 0) }];
  const played = item.UserData?.Played === true;
  const favourite = item.UserData?.IsFavorite === true;
  return [
    ...play,
    { label: played ? 'Mark as Unwatched' : 'Mark as Watched', onPress: () => mark(item, 'played', !played) },
    {
      label: favourite ? 'Remove from Favourites' : 'Add to Favourites',
      onPress: () => mark(item, 'favourite', !favourite),
    },
    ...download,
  ];
}

/** Needs `ToastProvider` above it (failure toasts). */
export function ItemMenuProvider({ children }: { children: ReactNode }) {
  // The item stays after closing: the sheet keeps its content while it fades out.
  const [menu, setMenu] = useState<{ item: BaseItemDto; title: string; accountId?: string }>();
  const [visible, setVisible] = useState(false);
  const mark = useUserFlag();
  // Only for the account that opened it: after a switch or sign-out the item isn't theirs, its screen is gone.
  const accountId = useSession().active?.id;
  const download = downloadActions(useDownloadControl(menu?.item));
  if (visible && menu?.accountId !== accountId) setVisible(false);
  const open = useCallback<OpenItemMenu>(
    (item, title) => {
      // A search field's keyboard would cover the sheet.
      Keyboard.dismiss();
      const { title: name, subtitle } = cardTitles(item);
      setMenu({ item, title: title ?? [name, subtitle].filter(Boolean).join(' · '), accountId });
      setVisible(true);
    },
    [accountId],
  );
  return (
    <ItemMenuContext.Provider value={open}>
      {children}
      <ActionSheet
        visible={visible}
        title={menu?.title}
        actions={menu ? itemActions(menu.item, { mark, download }) : []}
        onClose={() => setVisible(false)}
      />
    </ItemMenuContext.Provider>
  );
}

export function useItemMenu(): OpenItemMenu {
  const open = useContext(ItemMenuContext);
  if (!open) throw new Error('useItemMenu must be used inside ItemMenuProvider');
  return open;
}
