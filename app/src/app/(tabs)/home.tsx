// SPDX-License-Identifier: GPL-3.0-or-later
import { router } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';

import { IconButton } from '@/components/IconButton';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { PrimitivesPreview } from '@/dev/PrimitivesPreview';
import { spacing } from '@/theme';

export default function Home() {
  return (
    <Screen
      title="Home"
      right={
        <IconButton
          icon={{ ios: 'gearshape', android: 'settings' }}
          label="Settings"
          onPress={() => router.push('/settings')}
        />
      }
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Text secondary>Nothing here yet.</Text>
        {__DEV__ && <PrimitivesPreview />}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
});
