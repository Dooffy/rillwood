// SPDX-License-Identifier: GPL-3.0-or-later
// Phone / tablet vs Apple TV in one place (docs/decisions/tv-code-structure.md). Screens that look different on TV are
// two views picked here by their route; neither view checks the platform again.
import { createElement, type ComponentType } from 'react';
import { Platform } from 'react-native';

/**
 * A route's screen: `tv` on Apple TV, else `phone` (phones and tablets). Picked on render, not at import, so tests can
 * switch `Platform.isTV`.
 */
export function screenFor<P extends object>(views: {
  phone: ComponentType<P>;
  tv: ComponentType<P>;
}): ComponentType<P> {
  return function DeviceScreen(props: P) {
    return createElement(Platform.isTV ? views.tv : views.phone, props);
  };
}

/**
 * What the device can do, for shared code that leaves a feature out where it's missing (not the platform itself).
 * Getters, read on use: tests switch `Platform.isTV`. Apple TV today; Android TV later changes only this.
 */
export const features = {
  /** Downloads: the tab, download buttons, offline "watch something downloaded" (tvOS doesn't build the module). */
  get downloads() {
    return !Platform.isTV;
  },
  /** Screen rotation (`expo-screen-orientation`, not built on tvOS). */
  get rotation() {
    return !Platform.isTV;
  },
  /** A touch screen: player gestures (tvOS has no pinch recogniser), pull to refresh. */
  get touch() {
    return !Platform.isTV;
  },
  /**
   * A TV remote in the player: click / Play-Pause / Left-Right / swipe events, Menu (Back) hides the controls before it
   * closes (`useTvRemote`).
   */
  get remote() {
    return Platform.isTV;
  },
  /** The app's files last; tvOS keeps them in Caches, which it may purge (`src/persist.ts` uses the Keychain then). */
  get lastingFiles() {
    return !Platform.isTV;
  },
};
