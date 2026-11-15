// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV Settings (screen draft 13): the list on the right, the focused row's picture + text on the left; pages open
// in the same layout, Back steps out of them; On / Off toggles in place; About shows QR codes, no browser links.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { BackHandler, Platform } from 'react-native';

import type { AuthenticationResult } from '@/api';
import Settings from '@/app/settings';
import { addAccount, getSession, removeAccount, type Server } from '@/session';
import {
  getAudioLanguage,
  getAutoplayNext,
  getSubtitleScale,
  setAudioLanguage,
  setAutoplayNext,
  setSubtitleScale,
} from '@/settings';

// Jest's expo-constants has no `extra` or version: hand it the real ones from app.json.
jest.mock('expo-constants', () => {
  const { expo } = jest.requireActual<typeof import('../../app.json')>('../../app.json');
  return { expoConfig: { extra: expo.extra, version: expo.version } };
});
jest.mock('expo-router', () => ({ router: { push: jest.fn(), dismissTo: jest.fn() } }));
const { router } = jest.requireMock<{ router: { push: jest.Mock; dismissTo: jest.Mock } }>('expo-router');

const home: Server = { id: 'srv', url: 'https://jf.example.com', name: 'Home server', version: '12.1.0' };
const auth: AuthenticationResult = { User: { Id: 'u1', Name: 'Alex' }, AccessToken: 'tok', ServerId: 'srv' };

const isTV = Object.getOwnPropertyDescriptor(Platform, 'isTV')!;
let back: (() => boolean)[] = [];
beforeEach(async () => {
  jest.clearAllMocks();
  Object.defineProperty(Platform, 'isTV', { get: () => true, configurable: true });
  back = [];
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_, handler) => {
    back.push(handler as () => boolean);
    return { remove: () => {} };
  });
  setAutoplayNext('on');
  setAudioLanguage('server');
  setSubtitleScale(1);
  await addAccount(home, auth, 'd1');
});
afterEach(async () => {
  Object.defineProperty(Platform, 'isTV', isTV);
  jest.restoreAllMocks();
  for (const a of getSession().accounts) await act(() => removeAccount(a.id));
});

/** The remote's Back (Menu / Esc). */
const pressBack = () =>
  act(() => {
    back.at(-1)?.();
  });

const heading = () => screen.getAllByRole('header')[0];

describe('Settings on Apple TV', () => {
  it('the list: account, Subtitles, Playback, About - no Appearance, no Downloads', async () => {
    await render(<Settings />);
    expect(heading()).toHaveTextContent('Settings');
    expect(screen.getByRole('button', { name: 'Alex · Home server' }).props.hasTVPreferredFocus).toBe(true);
    expect(screen.getByRole('button', { name: 'Subtitles, Medium, White' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Autoplay next episode, On' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /^Audio language/ })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /^Show subtitles/ })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /^About Rillwood/ })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Appearance/ })).toBeNull();
    expect(screen.queryByText('Downloads')).toBeNull();
    // The left side: the focused row's picture and text (the account first).
    expect(within(screen.getByTestId('tv-settings-aside')).getByText(/Who's Watching/)).toBeOnTheScreen();
  });

  it('the left side follows focus: the subtitle preview for Subtitles, the footer for an option', async () => {
    await render(<Settings />);
    await fireEvent(screen.getByRole('button', { name: /^Subtitles/ }), 'focus');
    expect(within(screen.getByTestId('tv-settings-aside')).getByTestId('subtitle-preview')).toBeOnTheScreen();
    await fireEvent(screen.getByRole('button', { name: /^Audio language/ }), 'focus');
    expect(within(screen.getByTestId('tv-settings-aside')).getByText(/first audio track/)).toBeOnTheScreen();
  });

  it('On / Off toggles in place', async () => {
    await render(<Settings />);
    await fireEvent.press(screen.getByRole('button', { name: 'Autoplay next episode, On' }));
    expect(getAutoplayNext()).toBe('off');
    expect(screen.getByRole('button', { name: 'Autoplay next episode, Off' })).toBeOnTheScreen();
    expect(heading()).toHaveTextContent('Settings');
  });

  it('an option opens its checkmark list; a click saves; Back returns to the row', async () => {
    await render(<Settings />);
    await fireEvent.press(screen.getByRole('button', { name: /^Audio language/ }));
    expect(heading()).toHaveTextContent('Audio language');
    const english = screen.getByRole('radio', { name: 'English' });
    expect(english.props.accessibilityState).toMatchObject({ checked: false });
    await fireEvent.press(english);
    expect(getAudioLanguage()).toBe('eng');
    expect(screen.getByRole('radio', { name: 'English' }).props.accessibilityState).toMatchObject({ checked: true });
    await pressBack();
    expect(heading()).toHaveTextContent('Settings');
    const row = screen.getByRole('button', { name: 'Audio language, English' });
    expect(row.props.hasTVPreferredFocus).toBe(true);
    expect(screen.getByRole('button', { name: 'Alex · Home server' }).props.hasTVPreferredFocus).toBe(false);
  });

  it('Subtitles: its rows open their lists with the preview beside them', async () => {
    await render(<Settings />);
    await fireEvent.press(screen.getByRole('button', { name: /^Subtitles/ }));
    expect(heading()).toHaveTextContent('Subtitles');
    expect(screen.getByTestId('subtitle-preview')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Size, Medium' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Large' }));
    expect(getSubtitleScale()).toBe(1.25);
    expect(screen.getByTestId('subtitle-preview')).toBeOnTheScreen();
    await pressBack();
    expect(screen.getByRole('button', { name: 'Size, Large' }).props.hasTVPreferredFocus).toBe(true);
    await pressBack();
    expect(heading()).toHaveTextContent('Settings');
    expect(screen.getByRole('button', { name: 'Subtitles, Large, White' }).props.hasTVPreferredFocus).toBe(true);
  });

  it('Back on the list itself leaves Settings (nothing holds it)', async () => {
    await render(<Settings />);
    expect(back).toHaveLength(0);
  });

  it('About: source code and privacy policy as QR codes with their address, then Licences', async () => {
    await render(<Settings />);
    await fireEvent.press(screen.getByRole('button', { name: /^About Rillwood/ }));
    expect(heading()).toHaveTextContent('About');
    expect(screen.getAllByTestId('tv-qr')).toHaveLength(2);
    expect(screen.getByLabelText('Source code, QR code: github.com/Dooffy/rillwood')).toBeOnTheScreen();
    expect(screen.getByLabelText('Privacy policy, QR code: dooffy.github.io/rillwood/privacy')).toBeOnTheScreen();
    expect(screen.queryByText(/Report a problem/)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Licences' }));
    expect(heading()).toHaveTextContent('Licences');
    await fireEvent.press(screen.getByRole('button', { name: /^Rillwood, GPL-3.0/ }));
    expect(heading()).toHaveTextContent('Rillwood');
    await pressBack();
    await pressBack();
    expect(heading()).toHaveTextContent('About');
  });

  it("the account row goes to Who's Watching", async () => {
    await render(<Settings />);
    await fireEvent.press(screen.getByRole('button', { name: 'Alex · Home server' }));
    expect(router.dismissTo).toHaveBeenCalledWith('/accounts');
  });
});
