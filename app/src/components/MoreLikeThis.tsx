// SPDX-License-Identifier: GPL-3.0-or-later
import type { BaseItemDto, ItemsResult } from '@/api';
import { cardTitles, posterImage, similar } from '@/items';
import { openItem } from '@/navigation';
import { useFetch } from '@/useFetch';
import { useImage } from '@/useImage';

import { POSTER_WIDTH, PosterCard } from './Card';
import { useItemMenu } from './ItemMenu';
import { Row } from './Row';

/** "More Like This" posters for an item. Extra content: hidden while loading, when empty and on errors. */
export function MoreLikeThis({ id }: { id: string }) {
  const image = useImage();
  const menu = useItemMenu();
  const endpoint = similar(id);
  const { data } = useFetch<ItemsResult>(endpoint.path, { query: endpoint.query });
  const items = data?.Items ?? [];
  if (items.length === 0) return null;
  return (
    <Row title="More Like This">
      {items.map((item: BaseItemDto) => (
        <PosterCard
          key={item.Id}
          {...cardTitles(item)}
          played={item.UserData?.Played}
          image={image(posterImage(item), POSTER_WIDTH)}
          onPress={() => openItem(item)}
          onLongPress={() => menu(item)}
        />
      ))}
    </Row>
  );
}
