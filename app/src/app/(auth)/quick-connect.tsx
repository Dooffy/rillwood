// SPDX-License-Identifier: GPL-3.0-or-later
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { checkQuickConnect, finishQuickConnect, initiateQuickConnect, QUICK_CONNECT_POLL_MS } from '@/auth';
import { Button } from '@/components/Button';
import { Page } from '@/components/Page';
import { Spinner } from '@/components/Spinner';
import { Text } from '@/components/Text';
import { resetTo, useServerParams } from '@/navigation';
import { radii, spacing, useColors } from '@/theme';

export default function QuickConnect() {
  const server = useServerParams();
  const c = useColors();
  const [code, setCode] = useState<string>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!server) return;
    // Aborted on unmount / retry: stops polling and keeps a cancelled sign-in from adding the account.
    const controller = new AbortController();
    const { signal } = controller;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const wait = () => new Promise<void>((resolve) => (timer = setTimeout(resolve, QUICK_CONNECT_POLL_MS)));
    (async () => {
      try {
        const { code: next, secret } = await initiateQuickConnect(server);
        if (signal.aborted) return;
        setCode(next);
        do await wait();
        while (!signal.aborted && !(await checkQuickConnect(server, secret)));
        if (signal.aborted) return;
        await finishQuickConnect(server, secret, signal);
        if (!signal.aborted) resetTo('/home');
      } catch {
        if (!signal.aborted) setFailed(true);
      }
    })();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [server, attempt]);

  if (!server) return <Redirect href="/server" />;

  function retry() {
    setFailed(false);
    setCode(undefined);
    setAttempt((a) => a + 1);
  }

  return (
    <Page>
      <Text secondary>
        On a device that is already signed in, open Jellyfin and go to Settings - Quick Connect, then enter this code.
      </Text>
      <View style={[styles.codeBox, { backgroundColor: c.surface }]}>
        {code !== undefined && (
          <Text variant="largeTitle" style={styles.code} accessibilityLabel={`Code ${code.split('').join(' ')}`}>
            {code}
          </Text>
        )}
        {code === undefined && !failed && <Spinner />}
      </View>
      {failed && (
        <>
          <Text secondary accessibilityRole="alert">
            Quick Connect failed. Check the server allows it and try again.
          </Text>
          <Button title="Try again" onPress={retry} />
        </>
      )}
      {code !== undefined && !failed && (
        <View style={styles.waiting}>
          <ActivityIndicator color={c.textSecondary} />
          <Text secondary>Waiting for approval</Text>
        </View>
      )}
      <Button title="Cancel" variant="secondary" onPress={() => router.back()} />
    </Page>
  );
}

const styles = StyleSheet.create({
  codeBox: { minHeight: 96, borderRadius: radii.card, alignItems: 'center', justifyContent: 'center' },
  code: { letterSpacing: 8, fontVariant: ['tabular-nums'] },
  waiting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
});
