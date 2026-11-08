// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV Sign in (screen draft 02): Quick Connect first - typing a password with a remote is slow. Left: server,
// title, how-to and buttons; right: the code (renewed when it expires) or the password form. Servers with Quick
// Connect off get the password form only.
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { isOutdatedServer, MIN_SERVER_VERSION } from '@/server';
import type { Server } from '@/session';
import { tv, useColors } from '@/theme';
import { usePasswordSignIn, useQuickConnectCode, useQuickConnectEnabled } from '@/useSignIn';

import { Text } from '../Text';
import { TvButton } from './TvButton';
import { TvTextField } from './TvTextField';

export function TvSignIn({ server, initialUserName }: { server: Server; initialUserName?: string }) {
  const c = useColors();
  const enabled = useQuickConnectEnabled(server);
  // The user's pick between the two; Quick Connect unless they chose the password (or the server has it off).
  const [usePassword, setUsePassword] = useState(false);
  const mode = enabled === undefined ? 'loading' : enabled && !usePassword ? 'code' : 'password';
  const quick = useQuickConnectCode(server, { active: mode === 'code', renewExpired: true });
  const form = usePasswordSignIn(server, initialUserName);

  const busy = form.loading;
  /**
   * Under the panel's main content: the other way to sign in, then Change Server - text only, one column, so Down from
   * the code or the form always reaches the other way first. No focus guide: a guide's destination went stale and
   * left focus on Change Server, or stuck (the other way unreachable).
   */
  const ways = (
    <View style={styles.ways}>
      {mode === 'code' && (
        <TvButton variant="quiet" icon="lock" title="Use Password" onPress={() => setUsePassword(true)} />
      )}
      {mode === 'password' && enabled && (
        <TvButton
          variant="quiet"
          icon="qrcode"
          title="Use Quick Connect"
          onPress={() => setUsePassword(false)}
          disabled={busy}
        />
      )}
      <TvButton
        variant="quiet"
        icon="server.rack"
        title="Change Server"
        onPress={() => router.back()}
        disabled={busy}
      />
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <View style={styles.side}>
        <View style={styles.server}>
          <View style={[styles.dot, { backgroundColor: c.success }]} />
          <Text secondary style={tv.type.small} numberOfLines={1}>
            {server.name} · {server.version} · {hostOf(server.url)}
          </Text>
        </View>
        <Text style={tv.type.title} accessibilityRole="header">
          Sign in
        </Text>
        <Text secondary style={tv.type.body}>
          {mode === 'password'
            ? 'Sign in with your Jellyfin username and password.'
            : 'On a phone or computer where you are signed in, open Jellyfin - Settings - Quick Connect, and enter this code.'}
        </Text>
        {isOutdatedServer(server.version) && (
          <Text secondary style={tv.type.small}>
            This server runs Jellyfin {server.version}. Some features may not work below {MIN_SERVER_VERSION}.
          </Text>
        )}
      </View>
      <View style={[styles.panel, mode !== 'password' && styles.centred, { backgroundColor: c.surface }]}>
        {mode === 'loading' && <ActivityIndicator size="large" color={c.text} />}
        {mode === 'code' &&
          (quick.error !== undefined ? (
            <>
              <Text accessibilityRole="alert" style={[tv.type.body, styles.center, { color: c.danger }]}>
                {quick.error}
              </Text>
              <TvButton variant="primary" title="Try Again" onPress={quick.retry} />
            </>
          ) : (
            // Focus starts here, on nothing to press: tvOS always focuses something, and a button focused on open
            // reads as "press me". No highlight; Down goes to the buttons.
            <Pressable
              focusable
              hasTVPreferredFocus
              accessible={false}
              style={styles.anchor}
              testID="code-focus-anchor"
            >
              <Text secondary style={tv.type.caption}>
                Quick Connect code
              </Text>
              {quick.code === undefined ? (
                <ActivityIndicator size="large" color={c.text} />
              ) : (
                <Text style={tv.type.code} accessibilityLabel={`Code ${quick.code.split('').join(' ')}`}>
                  {quick.code}
                </Text>
              )}
              <View style={styles.waiting}>
                <ActivityIndicator color={c.textSecondary} />
                <Text secondary style={tv.type.caption}>
                  Waiting for approval
                </Text>
              </View>
            </Pressable>
          ))}
        {mode === 'password' && (
          <>
            <TvTextField
              label="Username"
              icon="person.fill"
              placeholder="Username"
              value={form.userName}
              onChangeText={form.setUserName}
              textContentType="username"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              preferredFocus
            />
            <TvTextField
              label="Password"
              icon="lock.fill"
              placeholder="Password"
              secureTextEntry
              value={form.password}
              onChangeText={form.setPassword}
              error={form.error}
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={form.submit}
              editable={!busy}
            />
            <TvButton variant="primary" wide title="Sign In" onPress={form.submit} loading={busy} />
          </>
        )}
        {ways}
      </View>
    </View>
  );
}

/** `demo.jellyfin.org` from `https://demo.jellyfin.org/stable`. */
function hostOf(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tv.columnGap,
    paddingHorizontal: tv.margin,
    paddingVertical: tv.marginTop,
  },
  side: { flex: 1, gap: tv.gap.sm },
  server: { flexDirection: 'row', alignItems: 'center', gap: tv.gap.sm / 2 },
  dot: { width: tv.statusDot, height: tv.statusDot, borderRadius: tv.statusDot / 2 },
  ways: { alignItems: 'center', marginTop: tv.gap.sm },
  anchor: { alignItems: 'center', gap: tv.gap.sm },
  panel: {
    flex: 1,
    minHeight: tv.panel.minHeight,
    borderRadius: tv.panel.radius,
    padding: tv.panel.padding,
    justifyContent: 'center',
    gap: tv.gap.sm,
  },
  centred: { alignItems: 'center' },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: tv.gap.sm / 2 },
  center: { textAlign: 'center' },
});
