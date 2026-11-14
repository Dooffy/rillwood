// SPDX-License-Identifier: GPL-3.0-or-later
// Series detail. Route: loads the show, then the phone / tablet or the Apple TV view (`src/screens/phone/`,
// `src/screens/tv/`), logic in `useSeriesDetail`. Data rules: docs/context/api.md (Series data), downloads:
// docs/context/downloads.md. Offline (or failed) with episodes of it downloaded: the show's saved name + poster.
import { useLocalSearchParams } from 'expo-router';

import { LoadError, Message } from '@/components/Message';
import { DetailPlaceholder } from '@/components/Skeleton';
import { TvDetailPlaceholder } from '@/components/tv/TvSkeleton';
import { screenFor } from '@/device';
import { isItemId } from '@/items';
import { PhoneSeriesDetail, SavedSeries } from '@/screens/phone/PhoneSeriesDetail';
import { TvSeriesDetail } from '@/screens/tv/TvSeriesDetail';
import { useItem } from '@/useItem';

const Series = screenFor({ phone: PhoneSeriesDetail, tv: TvSeriesDetail });
// Loading: shaped like the view that follows, so nothing jumps.
const Placeholder = screenFor({ phone: DetailPlaceholder, tv: TvDetailPlaceholder });

export default function SeriesDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // Offline or failed with episodes of it downloaded: the show's name + poster, and its downloaded episodes.
  const { item, saved, fromSaved, error, refresh } = useItem(id);

  if (fromSaved && saved) return <SavedSeries saved={saved} />;
  if (item) return <Series series={item} />;
  if (!isItemId(id) || error?.status === 404) return <Message fill text="This series isn't available." />;
  if (error) return <LoadError fill header error={error} retry={refresh} />;
  return <Placeholder />;
}
