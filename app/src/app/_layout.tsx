// SPDX-License-Identifier: GPL-3.0-or-later
import { Stack } from 'expo-router';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useLayoutEffect } from 'react';
import { Platform, useColorScheme } from 'react-native';

import { ItemMenuProvider } from '@/components/ItemMenu';
import { TvMenuHost } from '@/components/TvMenu';
import { SETTINGS_TITLES } from '@/components/SettingsLink';
import { OffloadToast } from '@/components/OffloadToast';
import { ToastProvider } from '@/components/Toast';
import { initConnection } from '@/connection';
import { initDownloads } from '@/downloads';
import { page, plainPage, readablePage, SignedOutRedirect, tabsTitle } from '@/navigation';
import { licenceById } from '@/licences';
import { initOffload } from '@/offload';
import { lockAppOrientation } from '@/orientation';
import { pickerTitle } from '@/pickers';
import { applyNativeAppearance, useAppearance } from '@/settings';
import { initSync } from '@/sync';
import { ColorsContext, palettes, resolveScheme, useWide } from '@/theme';

// Posters and backdrops on disk: Android's cache (Glide) keeps the most recent 250 MB on its own; iOS (SDWebImage) has
// no size limit by default, so cap it (iOS-only API). No Clear cache button - the OS may purge both when space runs
// low (CLAUDE.md §2).
const IMAGE_CACHE_BYTES = 500 * 1024 * 1024;
if (Platform.OS === 'ios') Image.configureCache({ maxDiskSize: IMAGE_CACHE_BYTES });

const detailOptions = { headerShown: true, headerTransparent: true, title: '' };

export default function RootLayout() {
  const scheme = resolveScheme(useAppearance(), useColorScheme());
  const c = palettes[scheme];
  // `Page` screens: large title on phones, a centred title over the centred column on wide screens.
  const wide = useWide();
  const pageOf = (title: string) => readablePage(title, wide, c);

  useEffect(() => {
    applyNativeAppearance();
  }, []);

  // Downloads: native events, credentials, reconcile at launch + back from the background (docs/context/downloads.md).
  useEffect(() => {
    initDownloads();
  }, []);

  // Offline mode: is the server there (launch, foreground, account switch, rechecks while offline) - src/connection.ts.
  useEffect(() => {
    initConnection();
  }, []);

  // Offline progress: replay + saved UserData at launch, foreground, reconnect, account switch - src/sync.ts.
  // Auto-remove: after every sync run (launch, foreground, reconnect) - src/offload.ts. Before initSync: its launch
  // run ends with a cleanup.
  useEffect(() => {
    initOffload();
    initSync();
  }, []);

  // Phones: upright portrait everywhere, only the player unlocks rotation while it's open. Tablets rotate everywhere.
  // app.json allows all orientations (so the player can rotate); the config plugin locks iOS phones before JS runs
  // (iPads ignore the lock - multitasking apps rotate freely), this covers Android. A layout effect runs before every
  // passive one, so a player opened at launch (deep link) still unlocks after this.
  useLayoutEffect(() => {
    lockAppOrientation();
  }, []);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(c.background).catch(() => {});
  }, [c.background]);

  return (
    <ColorsContext.Provider value={c}>
      <ToastProvider>
        {/* Apple TV menus draw over the whole app (an RN Modal doesn't get the remote's presses). */}
        <TvMenuHost>
          <ItemMenuProvider>
            <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
            <SignedOutRedirect />
            <OffloadToast />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: c.background },
                headerTintColor: c.text,
              }}
            >
              <Stack.Screen name="(tabs)" options={({ route }) => ({ title: tabsTitle(route) })} />
              {/* (auth) has no layout of its own, so its screens join this stack. */}
              {/* Header hidden, but the title labels the back button on Add server (else iOS shows the route path). */}
              <Stack.Screen name="(auth)/welcome" options={{ title: 'Welcome' }} />
              <Stack.Screen name="(auth)/server" options={pageOf('Add server')} />
              {/* TV Sign in draws its own title (screen draft 02). */}
              <Stack.Screen
                name="(auth)/login"
                options={Platform.isTV ? { title: 'Sign in', headerShown: false } : pageOf('Sign in')}
              />
              <Stack.Screen name="(auth)/quick-connect" options={pageOf('Quick Connect')} />
              <Stack.Screen name="(auth)/accounts" options={pageOf('Accounts')} />
              <Stack.Screen name="(auth)/account" options={pageOf('Account')} />
              <Stack.Screen name="item/[id]" options={detailOptions} />
              <Stack.Screen name="series/[id]" options={detailOptions} />
              <Stack.Screen name="settings" options={pageOf('Settings')} />
              <Stack.Screen name="subtitles" options={pageOf(SETTINGS_TITLES.subtitles)} />
              {/* A show's downloaded episodes (Downloads tab): the show's name comes with the link. */}
              <Stack.Screen
                name="show-downloads/[id]"
                options={({ route }) => page((route.params as { name?: string } | undefined)?.name ?? 'Downloads')}
              />
              <Stack.Screen name="download-storage" options={pageOf(SETTINGS_TITLES.storage)} />
              {/* An option's checkmark list: a plain title, as iOS Settings subscreens. */}
              <Stack.Screen name="option/[key]" options={({ route }) => plainPage(pickerTitle(route.params), c)} />
              <Stack.Screen name="about" options={pageOf(SETTINGS_TITLES.about)} />
              <Stack.Screen name="licences" options={pageOf(SETTINGS_TITLES.licences)} />
              {/* One licence: a plain title, package names can be long. */}
              <Stack.Screen
                name="licence/[id]"
                options={({ route }) =>
                  plainPage(licenceById((route.params as { id?: string } | undefined)?.id)?.name ?? '', c)
                }
              />
              <Stack.Screen
                name="player"
                options={
                  Platform.isTV
                    ? // TV: a pushed screen - remote presses don't reach a native modal (Menu closes it as Back).
                      { animation: 'fade', contentStyle: { backgroundColor: 'black' } }
                    : {
                        // See-through, so pulling the player down shows the screen below (the player draws its own black).
                        presentation: 'transparentModal',
                        animation: 'fade',
                        contentStyle: { backgroundColor: 'transparent' },
                      }
                }
              />
            </Stack>
          </ItemMenuProvider>
        </TvMenuHost>
      </ToastProvider>
    </ColorsContext.Provider>
  );
}
