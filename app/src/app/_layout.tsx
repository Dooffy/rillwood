// SPDX-License-Identifier: GPL-3.0-or-later
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { ToastProvider } from '@/components/Toast';
import { applyNativeAppearance, useAppearance } from '@/settings';
import { ColorsContext, palettes, resolveScheme } from '@/theme';

const detailOptions = { headerShown: true, headerTransparent: true, title: '' };

export default function RootLayout() {
  const scheme = resolveScheme(useAppearance(), useColorScheme());
  const c = palettes[scheme];

  useEffect(() => {
    applyNativeAppearance();
  }, []);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(c.background).catch(() => {});
  }, [c.background]);

  return (
    <ColorsContext.Provider value={c}>
      <ToastProvider>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: c.background },
            headerTintColor: c.text,
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="item/[id]" options={detailOptions} />
          <Stack.Screen name="series/[id]" options={detailOptions} />
          <Stack.Screen name="settings" options={{ headerShown: true, headerLargeTitle: true, title: 'Settings' }} />
          <Stack.Screen
            name="player"
            options={{
              presentation: 'fullScreenModal',
              animation: 'fade',
              contentStyle: { backgroundColor: palettes.dark.background },
            }}
          />
        </Stack>
      </ToastProvider>
    </ColorsContext.Provider>
  );
}
