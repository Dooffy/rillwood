// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Storage } from 'expo-sqlite/kv-store';
import { PermissionsAndroid, Platform } from 'react-native';

import { askNotificationsOnce } from './notificationPermission';

const check = jest.spyOn(PermissionsAndroid, 'check');
const request = jest.spyOn(PermissionsAndroid, 'request');

function platform(os: 'android' | 'ios', version: number) {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
  Object.defineProperty(Platform, 'Version', { value: version, configurable: true });
}

beforeEach(() => {
  Storage.clearSync();
  check.mockReset().mockResolvedValue(false);
  request.mockReset().mockResolvedValue('granted');
  platform('android', 34);
});

describe('askNotificationsOnce', () => {
  it('asks on Android 13+ when not granted, only once', async () => {
    await askNotificationsOnce();
    expect(request).toHaveBeenCalledWith(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    request.mockResolvedValue('denied');
    await askNotificationsOnce();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("doesn't ask when already granted (and asks later if it's taken away)", async () => {
    check.mockResolvedValue(true);
    await askNotificationsOnce();
    expect(request).not.toHaveBeenCalled();
    check.mockResolvedValue(false);
    await askNotificationsOnce();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('never asks below Android 13 or on iOS', async () => {
    platform('android', 32);
    await askNotificationsOnce();
    platform('ios', 26);
    await askNotificationsOnce();
    expect(check).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it('downloads started while the prompt is open ask only once', async () => {
    await Promise.all([askNotificationsOnce(), askNotificationsOnce()]);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('a failed prompt (no activity) still resolves and asks again next time', async () => {
    request.mockRejectedValueOnce(new Error('no activity'));
    await expect(askNotificationsOnce()).resolves.toBeUndefined();
    await askNotificationsOnce();
    expect(request).toHaveBeenCalledTimes(2);
  });
});
