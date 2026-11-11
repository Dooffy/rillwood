// SPDX-License-Identifier: GPL-3.0-or-later
// Movie / episode detail. Route: loads the item, then the phone / tablet or the Apple TV view (`src/screens/phone/`,
// `src/screens/tv/`), logic in `useItemDetail`. Data rules: docs/context/api.md (Detail).
// Offline (or the server failing) with a download of it: the item saved with the download instead of an error.
import { useLocalSearchParams } from 'expo-router';

import { LoadError, Message } from '@/components/Message';
import { DetailPlaceholder } from '@/components/Skeleton';
import { TvDetailPlaceholder } from '@/components/tv/TvSkeleton';
import { screenFor } from '@/device';
import { isItemId } from '@/items';
import { PhoneItemDetail } from '@/screens/phone/PhoneItemDetail';
import { TvItemDetail } from '@/screens/tv/TvItemDetail';
import { useItem } from '@/useItem';

const Detail = screenFor({ phone: PhoneItemDetail, tv: TvItemDetail });
// Loading: shaped like the view that follows, so nothing jumps.
const Placeholder = screenFor({ phone: DetailPlaceholder, tv: TvDetailPlaceholder });

export default function ItemDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // Offline or failed (a 404 too - the file on the phone still plays): the item saved with its download.
  const { item, saved, fromSaved, error, refresh } = useItem(id);

  if (item) return <Detail item={item} saved={fromSaved ? saved : null} />;
  if (!isItemId(id) || error?.status === 404) return <Message fill text="This item isn't available." />;
  if (error) return <LoadError fill header error={error} retry={refresh} />;
  return <Placeholder />;
}
