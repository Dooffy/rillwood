// SPDX-License-Identifier: GPL-3.0-or-later
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useLayoutEffect } from 'react';
import { useColorScheme } from 'react-native';

import { ItemMenuProvider } from '@/components/ItemMenu';
import { ToastProvider } from '@/components/Toast';
import { initDownloads } from '@/downloads';
import { SignedOutRedirect, tabsTitle } from '@/navigation';
import { pickerTitle } from '@/pickers';
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
  subtitles: page('Subtitles'),
};

export default function RootLayout() {
  const scheme = resolveScheme(useAppearance(), useColorScheme());
  const c = palettes[scheme];

  useEffect(() => {
    applyNativeAppearance();
  }, []);

  // Downloads: native events, credentials, reconcile at launch + back from the background (docs/context/downloads.md).
  useEffect(() => {
    initDownloads();
  }, []);

  // Upright portrait everywhere; only the player unlocks rotation while it's open. app.json allows all orientations
  // (so the player can rotate); the config plugin locks iOS before JS runs, this covers Android. A layout effect runs
  // before every passive one, so a player opened at launch (deep link) still unlocks after this.
  useLayoutEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
  }, []);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(c.background).catch(() => {});
  }, [c.background]);

  return (
    <ColorsContext.Provider value={c}>
      <ToastProvider>
        <ItemMenuProvider>
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          <SignedOutRedirect />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: c.background },
              headerTintColor: c.text,
            }}
          >
            <Stack.Screen name="(tabs)" options={({ route }) => ({ title: tabsTitle(route) })} />
            {/* Header hidden, but the title labels the back button on Add server (else iOS shows the route path). */}
            <Stack.Screen name="(auth)/welcome" options={{ title: 'Welcome' }} />
            <Stack.Screen name="(auth)/server" options={pages.server} />
            <Stack.Screen name="(auth)/login" options={pages.login} />
            <Stack.Screen name="(auth)/quick-connect" options={pages.quickConnect} />
            <Stack.Screen name="(auth)/accounts" options={pages.accounts} />
            <Stack.Screen name="(auth)/account" options={pages.account} />
            <Stack.Screen name="item/[id]" options={detailOptions} />
            <Stack.Screen name="series/[id]" options={detailOptions} />
            <Stack.Screen name="settings" options={pages.settings} />
            <Stack.Screen name="subtitles" options={pages.subtitles} />
            {/* An option's checkmark list: a plain title, as iOS Settings subscreens. */}
            <Stack.Screen
              name="option/[key]"
              options={({ route }) => ({
                headerShown: true,
                title: pickerTitle(route.params),
                // A plain title bar takes the system's own background otherwise (white in the dark palette); large titles
                // are see-through over the page, so only this screen sets it.
                headerStyle: { backgroundColor: c.background },
                headerTitleStyle: { color: c.text },
                headerShadowVisible: false,
              })}
            />
            <Stack.Screen
              name="player"
              options={{
                // See-through, so pulling the player down shows the screen below (the player draws its own black).
                presentation: 'transparentModal',
                animation: 'fade',
                contentStyle: { backgroundColor: 'transparent' },
              }}
            />
          </Stack>
        </ItemMenuProvider>
      </ToastProvider>
    </ColorsContext.Provider>
  );
}
