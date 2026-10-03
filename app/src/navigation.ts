// SPDX-License-Identifier: GPL-3.0-or-later
// Navigation helpers shared by screens and the root layout.
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useRef } from 'react';

import { useSession } from '@/session';

/** Route param marking the first-run flow (Welcome → Add server → Sign in → Quick Connect): step pills + help. */
export const ONBOARDING = { onboarding: '1' } as const;

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
