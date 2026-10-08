// SPDX-License-Identifier: GPL-3.0-or-later
// Long press on a card (Home, Library, More Like This, series episodes): one shared action sheet for the item - play,
// mark watched, favourite, download. Mounted once in the root layout; cards open it with `useItemMenu()`.
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Keyboard } from 'react-native';

import type { BaseItemDto } from '@/api';
import { ActionSheet, type SheetAction } from '@/components/ActionSheet';
import { SOON, useToast } from '@/components/Toast';
import { cardTitles, playback } from '@/items';
import { openPlayer } from '@/navigation';
import { useSession } from '@/session';
import { useUserFlag } from '@/useUserFlag';

/** Opens the menu for an item; `title` overrides the heading (the series screen names episodes without the show). */
type OpenItemMenu = (item: BaseItemDto, title?: string) => void;

// Plays straight from the menu. A show or season needs its next episode first - its detail screen has Play.
const PLAYABLE = new Set(['Movie', 'Episode', 'Video']);
const DOWNLOADABLE = new Set(['Movie', 'Episode', 'Video', 'Season', 'Series']);

const ItemMenuContext = createContext<OpenItemMenu | null>(null);

/** The actions for an item: Resume + Play from Start (or Play), watched, favourite, download. */
export function itemActions(
  item: BaseItemDto,
  { mark, download }: { mark: ReturnType<typeof useUserFlag>; download: () => void },
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
    ...(DOWNLOADABLE.has(item.Type) ? [{ label: 'Download', onPress: download }] : []),
  ];
}

/** Needs `ToastProvider` above it (failures and the download placeholder toast). */
export function ItemMenuProvider({ children }: { children: ReactNode }) {
  // The item stays after closing: the sheet keeps its content while it fades out.
  const [menu, setMenu] = useState<{ item: BaseItemDto; title: string; accountId?: string }>();
  const [visible, setVisible] = useState(false);
  const mark = useUserFlag();
  const toast = useToast();
  // Only for the account that opened it: after a switch or sign-out the item isn't theirs, its screen is gone.
  const accountId = useSession().active?.id;
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
        actions={menu ? itemActions(menu.item, { mark, download: () => toast(SOON) }) : []}
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
