// SPDX-License-Identifier: GPL-3.0-or-later
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ColorsContext, palettes, spacing } from '@/theme';

// Player UI + mpv adapter land in M4 (docs/context/player.md). Always dark, whatever the Appearance setting.
export default function Player() {
  return (
    <ColorsContext.Provider value={palettes.dark}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.container}>
        <View style={styles.close}>
          <Button title="Close" variant="secondary" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    </ColorsContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  close: { padding: spacing.md, alignItems: 'flex-start' },
});
