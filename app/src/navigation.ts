// SPDX-License-Identifier: GPL-3.0-or-later
// Navigation helpers shared by screens and the root layout.
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';

import { useAccounts, type Server } from '@/auth';

/** Clear the stack and show `href` as its only screen (no back). Used after sign in / sign out. */
export function resetTo(href: Href) {
  if (router.canDismiss()) router.dismissAll();
  router.replace(href);
}

/** Losing the active account (last one removed, later: 401) sends the user to Add server. */
export function useSignedOutRedirect() {
  const { active } = useAccounts();
  const wasSignedIn = useRef(active !== null);
  useEffect(() => {
    if (wasSignedIn.current && !active) resetTo('/server');
    wasSignedIn.current = active !== null;
  }, [active]);
}

/** Leaf for the root layout, so account changes don't re-render the whole navigator. */
export function SignedOutRedirect() {
  useSignedOutRedirect();
  return null;
}

/** Server passed between auth screens as route params, with a stable identity. Null without one. */
export function useServerParams(): Server | null {
  const { url, name, version } = useLocalSearchParams<Server>();
  return useMemo(() => (url ? { url, name, version } : null), [url, name, version]);
}
