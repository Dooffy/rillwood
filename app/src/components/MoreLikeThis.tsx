// SPDX-License-Identifier: GPL-3.0-or-later
import type { BaseItemDto, ItemsResult } from '@/api';
import { cardTitles, posterImage, similar } from '@/items';
import { openItem } from '@/navigation';
import { useFetch } from '@/useFetch';
import { useImage } from '@/useImage';
import { useWide } from '@/theme';

import { POSTER_WIDTH, PosterCard, WIDE_SHELF_POSTER_WIDTH } from './Card';
import { useItemMenu } from './ItemMenu';
import { Row } from './Row';

/** "More Like This" posters for an item. Extra content: hidden while loading, when empty and on errors. */
export function MoreLikeThis({ id }: { id: string }) {
  const image = useImage();
  const menu = useItemMenu();
  const width = useWide() ? WIDE_SHELF_POSTER_WIDTH : POSTER_WIDTH;
  const endpoint = similar(id);
  const { data } = useFetch<ItemsResult>(endpoint.path, { query: endpoint.query });
  const items = data?.Items ?? [];
  if (items.length === 0) return null;
  return (
    <Row title="More Like This">
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
    </Row>
  );
}
