// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV Welcome (screen draft 01): first launch asks for the server address right here - no separate Add server
// step on TV. Continue probes it, then Sign in. Saved (signed-out) accounts: "Use a saved account" opens Accounts.
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useSession } from '@/session';
import { tv, useColors, useScheme } from '@/theme';
import { useServerConnect } from '@/useServerConnect';

import { LogoMark } from './LogoMark';
import { WHERE } from './ServerHelp';
import { Text } from './Text';
import { TvButton } from './TvButton';
import { TvTextField } from './TvTextField';

const wall = {
  dark: require('../../assets/images/welcome-wall-dark.svg'),
  light: require('../../assets/images/welcome-wall-light.svg'),
};

export function TvWelcome() {
  const c = useColors();
  const { accounts } = useSession();
  const { address, editAddress, error, loading, connect } = useServerConnect(true);

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <Image
        source={wall[useScheme()]}
        style={[StyleSheet.absoluteFill, styles.wall]}
        contentFit="cover"
        accessible={false}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundImage: `linear-gradient(to bottom, ${c.background}00 35%, ${c.background}8C 62%, ${c.background})`,
          },
        ]}
      />
      <View style={styles.content}>
        <LogoMark size={tv.markSize} />
        <View style={styles.copy}>
          <Text style={tv.type.title} accessibilityRole="header">
            Welcome to Rillwood
          </Text>
          <Text secondary style={[tv.type.body, styles.center]}>
            Play your Jellyfin library as it is. Enter your server&apos;s address to start.
          </Text>
        </View>
        <View style={styles.form}>
          <TvTextField
            label="Server address"
            placeholder="192.168.1.20:8096"
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
            preferredFocus
          />
          <View style={styles.buttons}>
            <TvButton title="Continue" onPress={connect} loading={loading} disabled={address.trim() === ''} />
            {accounts.length > 0 && <TvButton title="Use a saved account" onPress={() => router.push('/accounts')} />}
          </View>
        </View>
        <Text secondary style={[tv.type.small, styles.help]}>
          {WHERE.join('\n')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  wall: { opacity: tv.backdropOpacity },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tv.gap.lg,
    paddingHorizontal: tv.margin,
  },
  copy: { alignItems: 'center', gap: tv.gap.sm / 2, maxWidth: tv.textWidth },
  center: { textAlign: 'center' },
  form: { width: tv.formWidth, gap: tv.gap.sm },
  buttons: { flexDirection: 'row', justifyContent: 'center', gap: tv.gap.sm },
  help: { textAlign: 'center', maxWidth: tv.textWidth },
});
