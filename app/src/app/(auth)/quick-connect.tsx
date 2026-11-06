// SPDX-License-Identifier: GPL-3.0-or-later
import { Redirect, router } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useServerParam } from '@/auth';
import { Button } from '@/components/Button';
import { Message } from '@/components/Message';
import { Page } from '@/components/Page';
import { Spinner } from '@/components/Spinner';
import { StepPills } from '@/components/StepPills';
import { Text } from '@/components/Text';
import { useOnboarding } from '@/navigation';
import { ONBOARDING_STEPS } from '@/server';
import { radii, spacing, useColors } from '@/theme';
import { useQuickConnectCode } from '@/useSignIn';

export default function QuickConnect() {
  const server = useServerParam();
  const onboarding = useOnboarding();
  const c = useColors();
  const { code, error, retry } = useQuickConnectCode(server);

  if (!server) return <Redirect href="/server" />;

  return (
    <Page narrow>
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
