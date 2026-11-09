// SPDX-License-Identifier: GPL-3.0-or-later
// Home's shelves under the hero, for both views: Continue Watching, Next Up, Recently Added per library. The view
// passes its shelf (`Row` on phones and tablets, `TvShelf` on Apple TV).
import { memo, useEffect, type ComponentType, type ReactNode } from 'react';

import { ApiError, isConnectionError, type BaseItemDto } from '@/api';
import { LandscapeCard, PosterCard } from '@/components/Card';
import { useItemMenu } from '@/components/ItemMenu';
import { LoadError } from '@/components/Message';
import { useShelfCards, type CardSize } from '@/components/shelfCards';
import { CardRowPlaceholder } from '@/components/Skeleton';
import { cardTitles, landscapeImage, latest, playback, posterImage, recentlyAdded } from '@/items';
import { openItem } from '@/navigation';
import type { HomeState } from '@/useHome';
import { useFetch } from '@/useFetch';
import { useImage } from '@/useImage';

/** A titled horizontal shelf of cards. */
export type ShelfView = ComponentType<{ title: string; children?: ReactNode }>;

export function HomeRows({ home, Shelf }: { home: HomeState; Shelf: ShelfView }) {
  const image = useImage();
  const menu = useItemMenu();
  // Tablets: whole cards across the row, so it never ends in a gap.
  const { posters, landscape: cards } = useShelfCards();
  const { layout, offline, views, resume, next } = home;

  const landscape = (item: BaseItemDto) => (
    <LandscapeCard
      key={item.Id}
      {...cardTitles(item)}
      {...playback(item)}
      width={cards.width}
      image={image(landscapeImage(item), cards.width)}
      item={item}
      onOpen={openItem}
      onMenu={menu}
    />
  );

  return (
    <>
      {!offline.offline && (
        <ItemRow
          Shelf={Shelf}
          title="Continue Watching"
          shape="landscape"
          size={cards}
          items={layout.resume}
          error={resume.error}
          retry={resume.refresh}
          card={landscape}
        />
      )}
      {!offline.offline && (
        <ItemRow
          Shelf={Shelf}
          title="Next Up"
          shape="landscape"
          size={cards}
          items={layout.nextUp}
          error={next.error}
          retry={next.refresh}
          card={landscape}
        />
      )}
      {layout.libraries === undefined ? (
        <ItemRow
          Shelf={Shelf}
          title="Recently Added"
          shape="poster"
          size={posters}
          error={views.error}
          retry={views.refresh}
          card={() => null}
        />
      ) : (
        layout.libraries.map((library) => (
          <LatestRow
            key={library.Id}
            Shelf={Shelf}
            library={library}
            countKey={home.countKey(library.Id)}
            posterCount={posters.count}
            posterWidth={posters.width}
            onCount={home.onLatestCount}
          />
        ))
      )}
    </>
  );
}

type LatestRowProps = {
  Shelf: ShelfView;
  library: BaseItemDto;
  countKey: string;
  /** Card size as numbers (an object would be new on every Home render and defeat the memo). */
  posterCount: number;
  posterWidth: number;
  /** Reports the row's item count once loaded, so Home can tell when everything is empty. */
  onCount: (key: string, count: number) => void;
};

// Memo: Home re-renders on every top-row update; a library's row only changes with its own data.
const LatestRow = memo(function LatestRow({
  Shelf,
  library,
  countKey,
  posterCount,
  posterWidth,
  onCount,
}: LatestRowProps) {
  const image = useImage();
  const menu = useItemMenu();
  const endpoint = latest(library.Id);
  const { data, error, refresh } = useFetch<BaseItemDto[]>(endpoint.path, { query: endpoint.query });
  const items = data && recentlyAdded(data);
  const count = items?.length;
  useEffect(() => {
    if (count !== undefined) onCount(countKey, count);
  }, [count, countKey, onCount]);
  return (
    <ItemRow
      Shelf={Shelf}
      title={`Recently Added in ${library.Name}`}
      shape="poster"
      size={{ count: posterCount, width: posterWidth }}
      items={items}
      error={error}
      retry={refresh}
      card={(item) => (
        <PosterCard
          key={item.Id}
          {...cardTitles(item)}
          played={item.UserData?.Played}
          width={posterWidth}
          image={image(posterImage(item), posterWidth)}
          item={item}
          onOpen={openItem}
          onMenu={menu}
        />
      )}
    />
  );
});

type ItemRowProps = {
  Shelf: ShelfView;
  title: string;
  shape: 'poster' | 'landscape';
  size: CardSize;
  /** undefined while loading (placeholders) or after an error; empty → row hidden. */
  items?: BaseItemDto[];
  error?: ApiError;
  retry: () => void;
  card: (item: BaseItemDto) => ReactNode;
};

/**
 * One shelf: placeholders while loading, error + Retry, hidden when empty, else cards. Out of reach with nothing
 * loaded: hidden too (the rest of Home stays; all out of reach → the offline state), back by itself on reconnect.
 */
function ItemRow({ Shelf, title, shape, size, items, error, retry, card }: ItemRowProps) {
  if (items?.length === 0 || (!items && isConnectionError(error))) return null;
  return (
    <Shelf title={title}>
      {items ? (
        items.map(card)
      ) : error ? (
        <LoadError error={error} retry={retry} />
      ) : (
        <CardRowPlaceholder shape={shape} width={size.width} count={size.count} label={`Loading ${title}`} />
      )}
    </Shelf>
  );
}
