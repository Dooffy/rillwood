// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV focus building blocks (roadmap TV task 4): the focused looks every focusable shares, the full-width row a
// swipe from above or below lands on, and focus memory - a closing menu hands focus back to the button or card that
// opened it (tvOS would otherwise pick something on its own) - and Back: who takes the remote's Menu key now
// (`holdBack`), caught on pushed screens by their `TvBackView` (`useTvBack`).
import * as Router from 'expo-router';
import { useState, useSyncExternalStore, type ComponentProps, type ReactNode } from 'react';
import {
  BackHandler,
  Platform,
  StyleSheet,
  TVEventControl,
  TVFocusGuideView,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

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
   * Set (even null while it mounts): the row keeps its own memory - a swipe in lands on the item focused last in it
   * while that's still on screen, else on `start` (a shelf's first card, a season's next episode). Unset: tvOS's own
   * memory (buttons, pills).
   */
  start?: object | null;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

type Destination = NonNullable<ComponentProps<typeof TVFocusGuideView>['destinations']>[number];

/**
 * Where a swipe into a row with its own memory goes: the last-focused item, else `start` (once each). tvOS skips a
 * target that's gone. Ours, not tvOS's memory: its first visit picks by its own rules (a shelf's last card), later ones
 * a native view kept from before - stale once the row's cards change (a refetch after playback).
 */
export function rowTargets(last: Destination | null, start: Destination | null): Destination[] {
  return [last, start].filter((t, i, all): t is NonNullable<Destination> => t != null && all.indexOf(t) === i);
}

/**
 * A row of focusables (buttons, pills, a shelf's cards) as one focus target across the whole screen: a swipe up or
 * down from anywhere lands on the row's last-focused item (its first one, or `start`, on the first visit) - not only on
 * what sits straight above or below. Rows are full width; their content keeps its own layout.
 */
export function TvFocusRow({ children, style, testID, start }: TvFocusRowProps) {
  // The descendant focused last (the focus event's target), for rows with their own memory.
  const [last, setLast] = useState<Destination | null>(null);
  const own = start !== undefined;
  return (
    <TVFocusGuideView
      autoFocus
      testID={testID}
      style={style}
      // A new list each render: the guide looks its targets up again, so a card gone since is skipped.
      destinations={own ? rowTargets(last, start as Destination) : undefined}
      onFocusCapture={own ? (e) => setLast(e.target as Destination) : undefined}
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
 * go (a menu closing) doesn't take it from another (the screen under it). Returns the release. Use `holdBack`.
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

// What Back does now: the latest holder's handler first (a menu over a screen scrolled down). A holder belongs to a
// screen (`scope`: its navigation object) or, with none, to whichever screen is on top (menus, drawn over every screen).
type BackHolder = { onBack: () => void; scope?: object };
const backStack: BackHolder[] = [];
const backListeners = new Set<() => void>();
const notifyBack = () => backListeners.forEach((l) => l());
/** Where Back goes on a screen: its own latest holder or a menu - never a screen's under it (scrolled down). */
const topFor = (scope: object | undefined) =>
  backStack.findLast((h) => h.scope === undefined || scope === undefined || h.scope === scope);
// A press the screen's native catcher took may reach the app's root handler too: once is enough.
let caughtAt = 0;
const SAME_PRESS_MS = 300;

/**
 * Back (the remote's Menu key) runs `onBack` instead of leaving, until the release - the latest holder first. `scope`:
 * the screen it belongs to (`useBackScope`); none for menus. On tab screens `BackHandler` hears the key; on pushed screens
 * (player, detail, series) the native stack takes it first, so the screen's `TvBackView` catches it (`useTvBack`).
 */
export function holdBack(onBack: () => void, scope?: object): () => void {
  const release = holdMenuKey();
  const holder: BackHolder = { onBack, scope };
  backStack.push(holder);
  notifyBack();
  const sub = BackHandler.addEventListener('hardwareBackPress', () => {
    if (Date.now() - caughtAt > SAME_PRESS_MS) backStack.at(-1)?.onBack();
    return true;
  });
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    sub.remove();
    backStack.splice(backStack.indexOf(holder), 1);
    notifyBack();
    release();
  };
}

// The router's, else none (tests that mock the router without it): holders then count for every screen.
const useNavigationScope = (): object | undefined => (Router.useNavigation ?? (() => undefined))();

/** The screen a Back holder belongs to (pass to `holdBack`). */
export const useBackScope = useNavigationScope;

const subscribeBack = (listener: () => void) => {
  backListeners.add(listener);
  return () => backListeners.delete(listener);
};

/**
 * A pushed screen's Back catcher (`TvBackView` props): on while its own holders or a menu take Back, the press then runs
 * the latest one; off, Back leaves the screen as usual - a screen under it holding Back doesn't keep it open.
 */
export function useTvBack(): { enabled: boolean; onBack: () => void } {
  const scope = useNavigationScope();
  const enabled = useSyncExternalStore(subscribeBack, () => topFor(scope) !== undefined);
  return {
    enabled: Platform.isTV && enabled,
    onBack: () => {
      caughtAt = Date.now();
      topFor(scope)?.onBack();
    },
  };
}
