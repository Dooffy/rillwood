// SPDX-License-Identifier: GPL-3.0-or-later
// Add server form state: address, probe on Continue, then Sign in. Shared by Add server (phone / tablet) and the TV
// Welcome, which asks for the address on its first screen.
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { authErrorMessage, probeServer } from '@/auth';
import { ONBOARDING } from '@/navigation';
import { serverUrlCandidates } from '@/server';

export function useServerConnect(onboarding: boolean) {
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  // Refs, not state: Go + tap in one frame must not probe twice, and a left screen must not navigate.
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  /** Typing clears the last error. */
  const editAddress = (text: string) => {
    setAddress(text);
    setError(undefined);
  };

  async function connect() {
    if (busy.current) return;
    const candidates = serverUrlCandidates(address);
    if (candidates.length === 0) {
      setError('Enter an address like 192.168.1.10:8096 or https://jellyfin.example.com');
      return;
    }
    busy.current = true;
    setError(undefined);
    setLoading(true);
    try {
      const server = await probeServer(candidates);
      if (mounted.current)
        router.push({ pathname: '/login', params: { url: server.url, ...(onboarding && ONBOARDING) } });
    } catch (e) {
      if (mounted.current) setError(authErrorMessage(e, 'probe'));
    } finally {
      busy.current = false;
      if (mounted.current) setLoading(false);
    }
  }

  return { address, editAddress, error, loading, connect };
}
