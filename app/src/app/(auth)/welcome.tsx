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
import { spacing, useColors, useScheme } from '@/theme';

// Tilted poster-shaped tiles in the palette's surface greys, fading into the background (no server yet, so no real
// artwork). One SVG per palette.
const wall = {
  dark: require('../../../assets/images/welcome-wall-dark.svg'),
  light: require('../../../assets/images/welcome-wall-light.svg'),
};

/** First run (no accounts yet): what Rillwood is, then Get started → Add server in onboarding mode. */
export default function Welcome() {
  const c = useColors();
  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <Image
        source={wall[useScheme()]}
        style={styles.wall}
        contentFit="cover"
        contentPosition="top"
        accessible={false}
      />
      <SafeAreaView edges={['bottom']} style={styles.content}>
        <LogoMark size={56} />
        <Text variant="largeTitle" accessibilityRole="header">
          {'Your library,\nin your pocket'}
        </Text>
        <Text secondary>Connect Rillwood to your Jellyfin server to browse, play and download everything you own.</Text>
        <Button title="Get started" onPress={() => router.push({ pathname: '/server', params: ONBOARDING })} />
        <Text variant="caption" secondary style={styles.center}>
          Works with Jellyfin {MIN_SERVER_VERSION} and newer
        </Text>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', overflow: 'hidden' },
  wall: { position: 'absolute', top: 0, left: 0, right: 0, aspectRatio: 390 / 560 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md },
  center: { textAlign: 'center' },
});
