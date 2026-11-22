// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV Back: the latest holder takes the press; a pushed screen's catcher only for its own holders and menus. Row
// targets: where a swipe into a row with its own memory lands.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { BackHandler, Platform } from 'react-native';

import { holdBack, rowTargets, useTvBack } from './focus';

// The screen a hook runs in: its navigation object.
let mockScreen: object = {};
jest.mock('expo-router', () => ({ useNavigation: () => mockScreen }));

const isTV = Object.getOwnPropertyDescriptor(Platform, 'isTV')!;
let handlers: (() => boolean)[] = [];
beforeEach(() => {
  handlers = [];
  Object.defineProperty(Platform, 'isTV', { get: () => true, configurable: true });
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_, h) => {
    handlers.push(h as () => boolean);
    return { remove: () => handlers.splice(handlers.indexOf(h as () => boolean), 1) };
  });
});
afterEach(() => {
  jest.restoreAllMocks();
  Object.defineProperty(Platform, 'isTV', isTV);
});

describe('holdBack', () => {
  it('Back runs the latest holder only; released, the one under it again', () => {
    const page = jest.fn();
    const menu = jest.fn();
    const releasePage = holdBack(page);
    const releaseMenu = holdBack(menu);
    expect(handlers.at(-1)!()).toBe(true);
    expect(menu).toHaveBeenCalledTimes(1);
    expect(page).not.toHaveBeenCalled();
    releaseMenu();
    handlers.at(-1)!();
    expect(page).toHaveBeenCalledTimes(1);
    releasePage();
    expect(handlers).toHaveLength(0);
  });
});

describe('useTvBack (a pushed screen)', () => {
  it("on for its own holders and menus, not a screen's under it; the press runs the latest", async () => {
    const detail = {};
    const player = {};
    const scrollUp = jest.fn();
    // The detail page under the player, scrolled down.
    const releaseDetail = holdBack(scrollUp, detail);
    mockScreen = player;
    const { result } = await renderHook(() => useTvBack());
    expect(result.current.enabled).toBe(false);

    // The player's controls take Back: on; the press hides them, the page under it stays as it is.
    const hide = jest.fn();
    let releaseControls = () => {};
    await act(() => {
      releaseControls = holdBack(hide, player);
    });
    expect(result.current.enabled).toBe(true);
    result.current.onBack();
    expect(hide).toHaveBeenCalledTimes(1);
    expect(scrollUp).not.toHaveBeenCalled();
    // The same press reaching the app's root handler too runs nothing more.
    handlers.at(-1)!();
    expect(hide).toHaveBeenCalledTimes(1);

    // A menu over it (no screen) counts too.
    const closeMenu = jest.fn();
    let releaseMenu = () => {};
    await act(() => {
      releaseControls();
      releaseMenu = holdBack(closeMenu);
    });
    expect(result.current.enabled).toBe(true);
    result.current.onBack();
    expect(closeMenu).toHaveBeenCalledTimes(1);

    await act(() => releaseMenu());
    expect(result.current.enabled).toBe(false);
    releaseDetail();
  });

  it('off TV: never on', async () => {
    Object.defineProperty(Platform, 'isTV', { get: () => false, configurable: true });
    mockScreen = {};
    const release = holdBack(() => {}, mockScreen);
    const { result } = await renderHook(() => useTvBack());
    expect(result.current.enabled).toBe(false);
    release();
  });
});

describe('rowTargets', () => {
  const card = {};
  const first = {};
  it('the last-focused item, then start; each once, none missing', () => {
    expect(rowTargets(null, null)).toEqual([]);
    expect(rowTargets(null, first)).toEqual([first]);
    expect(rowTargets(card, first)).toEqual([card, first]);
    expect(rowTargets(first, first)).toEqual([first]);
    expect(rowTargets(card, null)).toEqual([card]);
  });
});
