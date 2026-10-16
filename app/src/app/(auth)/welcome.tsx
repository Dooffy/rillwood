// SPDX-License-Identifier: GPL-3.0-or-later
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { LogoMark } from '@/components/LogoMark';
import { Text } from '@/components/Text';
import { MIN_SERVER_VERSION } from '@/server';
import { ONBOARDING } from '@/navigation';
import { useSession } from '@/session';
import { readableWidth, spacing, useColors, useScheme, useWide, useWideLandscape } from '@/theme';

// Tilted poster-shaped tiles in the palette's surface greys, fading into the background (no server yet, so no real
// artwork). One SVG per palette.
const wall = {
  dark: require('../../../assets/images/welcome-wall-dark.svg'),
  light: require('../../../assets/images/welcome-wall-light.svg'),
};

/**
 * Signed-out start: what Rillwood is, Get started → Add server in onboarding mode. With saved (signed-out) accounts,
 * "Use a saved account" opens Accounts to sign one back in.
 *
 * Phone: the wall on top, copy at the bottom. Wide portrait: the same, copy in a centred column. Wide landscape: the
 * wall on the left, copy on the right.
 */
export default function Welcome() {
  const c = useColors();
  const { accounts } = useSession();
  const wide = useWide();
  const split = useWideLandscape();

  // Wide: the SVG is cropped (its own bottom fade with it), so the edge next to the copy fades here.
  const fade = [
    split ? styles.fadeRight : styles.fadeBottom,
    { backgroundImage: `linear-gradient(to ${split ? 'right' : 'bottom'}, ${c.background}00, ${c.background})` },
  ];

  return (
    <View style={[styles.root, split && styles.row, { backgroundColor: c.background }]}>
      <View style={split ? styles.wallSplit : wide ? styles.wallWide : styles.wallPhone} testID="welcome-wall">
        <Image
          source={wall[useScheme()]}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          contentPosition="top"
          accessible={false}
        />
        {wide && <View style={fade} />}
      </View>
      <SafeAreaView
        edges={split ? ['top', 'bottom', 'right'] : ['bottom']}
        style={[styles.content, wide && styles.column, split && styles.side]}
      >
        <LogoMark size={56} />
        <Text variant="largeTitle" accessibilityRole="header">
          {'Your library,\nin your pocket'}
        </Text>
        <Text secondary>Connect Rillwood to your Jellyfin server to browse, play and download everything you own.</Text>
        <Button title="Get started" onPress={() => router.push({ pathname: '/server', params: ONBOARDING })} />
        {accounts.length > 0 && (
          <Button title="Use a saved account" variant="secondary" onPress={() => router.push('/accounts')} />
        )}
        <Text variant="caption" secondary style={styles.center}>
          Works with Jellyfin {MIN_SERVER_VERSION} and newer
        </Text>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'stretch' },
  wallPhone: { position: 'absolute', top: 0, left: 0, right: 0, aspectRatio: 390 / 560 },
  wallWide: { position: 'absolute', top: 0, left: 0, right: 0, height: '60%' },
  wallSplit: { flex: 1 },
  fadeBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '50%' },
  fadeRight: { position: 'absolute', top: 0, bottom: 0, right: 0, width: '40%' },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg * 2, gap: spacing.md },
  // The copy never stretches past the form column; padding sits outside it.
  column: { width: '100%', maxWidth: readableWidth.form + spacing.lg * 2, alignSelf: 'center' },
  side: { justifyContent: 'center', paddingBottom: spacing.lg },
  center: { textAlign: 'center' },
});
