// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV focus building blocks (roadmap TV task 4): the focused looks every focusable shares, the full-width row a
// swipe from above or below lands on, and focus memory - a closing menu hands focus back to the button or card that
// opened it (tvOS would otherwise pick something on its own).
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, TVEventControl, TVFocusGuideView, type StyleProp, type ViewStyle } from 'react-native';

import { tv } from '@/theme';

/** Focused looks: scale up + lift. Buttons, pills and fields grow a little, cards and profile circles more. */
export const focusStyles = StyleSheet.create({
  lift: { transform: [{ scale: tv.focus.buttonScale }], ...tv.focus.shadow },
  // A softer shadow: pill rows (filters, types) leave little room, a harsh one is cut off at the row's edge.
  pill: { transform: [{ scale: tv.focus.buttonScale }], ...tv.focus.pillShadow },
  // Above its neighbours, so the grown card isn't drawn under the next one.
  card: { transform: [{ scale: tv.focus.cardScale }], ...tv.focus.shadow, zIndex: 1 },
});

type TvFocusRowProps = {
  children: ReactNode;
  /**
   * Where the first swipe into the row lands, instead of its first item (a season's next episode). Later visits go back
   * to the last-focused item as usual.
   */
  start?: object | null;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * A row of focusables (buttons, pills, a shelf's cards) as one focus target across the whole screen: a swipe up or
 * down from anywhere lands on the row's last-focused item, its first one on the first visit - not only on what sits
 * straight above or below. Rows are full width; their content keeps its own layout.
 */
export function TvFocusRow({ children, style, testID, start }: TvFocusRowProps) {
  return (
    <TVFocusGuideView
      autoFocus
      testID={testID}
      style={style}
      destinations={
        start ? [start as NonNullable<ComponentProps<typeof TVFocusGuideView>['destinations']>[number]] : undefined
      }
    >
      {children}
    </TVFocusGuideView>
  );
}

/** A focusable native view: react-native-tvos adds `requestTVFocus` to every mounted View. */
type Focusable = { requestTVFocus?: () => void };

// The last focused item outside menus.
let last: Focusable | null = null;

/** The item focused last (outside menus), for a menu to hand focus back to when it closes. */
export function lastFocused(): Focusable | null {
  return last;
}

/** Moves focus to `view` (if it's still on screen); off TV it does nothing. */
export function restoreFocus(view: Focusable | object | null) {
  (view as Focusable | null)?.requestTVFocus?.();
}

/**
 * onFocus for a focusable a menu may open from: remembers the focused view (the event's `currentTarget`). Items inside
 * menus don't call it, so a menu opened from another (Remove after Account) still returns to the first opener.
 */
export function rememberFocus(event: { currentTarget: unknown }) {
  last = event.currentTarget as Focusable;
}

// Holders of the remote's Menu key (an open menu, a detail screen scrolled down): it comes to the app while any holds it.
let menuKeyHolders = 0;

/**
 * Takes the Menu (Back) key for the app (`BackHandler`) instead of the system's back - counted, so one holder letting
 * go (a menu closing) doesn't take it from another (the screen under it). Returns the release.
 */
export function holdMenuKey(): () => void {
  if (menuKeyHolders++ === 0) TVEventControl.enableTVMenuKey();
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    if (--menuKeyHolders === 0) TVEventControl.disableTVMenuKey();
  };
}
