// SPDX-License-Identifier: GPL-3.0-or-later
import type { ComponentType, ReactNode } from 'react';

import type { BaseItemDto, ItemsResult } from '@/api';
import { cardTitles, posterImage, similar } from '@/items';
import { openItem } from '@/navigation';
import { useFetch } from '@/useFetch';
import { useImage } from '@/useImage';
import { deviceSizes, useWide } from '@/theme';

import { POSTER_WIDTH, PosterCard, WIDE_SHELF_POSTER_WIDTH } from './Card';
import { useItemMenu } from './ItemMenu';
import { Row } from './Row';
import { useShelfCards } from './shelfCards';

/**
 * "More Like This" posters for an item. Extra content: hidden while loading, when empty and on errors. `Shelf`: the
 * view's shelf (`Row` on phones and tablets, `TvShelf` on Apple TV, sized like its shelves).
 */
export function MoreLikeThis({
  id,
  Shelf = Row,
}: {
  id: string;
  Shelf?: ComponentType<{ title: string; children?: ReactNode }>;
}) {
  const image = useImage();
  const menu = useItemMenu();
  const wide = useWide();
  const { posters } = useShelfCards();
  const width = deviceSizes.tvShelf ? posters.width : wide ? WIDE_SHELF_POSTER_WIDTH : POSTER_WIDTH;
  const endpoint = similar(id);
  const { data } = useFetch<ItemsResult>(endpoint.path, { query: endpoint.query });
  const items = data?.Items ?? [];
  if (items.length === 0) return null;
  return (
    <Shelf title="More Like This">
      {items.map((item: BaseItemDto) => (
        <PosterCard
          key={item.Id}
          width={width}
          {...cardTitles(item)}
          played={item.UserData?.Played}
          image={image(posterImage(item), width)}
          item={item}
          onOpen={openItem}
          onMenu={menu}
        />
      ))}
    </Shelf>
  );
}
