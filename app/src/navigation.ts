// SPDX-License-Identifier: GPL-3.0-or-later
// Navigation helpers shared by screens and the root layout.
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { getFocusedRouteNameFromRoute } from 'expo-router/react-navigation';
import type { AndroidSymbol, SFSymbol } from 'expo-symbols';
import { useEffect, useRef } from 'react';

import type { BaseItemDto } from '@/api';
import { useSession } from '@/session';
import type { Colors } from '@/theme';

/** Route param marking the first-run flow (Welcome → Add server → Sign in → Quick Connect): step pills + intro copy. */
export const ONBOARDING = { onboarding: '1' } as const;

/** Tab bar labels by route name (`src/app/(tabs)/`). */
export const TAB_TITLES = { home: 'Home', library: 'Library', downloads: 'Downloads' } as const;

type TabName = keyof typeof TAB_TITLES;

/** The tabs in order with their icons (SF Symbol, filled when selected; Material Symbol): native tabs + the sidebar. */
export const TABS: { name: TabName; sf: SFSymbol; sfSelected: SFSymbol; md: AndroidSymbol }[] = [
  { name: 'home', sf: 'house', sfSelected: 'house.fill', md: 'home' },
  { name: 'library', sf: 'rectangle.stack', sfSelected: 'rectangle.stack.fill', md: 'video_library' },
  { name: 'downloads', sf: 'arrow.down.circle', sfSelected: 'arrow.down.circle.fill', md: 'download' },
];

/**
 * Title of the tabs screen in the root stack = the focused tab. iOS shows it as the back button text on screens pushed
 * over the tabs (Settings, detail) - without it the back button reads "(tabs)".
 */
export function tabsTitle(route: Parameters<typeof getFocusedRouteNameFromRoute>[0]): string {
  const name = getFocusedRouteNameFromRoute(route) ?? 'home';
  return TAB_TITLES[name as keyof typeof TAB_TITLES] ?? TAB_TITLES.home;
}

/** A stack page with a native large-title header + back button (settings, auth on phones). */
export const page = (title: string) => ({ headerShown: true, headerLargeTitle: true, title });

/**
 * A plain (small, centred) title bar. It takes the system's own background otherwise (white in the dark palette); large
 * titles are see-through over the page, so only these set it.
 */
export const plainPage = (title: string, c: Colors) => ({
  headerShown: true,
  title,
  headerStyle: { backgroundColor: c.background },
  headerTitleStyle: { color: c.text },
  headerShadowVisible: false,
});

/**
 * A screen built on `Page` (settings, auth). Wide screens centre its content in a readable column, so the title
 * centres over it too - a large title would sit at the far left.
 */
export function readablePage(title: string, wide: boolean, c: Colors) {
  return wide ? plainPage(title, c) : page(title);
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

/** The Library tab (Downloads with nothing in it). */
export function openLibrary() {
  router.navigate('/library');
}

/** The Downloads tab, from anywhere: screens pushed over the tabs close first (offline: what still plays). */
export function openDownloads() {
  if (router.canDismiss()) router.dismissAll();
  router.navigate('/downloads');
}

/** Opens the player (M4) on an item at `start` seconds; `source` plays that version (a download's), else the default. */
export function openPlayer({ Id: id }: Pick<BaseItemDto, 'Id'>, start = 0, source?: string) {
  const params = { id, start: String(Math.floor(start)) };
  router.push({ pathname: '/player', params: source ? { ...params, source } : params });
}
