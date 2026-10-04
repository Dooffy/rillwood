// SPDX-License-Identifier: GPL-3.0-or-later
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { ColorsContext, palettes, spacing } from '@/theme';

// Player UI + mpv adapter land in M4 (docs/context/player.md). Always dark, whatever the Appearance setting.
// Until then: a centred note + Close, padded with the insets hook (a fullScreenModal has no swipe to dismiss, so Close
// must never end up under the status bar).
export default function Player() {
  const insets = useSafeAreaInsets();
  return (
    <ColorsContext.Provider value={palettes.dark}>
      <StatusBar style="light" />
      <View
        style={[styles.container, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.md }]}
      >
        <Text secondary>Playback comes in a later build.</Text>
        <Button title="Close" variant="secondary" onPress={() => router.back()} />
      </View>
    </ColorsContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
  },
});
