// SPDX-License-Identifier: GPL-3.0-or-later
// Long press on a card (Home, Library, More Like This, series episodes): one shared action sheet for the item - play,
// mark watched, favourite, download / pause / resume / cancel / delete download. Mounted once in the root layout; cards open it with `useItemMenu()`.
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Keyboard } from 'react-native';

import type { BaseItemDto } from '@/api';
import { ActionSheet, type SheetAction } from '@/components/ActionSheet';
import { cardTitles, playback } from '@/items';
import { openItem, openPlayer } from '@/navigation';
import { useSession } from '@/session';
import { downloadActions, useDownloadControl } from '@/useDownloadControl';
import { useUserFlag } from '@/useUserFlag';

/**
 * Opens the menu for an item; `title` overrides the heading (the series screen names episodes without the show).
 * `details`: a way to the item's own screen too (Apple TV episode cards, where a click plays).
 */
type OpenItemMenu = (item: BaseItemDto, title?: string, options?: { details?: boolean }) => void;

// Plays straight from the menu. A show or season needs its next episode first - its detail screen has Play.
const PLAYABLE = new Set(['Movie', 'Episode', 'Video']);

const ItemMenuContext = createContext<OpenItemMenu | null>(null);

/** The actions for an item: Resume + Play from Start (or Play), watched, favourite, its details (when asked), download. */
export function itemActions(
  item: BaseItemDto,
  {
    mark,
    download = [],
    details = false,
  }: { mark: ReturnType<typeof useUserFlag>; download?: SheetAction[]; details?: boolean },
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
    ...(details
      ? [{ label: `${item.Type === 'Episode' ? 'Episode' : ''} Details`.trim(), onPress: () => openItem(item) }]
      : []),
    ...download,
  ];
}

/** Needs `ToastProvider` above it (failure toasts). */
export function ItemMenuProvider({ children }: { children: ReactNode }) {
  // The item stays after closing: the sheet keeps its content while it fades out.
  const [menu, setMenu] = useState<{ item: BaseItemDto; title: string; details?: boolean; accountId?: string }>();
  const [visible, setVisible] = useState(false);
  const mark = useUserFlag();
  // Only for the account that opened it: after a switch or sign-out the item isn't theirs, its screen is gone.
  const accountId = useSession().active?.id;
  const download = downloadActions(useDownloadControl(menu?.item));
  if (visible && menu?.accountId !== accountId) setVisible(false);
  const open = useCallback<OpenItemMenu>(
    (item, title, options) => {
      // A search field's keyboard would cover the sheet.
      Keyboard.dismiss();
      const { title: name, subtitle } = cardTitles(item);
      setMenu({
        item,
        title: title ?? [name, subtitle].filter(Boolean).join(' · '),
        details: options?.details,
        accountId,
      });
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
        actions={menu ? itemActions(menu.item, { mark, download, details: menu.details }) : []}
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
