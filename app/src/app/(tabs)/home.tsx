// SPDX-License-Identifier: GPL-3.0-or-later
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { PrimitivesPreview } from '@/dev/PrimitivesPreview';
import { useSession } from '@/session';
import { minTouch, pressedOpacity, spacing } from '@/theme';

export default function Home() {
  const { active } = useSession();
  return (
    <Screen
      title="Home"
      right={
        // Active user's avatar opens Settings (accounts live there), like the system apps' profile button.
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          onPress={() => router.push('/settings')}
          style={({ pressed }) => [styles.profile, pressed && styles.pressed]}
        >
          <Avatar name={active?.userName} size={36} />
        </Pressable>
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
  profile: { width: minTouch, height: minTouch, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: pressedOpacity },
});
