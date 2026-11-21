// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import * as api from '@/api';
import Kids from '@/app/kids';
import { SOLVED_MS } from '@/components/kids/KidsGate';
import { forgetKids, getKids, setKids } from '@/kidsSettings';
import * as session from '@/session';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), canDismiss: jest.fn(() => false), dismissAll: jest.fn() },
}));
const { router } = jest.requireMock<{ router: { push: jest.Mock; replace: jest.Mock } }>('expo-router');

const server = { id: 'srv', url: 'https://jf.example.com', name: 'Home server', version: '12.1.0' };
let active: session.Account;
let seq = 0;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  active = { id: `srv.g${++seq}`, server, userId: `g${seq}`, userName: 'mia', deviceId: 'dev' };
  jest.spyOn(session, 'useSession').mockImplementation(() => ({ accounts: [active], active }));
  jest.spyOn(session, 'getSession').mockImplementation(() => ({ accounts: [active], active }));
  jest.spyOn(session, 'connectionFor').mockImplementation((a) => ({
    baseUrl: a.server.url,
    deviceId: a.deviceId,
    token: 'tok-secret',
    accountId: a.id,
  }));
  jest.spyOn(api, 'request').mockResolvedValue({ Items: [], TotalRecordCount: 0 } as never);
  setKids(active.id, { account: true });
});

afterEach(() => {
  forgetKids(active.id);
  jest.useRealTimers();
});

const openGate = () => fireEvent.press(screen.getByRole('button', { name: 'Grown-ups' }));

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

/** The question on screen, and its answer worked out from the words. */
function question() {
  const text = String(screen.getByTestId('kids-sum').props.children);
  const [, a, b] = /^What is (\w+) times (\w+)\?$/.exec(text) ?? [];
  return { text, answer: String(WORDS.indexOf(a) * WORDS.indexOf(b)) };
}

async function type(...keys: string[]) {
  for (const key of keys) await fireEvent.press(screen.getByRole('button', { name: key }));
}

/** The right answer: a checkmark first, then the actions. */
async function solve() {
  await type(...question().answer);
  await act(() => jest.advanceTimersByTime(SOLVED_MS));
}

describe('grown-up gate - the gear', () => {
  it('a tap opens the question at once', async () => {
    await render(<Kids />);
    expect(screen.queryByTestId('kids-sum')).toBeNull();
    await openGate();
    expect(question().text).toMatch(/^What is (six|seven|eight|nine) times (six|seven|eight|nine)\?$/);
  });
});

describe('grown-up gate - the sum', () => {
  it('a wrong answer asks a new question; Delete takes a digit back', async () => {
    await render(<Kids />);
    await openGate();
    const first = question();
    // A digit taken back, then a wrong answer (11 is never one: answers are 36-81).
    await type(first.answer[0], 'Delete', '1', '1');
    expect(question().text).not.toBe(first.text);
    expect(screen.queryByRole('menuitem')).toBeNull();
    // The first digit is kept until the second: typing the answer after Delete works.
    const second = question();
    await type(second.answer[0], 'Delete', ...second.answer);
    await act(() => jest.advanceTimersByTime(SOLVED_MS));
    expect(screen.getAllByRole('menuitem')).toHaveLength(3);
  });

  it('the right answer shows a checkmark, then the actions - a kids account: Settings, Switch Account', async () => {
    await render(<Kids />);
    await openGate();
    await type(...question().answer);
    // The checkmark first: the keypad takes no more presses, no actions yet.
    expect(screen.getByTestId('kids-gate-right')).toBeOnTheScreen();
    expect(screen.queryByRole('menuitem')).toBeNull();
    await type('1');
    await act(() => jest.advanceTimersByTime(SOLVED_MS));
    expect(screen.queryByTestId('kids-sum')).toBeNull();
    expect(screen.getAllByRole('menuitem').map((m) => m.props.accessibilityLabel)).toEqual([
      'Downloads',
      'Settings',
      'Switch Account',
    ]);
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Switch Account' }));
    expect(router.push).toHaveBeenCalledWith('/accounts');
  });

  it('opens kids Downloads from behind the gate', async () => {
    await render(<Kids />);
    await openGate();
    await solve();
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Downloads' }));
    expect(router.push).toHaveBeenCalledWith('/kids-downloads');
  });

  it('opens Settings from behind the gate', async () => {
    await render(<Kids />);
    await openGate();
    await solve();
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Settings' }));
    expect(router.push).toHaveBeenCalledWith('/settings');
  });

  it('a shared phone leaves kids mode for the normal app', async () => {
    setKids(active.id, { account: false, shared: true });
    await render(<Kids />);
    await openGate();
    await solve();
    expect(screen.getAllByRole('menuitem').map((m) => m.props.accessibilityLabel)).toEqual([
      'Downloads',
      'Settings',
      'Leave Kids Mode',
    ]);
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Leave Kids Mode' }));
    expect(getKids(active.id).shared).toBe(false);
    expect(router.replace).toHaveBeenCalledWith('/home');
  });

  it('Cancel closes it; opening again asks again from the start', async () => {
    await render(<Kids />);
    await openGate();
    await solve();
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('menuitem')).toBeNull();
    await openGate();
    expect(screen.getByTestId('kids-sum')).toBeOnTheScreen();
    expect(screen.queryByRole('menuitem')).toBeNull();
  });
});
