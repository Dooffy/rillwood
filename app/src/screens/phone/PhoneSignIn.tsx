// SPDX-License-Identifier: GPL-3.0-or-later
// Phone / tablet Sign in: username + password, Quick Connect as a second button.
import { router } from 'expo-router';
import { useRef } from 'react';
import { StyleSheet, View, type TextInputInstance } from 'react-native';

import { Button } from '@/components/Button';
import { Page } from '@/components/Page';
import { StepPills } from '@/components/StepPills';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { isOutdatedServer, MIN_SERVER_VERSION, ONBOARDING_STEPS } from '@/server';
import { ONBOARDING, useOnboarding } from '@/navigation';
import type { Server } from '@/session';
import { spacing } from '@/theme';
import { usePasswordSignIn, useQuickConnectEnabled } from '@/useSignIn';

/** Username + password, Quick Connect as a second button (phone, tablet). */
export function PhoneSignIn({ server, initialUserName }: { server: Server; initialUserName?: string }) {
  const onboarding = useOnboarding();
  const quickConnect = useQuickConnectEnabled(server) ?? false;
  const { userName, setUserName, password, setPassword, canSubmit, error, loading, submit } = usePasswordSignIn(
    server,
    initialUserName,
  );
  const passwordRef = useRef<TextInputInstance>(null);

  return (
    <Page form busy={loading}>
      {onboarding && (
        <>
          <StepPills steps={ONBOARDING_STEPS} current={1} />
          <Text secondary>
            {quickConnect
              ? 'Sign in with your Jellyfin username and password, or use Quick Connect to approve this phone from a device where you are already signed in.'
              : 'Sign in with your Jellyfin username and password.'}
          </Text>
        </>
      )}
      <View style={styles.server}>
        <Text variant="label">{server.name}</Text>
        <Text variant="caption" secondary>
          {server.url}
        </Text>
      </View>
      {isOutdatedServer(server.version) && (
        <Text variant="caption" secondary>
          This server runs Jellyfin {server.version}. Some features may not work below {MIN_SERVER_VERSION}.
        </Text>
      )}
      <TextField
        label="Username"
        value={userName}
        onChangeText={setUserName}
        textContentType="username"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordRef.current?.focus()}
        editable={!loading}
      />
      <TextField
        ref={passwordRef}
        label="Password"
        secure
        value={password}
        onChangeText={setPassword}
        error={error}
        textContentType="password"
        autoComplete="current-password"
        returnKeyType="go"
        onSubmitEditing={submit}
        editable={!loading}
      />
      <Button title="Sign in" onPress={submit} loading={loading} disabled={!canSubmit} />
      {quickConnect && (
        <Button
          title="Use Quick Connect"
          variant="secondary"
          disabled={loading}
          onPress={() =>
            router.push({
              pathname: '/quick-connect',
              params: { url: server.url, ...(onboarding && ONBOARDING) },
            })
          }
        />
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  server: { gap: spacing.xs },
});
