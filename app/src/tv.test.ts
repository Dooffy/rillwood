// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV gating: what tvOS doesn't build (downloads, screen orientation) is never loaded, and no downloads are offered.
import { describe, expect, it, jest } from '@jest/globals';

/* eslint-disable @typescript-eslint/no-require-imports -- isolateModules needs a sync require */

/** Loads `path` in a fresh module registry where `Platform.isTV` is true. */
function onTV<T>(path: string): { mod: T } {
  let mod!: T;
  jest.isolateModules(() => {
    const { Platform } = require('react-native');
    Object.defineProperty(Platform, 'isTV', { get: () => true, configurable: true });
    jest.doMock('expo-screen-orientation', () => {
      throw new Error('expo-screen-orientation loaded on TV');
    });
    mod = require(path);
  });
  return { mod };
}

describe('on Apple TV', () => {
  it('never loads expo-screen-orientation; orientation calls do nothing', () => {
    const { mod } = onTV<typeof import('./orientation')>('./orientation');
    expect(() => {
      mod.lockAppOrientation();
      mod.unlockOrientation();
    }).not.toThrow();
  });

  it('has Home, Library and Search tabs - no Downloads', () => {
    const { mod } = onTV<typeof import('./navigation')>('./navigation');
    expect(mod.TABS.map((t) => t.name)).toEqual(['home', 'library', 'search']);
  });

  it('uses a downloads stand-in with no tasks instead of the native module', async () => {
    const { mod } = onTV<typeof import('../modules/downloads')>('../modules/downloads');
    const Downloads = mod.default;
    expect(() => {
      Downloads.setCredential('a', {});
      Downloads.enqueue([], { cellular: false });
      Downloads.addListener('done', () => {}).remove();
    }).not.toThrow();
    await expect(Downloads.getTasks()).resolves.toEqual([]);
  });
});

describe('off TV', () => {
  it('keeps Home, Library, Downloads (no Search tab)', () => {
    jest.isolateModules(() => {
      const { TABS } = require('./navigation');
      expect(TABS.map((t: { name: string }) => t.name)).toEqual(['home', 'library', 'downloads']);
    });
  });
});
