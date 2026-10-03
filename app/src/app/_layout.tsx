// SPDX-License-Identifier: GPL-3.0-or-later
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { ToastProvider } from '@/components/Toast';
import { SignedOutRedirect } from '@/navigation';
import { applyNativeAppearance, useAppearance } from '@/settings';
import { ColorsContext, palettes, resolveScheme } from '@/theme';

const detailOptions = { headerShown: true, headerTransparent: true, title: '' };
// Pages with a native large-title header + back button. (auth) has no layout of its own, so its screens join this stack.
const page = (title: string) => ({ headerShown: true, headerLargeTitle: true, title });
const pages = {
  server: page('Add server'),
  login: page('Sign in'),
  quickConnect: page('Quick Connect'),
  accounts: page('Accounts'),
  account: page('Account'),
  settings: page('Settings'),
};

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
        <SignedOutRedirect />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: c.background },
            headerTintColor: c.text,
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(auth)/server" options={pages.server} />
          <Stack.Screen name="(auth)/login" options={pages.login} />
          <Stack.Screen name="(auth)/quick-connect" options={pages.quickConnect} />
          <Stack.Screen name="(auth)/accounts" options={pages.accounts} />
          <Stack.Screen name="(auth)/account" options={pages.account} />
          <Stack.Screen name="item/[id]" options={detailOptions} />
          <Stack.Screen name="series/[id]" options={detailOptions} />
          <Stack.Screen name="settings" options={pages.settings} />
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
