// SPDX-License-Identifier: GPL-3.0-or-later
import { StyleSheet, Text, View } from 'react-native';

import { colors, type } from '@/theme';

export default function Index() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Rillwood</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { ...type.largeTitle, color: colors.text },
});
