// SPDX-License-Identifier: GPL-3.0-or-later
// Navigation helpers shared by screens and the root layout.
import { router, type Href } from 'expo-router';
import { useEffect, useRef } from 'react';

import { useSession, type Account } from '@/session';

/** Clear the stack and show `href` as its only screen (no back). Used after sign in / sign out. */
export function resetTo(href: Href) {
  if (router.canDismiss()) router.dismissAll();
  router.replace(href);
}

/** Where a signed-out user starts: their saved accounts, or Add server on a fresh install. */
export function signedOutHome(accounts: Account[]): Href {
  return accounts.length > 0 ? '/accounts' : '/server';
}

/** Losing the active account (signed out, removed, 401) clears the stack to `signedOutHome()`. */
export function useSignedOutRedirect() {
  const { accounts, active } = useSession();
  const wasSignedIn = useRef(active !== null);
  useEffect(() => {
    if (wasSignedIn.current && !active) resetTo(signedOutHome(accounts));
    wasSignedIn.current = active !== null;
  }, [accounts, active]);
}

/** Leaf for the root layout, so account changes don't re-render the whole navigator. */
export function SignedOutRedirect() {
  useSignedOutRedirect();
  return null;
}
