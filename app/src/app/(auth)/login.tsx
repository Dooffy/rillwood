// SPDX-License-Identifier: GPL-3.0-or-later
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type TextInputInstance } from 'react-native';

import { authErrorMessage, quickConnectEnabled, signIn, useServerParam } from '@/auth';
import { Button } from '@/components/Button';
import { Page } from '@/components/Page';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { isOutdatedServer, MIN_SERVER_VERSION } from '@/server';
import { resetTo } from '@/navigation';
import { spacing } from '@/theme';

export default function Login() {
  const server = useServerParam();
  // Prefilled when signing a signed-out account back in.
  const params = useLocalSearchParams<{ userName?: string }>();
  const [userName, setUserName] = useState(params.userName ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [quickConnect, setQuickConnect] = useState(false);
  const passwordRef = useRef<TextInputInstance>(null);
  // Ref, not state: Go + tap in one frame must not sign in twice.
  const busy = useRef(false);

  const name = userName.trim();

  useEffect(() => {
    if (!server) return;
    const controller = new AbortController();
    quickConnectEnabled(server, controller.signal)
      .then(setQuickConnect)
      .catch(() => {});
    return () => controller.abort();
  }, [server]);

  if (!server) return <Redirect href="/server" />;

  const submit = async () => {
    if (name === '' || busy.current) return;
    busy.current = true;
    setError(undefined);
    setLoading(true);
    try {
      await signIn(server, name, password);
      resetTo('/home');
    } catch (e) {
      busy.current = false;
      setError(authErrorMessage(e, 'signIn'));
      setLoading(false);
    }
  };

  return (
    <Page form>
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
      <Button title="Sign in" onPress={submit} loading={loading} disabled={name === ''} />
      {quickConnect && (
        <Button
          title="Use Quick Connect"
          variant="secondary"
          disabled={loading}
          onPress={() => router.push({ pathname: '/quick-connect', params: { url: server.url } })}
        />
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  server: { gap: spacing.xs },
});
