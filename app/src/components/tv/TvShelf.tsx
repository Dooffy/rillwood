// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV shelf: title over a horizontal row of cards, at the screen's safe margins. The row leaves room above and
// below so a focused card can grow and lift without being cut off. The row is one focus target across the screen: a
// swipe from any card above or below (even one far along its own shelf) lands on this shelf's last-focused card while
// it's still there, else the first one (or `start`).
import { Children, cloneElement, isValidElement, useState, type ReactNode, type Ref } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { tv } from '@/theme';

import { Text } from '../Text';
import { TvFocusRow } from './focus';

export type TvShelfProps = {
  /** Shelf heading; none when something above names it (a season's episodes under the season pills). */
  title?: string;
  /** Cards, scrolled horizontally. */
  children?: ReactNode;
  /** A long shelf: its own horizontal list (virtualised, `tvShelfListContent`) instead of `children`. */
  list?: ReactNode;
  /** Side inset for the title and cards: the screen's safe margin by default, less in a column (Search results). */
  margin?: number;
  /** Where the first swipe into the shelf lands (`TvFocusRow` `start`); the first card by default (needs a `ref`). */
  start?: object | null;
};

/** Content padding for a shelf's own list (`list`): the margins and the room a focused card needs. */
export const tvShelfListContent = {
  paddingHorizontal: tv.margin,
  paddingVertical: tv.shelf.focusRoom,
};

export function TvShelf({ title, children, list, start, margin = tv.margin }: TvShelfProps) {
  // The first card (state: the row gets it once it mounts); it takes the ref, so cards pass `ref` to their focusable.
  const [first, setFirst] = useState<object | null>(null);
  const cards = Children.toArray(children);
  const head = cards[0];
  if (isValidElement<{ ref?: Ref<object> }>(head)) cards[0] = cloneElement(head, { ref: setFirst });
  return (
    <View>
      {title !== undefined && (
        <Text accessibilityRole="header" numberOfLines={1} style={[tv.type.shelf, { paddingHorizontal: margin }]}>
          {title}
        </Text>
      )}
      <TvFocusRow start={start ?? first}>
        {list ?? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.list, { paddingHorizontal: margin }]}
          >
            {cards}
          </ScrollView>
        )}
      </TvFocusRow>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: tv.margin, paddingVertical: tv.shelf.focusRoom, gap: tv.shelf.gap },
});
