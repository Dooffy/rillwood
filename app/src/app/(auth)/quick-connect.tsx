// SPDX-License-Identifier: GPL-3.0-or-later
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { authErrorMessage, quickConnect, useServerParam } from '@/auth';
import { Button } from '@/components/Button';
import { Message } from '@/components/Message';
import { Page } from '@/components/Page';
import { Spinner } from '@/components/Spinner';
import { StepPills } from '@/components/StepPills';
import { Text } from '@/components/Text';
import { resetTo, useOnboarding } from '@/navigation';
import { ONBOARDING_STEPS } from '@/server';
import { radii, spacing, useColors } from '@/theme';

export default function QuickConnect() {
  const server = useServerParam();
  const onboarding = useOnboarding();
  const c = useColors();
  const [code, setCode] = useState<string>();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!server) return;
    // Aborted on unmount / retry: stops polling and a cancelled sign-in never adds the account.
    const controller = new AbortController();
    quickConnect(server, { signal: controller.signal, onCode: setCode })
      .then(() => resetTo('/home'))
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setError(authErrorMessage(e, 'quickConnect'));
      });
    return () => controller.abort();
  }, [server, attempt]);

  if (!server) return <Redirect href="/server" />;

  function retry() {
    setError(undefined);
    setCode(undefined);
    setAttempt((a) => a + 1);
  }

  return (
    <Page>
      {onboarding && <StepPills steps={ONBOARDING_STEPS} current={1} />}
      <Text secondary>
        On a device that is already signed in, open Jellyfin and go to Settings - Quick Connect, then enter this code.
      </Text>
      <View style={[styles.codeBox, { backgroundColor: c.surface }]}>
        {code !== undefined && (
          <Text variant="largeTitle" style={styles.code} accessibilityLabel={`Code ${code.split('').join(' ')}`}>
            {code}
          </Text>
        )}
        {code === undefined && error === undefined && <Spinner />}
      </View>
      {error !== undefined && <Message alert text={error} retry={retry} />}
      {code !== undefined && error === undefined && (
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
