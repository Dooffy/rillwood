// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { Storage } from 'expo-sqlite/kv-store';
import { Appearance as RNAppearance } from 'react-native';

import {
  setAppearance,
  setSubtitleScale,
  setSubtitleStyle,
  setVideoZoom,
  useAppearance,
  useSubtitleScale,
  useSubtitleStyle,
  useVideoZoom,
} from './settings';

type Settings = typeof import('./settings');

// Fresh module for read tests: the setting is cached in memory after the first read.
function load(): Settings {
  let mod: Settings | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- isolateModules needs a sync require
    mod = require('./settings');
  });
  return mod!;
}

describe('appearance setting', () => {
  let setColorScheme: jest.SpiedFunction<typeof RNAppearance.setColorScheme>;

  beforeEach(() => {
    Storage.clearSync();
    setColorScheme = jest.spyOn(RNAppearance, 'setColorScheme').mockImplementation(() => {});
  });

  it('defaults to system', () => {
    expect(load().getAppearance()).toBe('system');
  });

  it('reads the stored value', () => {
    Storage.setItemSync('settings.appearance', 'dark');
    expect(load().getAppearance()).toBe('dark');
  });

  it('falls back to system for unknown stored values', () => {
    Storage.setItemSync('settings.appearance', 'sepia');
    expect(load().getAppearance()).toBe('system');
  });

  it('persists and applies the native override', () => {
    const { getAppearance, setAppearance } = load();
    setAppearance('light');
    expect(getAppearance()).toBe('light');
    expect(Storage.getItemSync('settings.appearance')).toBe('light');
    expect(setColorScheme).toHaveBeenLastCalledWith('light');
  });

  it('maps system to auto (follow the OS)', () => {
    load().setAppearance('system');
    expect(setColorScheme).toHaveBeenLastCalledWith('auto');
  });

  it('applies the stored value natively', () => {
    Storage.setItemSync('settings.appearance', 'dark');
    load().applyNativeAppearance();
    expect(setColorScheme).toHaveBeenLastCalledWith('dark');
  });

  // Shared module instance here: an isolated copy would bring its own React.
  it('re-renders useAppearance subscribers on change', async () => {
    setAppearance('system');
    const { result } = await renderHook(() => useAppearance());
    expect(result.current).toBe('system');
    await act(() => setAppearance('dark'));
    expect(result.current).toBe('dark');
  });
});

describe('subtitle size setting', () => {
  beforeEach(() => {
    Storage.clearSync();
  });

  it('defaults to medium (1)', () => {
    expect(load().getSubtitleScale()).toBe(1);
  });

  it('reads the stored value', () => {
    Storage.setItemSync('settings.subtitleScale', '1.25');
    expect(load().getSubtitleScale()).toBe(1.25);
  });

  it('falls back to medium for unknown stored values', () => {
    Storage.setItemSync('settings.subtitleScale', '3');
    expect(load().getSubtitleScale()).toBe(1);
    Storage.setItemSync('settings.subtitleScale', 'large');
    expect(load().getSubtitleScale()).toBe(1);
  });

  it('persists', () => {
    const { getSubtitleScale, setSubtitleScale } = load();
    setSubtitleScale(0.8);
    expect(getSubtitleScale()).toBe(0.8);
    expect(Storage.getItemSync('settings.subtitleScale')).toBe('0.8');
    expect(load().getSubtitleScale()).toBe(0.8);
  });

  it('re-renders useSubtitleScale subscribers on change', async () => {
    setSubtitleScale(1);
    const { result } = await renderHook(() => useSubtitleScale());
    expect(result.current).toBe(1);
    await act(() => setSubtitleScale(1.5));
    expect(result.current).toBe(1.5);
  });
});

describe('video zoom setting', () => {
  beforeEach(() => {
    Storage.clearSync();
  });

  it('defaults to fit, also for unknown stored values', () => {
    expect(load().getVideoZoom()).toBe('fit');
    Storage.setItemSync('settings.videoZoom', 'zoom');
    expect(load().getVideoZoom()).toBe('fit');
  });

  it('persists', () => {
    const { getVideoZoom, setVideoZoom: set } = load();
    set('fill');
    expect(getVideoZoom()).toBe('fill');
    expect(Storage.getItemSync('settings.videoZoom')).toBe('fill');
    expect(load().getVideoZoom()).toBe('fill');
  });

  it('re-renders useVideoZoom subscribers on change', async () => {
    setVideoZoom('fit');
    const { result } = await renderHook(() => useVideoZoom());
    expect(result.current).toBe('fit');
    await act(() => setVideoZoom('fill'));
    expect(result.current).toBe('fill');
  });
});

describe('subtitle style setting', () => {
  beforeEach(() => {
    Storage.clearSync();
  });

  it('defaults to white sans with an outline', () => {
    expect(load().getSubtitleStyle()).toEqual({ font: 'sans-serif', color: '#FFFFFF', edge: 'outline' });
  });

  it('keeps the known parts of a stored value, defaults the rest', () => {
    Storage.setItemSync('settings.subtitleStyle', JSON.stringify({ font: 'serif', color: '#123456', edge: 'box' }));
    expect(load().getSubtitleStyle()).toEqual({ font: 'serif', color: '#FFFFFF', edge: 'box' });
  });

  it('falls back to the default for a broken stored value', () => {
    Storage.setItemSync('settings.subtitleStyle', '{oops');
    expect(load().getSubtitleStyle()).toEqual({ font: 'sans-serif', color: '#FFFFFF', edge: 'outline' });
    Storage.setItemSync('settings.subtitleStyle', 'null');
    expect(load().getSubtitleStyle()).toEqual({ font: 'sans-serif', color: '#FFFFFF', edge: 'outline' });
  });

  it('persists a change, keeping the other parts', () => {
    const { getSubtitleStyle, setSubtitleStyle: set } = load();
    set({ color: '#FFEB3B' });
    set({ edge: 'shadow' });
    expect(getSubtitleStyle()).toEqual({ font: 'sans-serif', color: '#FFEB3B', edge: 'shadow' });
    expect(load().getSubtitleStyle()).toEqual({ font: 'sans-serif', color: '#FFEB3B', edge: 'shadow' });
  });

  it('ignores undefined parts', () => {
    const { getSubtitleStyle, setSubtitleStyle: set } = load();
    set({ font: undefined, color: '#FFEB3B' });
    expect(getSubtitleStyle()).toEqual({ font: 'sans-serif', color: '#FFEB3B', edge: 'outline' });
  });

  it('re-renders useSubtitleStyle subscribers on change', async () => {
    setSubtitleStyle({ font: 'sans-serif' });
    const { result } = await renderHook(() => useSubtitleStyle());
    expect(result.current.font).toBe('sans-serif');
    await act(() => setSubtitleStyle({ font: 'monospace' }));
    expect(result.current.font).toBe('monospace');
  });
});

describe('subtitle preview language', () => {
  it('starts in English and is never saved', () => {
    const { getSubtitleSample, setSubtitleSample } = load();
    expect(getSubtitleSample()).toBe('en');
    setSubtitleSample('ko');
    expect(getSubtitleSample()).toBe('ko');
    expect(load().getSubtitleSample()).toBe('en');
  });
});

describe('download network setting', () => {
  beforeEach(() => {
    Storage.clearSync();
  });

  it('defaults to Wi-Fi only, also for an unknown stored value', () => {
    expect(load().getDownloadNetwork()).toBe('wifi');
    Storage.setItemSync('settings.downloadNetwork', 'satellite');
    expect(load().getDownloadNetwork()).toBe('wifi');
  });

  it('persists a change', () => {
    load().setDownloadNetwork('any');
    expect(load().getDownloadNetwork()).toBe('any');
  });
});

describe('auto-remove settings', () => {
  beforeEach(() => {
    Storage.clearSync();
  });

  it('defaults to 90 days and Remove watched off, also for unknown stored values', () => {
    expect(load().getOffloadDays()).toBe(90);
    expect(load().getOffloadWatched()).toBe(0);
    Storage.setItemSync('settings.offloadDays', '7');
    Storage.setItemSync('settings.offloadWatched', 'soon');
    expect(load().getOffloadDays()).toBe(90);
    expect(load().getOffloadWatched()).toBe(0);
  });

  it('persists a change; Never (0) is a value of its own', () => {
    load().setOffloadDays(0);
    load().setOffloadWatched(24);
    expect(load().getOffloadDays()).toBe(0);
    expect(load().getOffloadWatched()).toBe(24);
  });
});

describe('download storage limit', () => {
  beforeEach(() => {
    Storage.clearSync();
  });

  it('defaults to no limit, also for a broken stored value', () => {
    expect(load().getDownloadLimit()).toBe(0);
    for (const bad of ['-5', 'abc', 'Infinity']) {
      Storage.setItemSync('settings.downloadLimit', bad);
      expect(load().getDownloadLimit()).toBe(0);
    }
  });

  it('persists a change; a bad value saves as no limit', () => {
    const { getDownloadLimit, setDownloadLimit } = load();
    setDownloadLimit(50);
    expect(load().getDownloadLimit()).toBe(50);
    setDownloadLimit(Number.NaN);
    expect(getDownloadLimit()).toBe(0);
  });

  it('slider stops fit under 90% of the disk, with no limit last', () => {
    const { downloadLimitSteps } = load();
    expect(downloadLimitSteps(64e9)).toEqual([5, 10, 15, 20, 25, 30, 40, 50, 0]);
    expect(downloadLimitSteps(256e9).at(-2)).toBe(200);
    // A disk too small for any stop still gets the first.
    expect(downloadLimitSteps(4e9)).toEqual([5, 0]);
  });

  it('finds the stop for a limit: its own, the nearest, or the last for no limit', () => {
    const { downloadLimitStep } = load();
    const steps = [5, 10, 20, 50, 0];
    expect(downloadLimitStep(steps, 20)).toBe(2);
    expect(downloadLimitStep(steps, 1000)).toBe(3);
    expect(downloadLimitStep(steps, 12)).toBe(1);
    expect(downloadLimitStep(steps, 0)).toBe(4);
  });

  it('formats a limit', () => {
    const { formatDownloadLimit } = load();
    expect(formatDownloadLimit(0)).toBe('No limit');
    expect(formatDownloadLimit(50)).toBe('50 GB');
    expect(formatDownloadLimit(1500)).toBe('1.5 TB');
  });
});
