// SPDX-License-Identifier: GPL-3.0-or-later
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { probeServer } from '@/auth';
import { Button } from '@/components/Button';
import { Page } from '@/components/Page';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { serverUrlCandidates } from '@/server';

export default function Server() {
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
      if (mounted.current) router.push({ pathname: '/login', params: server });
    } catch {
      if (mounted.current) setError("Couldn't reach a Jellyfin server at this address.");
    } finally {
      busy.current = false;
      if (mounted.current) setLoading(false);
    }
  }

  return (
    <Page form>
      <Text secondary>Enter your Jellyfin server address.</Text>
      <TextField
        label="Server address"
        placeholder="https://jellyfin.example.com"
        value={address}
        onChangeText={setAddress}
        error={error}
        keyboardType="url"
        textContentType="URL"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="go"
        onSubmitEditing={connect}
        editable={!loading}
      />
      <Button title="Continue" onPress={connect} loading={loading} disabled={address.trim() === ''} />
    </Page>
  );
}
