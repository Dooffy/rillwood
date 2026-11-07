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
