// SPDX-License-Identifier: GPL-3.0-or-later
import { Stack } from 'expo-router';

import { useColors } from '@/theme';

export default function AuthLayout() {
  const c = useColors();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.background } }} />;
}
