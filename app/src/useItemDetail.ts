// SPDX-License-Identifier: GPL-3.0-or-later
// Movie / episode detail for both views (`PhoneItemDetail`, `TvItemDetail`): what the screen shows (`detailView`) and
// what its buttons do - play, play from start, watched / favourite, the episode's series.
import type { BaseItemDto } from '@/api';
import { detailView } from '@/detail';
import type { SavedItem } from '@/downloads';
import type { UserFlag } from '@/items';
import { openItem, openPlayer } from '@/navigation';
import { useUserFlag } from '@/useUserFlag';

export type ItemDetailState = ReturnType<typeof useItemDetail>;

/** What the route hands either view. */
export type ItemDetailProps = {
  item: BaseItemDto;
  /** The copy saved with a download - its own art, nothing more from the server (no logo, More Like This). */
  saved: SavedItem | null;
};

export function useItemDetail(item: BaseItemDto) {
  const mark = useUserFlag();
  const view = detailView(item);
  const { progress, resumeSeconds = 0, remainingSeconds = 0, played } = view.playback;
  const inProgress = progress !== undefined;
  const { SeriesId: seriesId, SeriesName: seriesName } = item;
  return {
    view,
    progress,
    remainingSeconds,
    played,
    favourite: item.UserData?.IsFavorite === true,
    play: () => openPlayer(item, resumeSeconds),
    /** In progress only: plays from the beginning. */
    startOver: inProgress ? () => openPlayer(item, 0) : undefined,
    mark: (flag: UserFlag, value: boolean) => mark(item, flag, value),
    /** An episode's series: its name and a way there. */
    parent:
      item.Type === 'Episode' && seriesId
        ? {
            name: seriesName ?? 'Series',
            open: () => openItem({ Id: seriesId, Name: seriesName ?? '', Type: 'Series' }),
          }
        : undefined,
  };
}
