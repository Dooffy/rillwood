// SPDX-License-Identifier: GPL-3.0-or-later
// Android 13+: ask for the notification permission when the first download starts, so the download notification
// shows (docs/context/downloads.md). Asked once per install - after that the user changes it in system settings.
// Downloads run whatever the answer.
import { Storage } from 'expo-sqlite/kv-store';
import { PermissionsAndroid, Platform } from 'react-native';

const ASKED_KEY = 'notificationsAsked';

// One prompt at a time: downloads started while it's open don't ask again.
let asking = false;

export async function askNotificationsOnce(): Promise<void> {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 33) return;
  if (asking || Storage.getItemSync(ASKED_KEY)) return;
  const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
  asking = true;
  try {
    if (await PermissionsAndroid.check(permission)) return;
    await PermissionsAndroid.request(permission);
    Storage.setItemSync(ASKED_KEY, '1');
  } catch {
    // No activity (app in the background): asked again with the next download.
  } finally {
    asking = false;
  }
}
