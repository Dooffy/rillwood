// SPDX-License-Identifier: GPL-3.0-or-later
// Navigation helpers shared by screens and the root layout.
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { getFocusedRouteNameFromRoute } from 'expo-router/react-navigation';
import { useEffect, useRef } from 'react';

import type { BaseItemDto } from '@/api';
import { useSession } from '@/session';

/** Route param marking the first-run flow (Welcome → Add server → Sign in → Quick Connect): step pills + intro copy. */
export const ONBOARDING = { onboarding: '1' } as const;

/** Tab bar labels by route name (`src/app/(tabs)/`). */
export const TAB_TITLES = { home: 'Home', library: 'Library', downloads: 'Downloads' } as const;

/**
 * Title of the tabs screen in the root stack = the focused tab. iOS shows it as the back button text on screens pushed
 * over the tabs (Settings, detail) - without it the back button reads "(tabs)".
 */
export function tabsTitle(route: Parameters<typeof getFocusedRouteNameFromRoute>[0]): string {
  const name = getFocusedRouteNameFromRoute(route) ?? 'home';
  return TAB_TITLES[name as keyof typeof TAB_TITLES] ?? TAB_TITLES.home;
}

export function useOnboarding(): boolean {
  return useLocalSearchParams<{ onboarding?: string }>().onboarding === ONBOARDING.onboarding;
}

/** Clear the stack and show `href` as its only screen (no back). Used after sign in / sign out. */
export function resetTo(href: Href) {
  if (router.canDismiss()) router.dismissAll();
  router.replace(href);
}

/**
 * Losing the active account (signed out, removed, 401) clears the stack to Welcome - the one signed-out start.
 * Saved signed-out accounts are one tap away there ("Use a saved account").
 */
export function useSignedOutRedirect() {
  const { active } = useSession();
  const wasSignedIn = useRef(active !== null);
  useEffect(() => {
    if (wasSignedIn.current && !active) resetTo('/welcome');
    wasSignedIn.current = active !== null;
  }, [active]);
}

/** Leaf for the root layout, so account changes don't re-render the whole navigator. */
export function SignedOutRedirect() {
  useSignedOutRedirect();
  return null;
}

/** Detail screen for a card: series → `/series/[id]`, movies and episodes → `/item/[id]`. */
export function openItem({ Id: id, Type }: BaseItemDto) {
  router.push({ pathname: Type === 'Series' ? '/series/[id]' : '/item/[id]', params: { id } });
}

/** Opens the player (M4) on an item at `start` seconds. */
export function openPlayer({ Id: id }: Pick<BaseItemDto, 'Id'>, start = 0) {
  router.push({ pathname: '/player', params: { id, start: String(Math.floor(start)) } });
}
