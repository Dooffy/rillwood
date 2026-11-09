// SPDX-License-Identifier: GPL-3.0-or-later
import { useWindowDimensions } from 'react-native';

import { deviceSizes, spacing, useWide } from '@/theme';

import { LANDSCAPE_WIDTH, POSTER_WIDTH, WIDE_LANDSCAPE_WIDTH, WIDE_POSTER_WIDTH } from './Card';
import { fitCards } from './Row';
import { useTabContentWidth } from './TabsSidebar';

/** Cards in a shelf: their width, and how many placeholders fill the row while it loads. */
export type CardSize = { count: number; width: number };

/** Phones: the default sizes, the next card peeking in. */
const PHONE_POSTERS: CardSize = { count: 3, width: POSTER_WIDTH };
const PHONE_LANDSCAPE: CardSize = { count: 3, width: LANDSCAPE_WIDTH };

/**
 * Card sizes for a tab's horizontal shelves (Home, Library). Phones: the fixed sizes. Wide screens: whole cards across
 * the tab's width (less the sidebar in landscape), so a shelf never ends in a gap and artwork grows with the iPad.
 */
export function useShelfCards(): { rowWidth: number; posters: CardSize; landscape: CardSize } {
  const tabWidth = useTabContentWidth();
  const { width } = useWindowDimensions();
  const wide = useWide();
  const tvShelf = deviceSizes.tvShelf;
  if (tvShelf) {
    // Apple TV: the whole screen less its safe margins, TV-sized cards (`TvShelf`).
    const tvRow = width - 2 * tvShelf.margin;
    return {
      rowWidth: tvRow,
      posters: fitCards(tvRow, tvShelf.poster, 1, tvShelf.gap),
      landscape: fitCards(tvRow, tvShelf.landscape, 1, tvShelf.gap),
    };
  }
  const rowWidth = tabWidth - 2 * spacing.md;
  return {
    rowWidth,
    posters: wide ? fitCards(rowWidth, WIDE_POSTER_WIDTH) : PHONE_POSTERS,
    landscape: wide ? fitCards(rowWidth, WIDE_LANDSCAPE_WIDTH) : PHONE_LANDSCAPE,
  };
}
