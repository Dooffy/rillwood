// SPDX-License-Identifier: GPL-3.0-or-later
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { authErrorMessage, probeServer } from '@/auth';
import { Button } from '@/components/Button';
import { Page } from '@/components/Page';
import { WhereToFindServer } from '@/components/ServerHelp';
import { StepPills } from '@/components/StepPills';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { ONBOARDING, useOnboarding } from '@/navigation';
import { ONBOARDING_STEPS, serverUrlCandidates } from '@/server';

/**
 * Add server with where to find the address. From Welcome (`onboarding=1`) it is also step 1 of 2 with an
 * intro; from Add account it skips the steps.
 */
export default function Server() {
  const onboarding = useOnboarding();
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

  return (
    <Page form busy={loading}>
      {onboarding && <StepPills steps={ONBOARDING_STEPS} current={0} />}
      <Text secondary>
        {onboarding && 'Rillwood plays your own Jellyfin library. '}Enter the address you use to open Jellyfin in a
        browser.
      </Text>
      <TextField
        label="Server address"
        placeholder="https://jellyfin.example.com"
        value={address}
        onChangeText={editAddress}
        error={error}
        keyboardType="url"
        textContentType="URL"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="go"
        onSubmitEditing={connect}
        editable={!loading}
      />
      <WhereToFindServer />
      <Button title="Continue" onPress={connect} loading={loading} disabled={address.trim() === ''} />
    </Page>
  );
}
