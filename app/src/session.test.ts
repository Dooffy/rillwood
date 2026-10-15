// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Storage } from 'expo-sqlite/kv-store';

import { logout, request, type AuthenticationResult } from '@/api';

import { addAccount, connectionFor, getSession, removeAccount, signOut, switchAccount, type Server } from './session';

jest.mock('@/api', () => ({
  ...jest.requireActual<typeof import('@/api')>('@/api'),
  logout: jest.fn(() => Promise.resolve()),
}));

const secure = jest.requireMock<{ __store: Map<string, string> }>('expo-secure-store').__store;

const server: Server = { id: 'srv', url: 'https://jf.example.com', name: 'Home', version: '12.1.0' };

function auth(userId: string, token = `tok-${userId}`): AuthenticationResult {
  return { User: { Id: userId, Name: userId.toUpperCase() }, AccessToken: token, ServerId: 'srv' };
}

function saved() {
  return JSON.parse(Storage.getItemSync('session.accounts')!) as { accounts: { id: string }[]; activeId: string };
}

beforeEach(() => {
  getSession().accounts.forEach((a) => removeAccount(a.id));
  Storage.clearSync();
  secure.clear();
  jest.mocked(logout).mockClear();
});

describe('addAccount', () => {
  it('stores the record in kv-store, the token only in secure-store, and activates it', async () => {
    const account = await addAccount(server, auth('u1'), 'dev-1');
    expect(account).toMatchObject({ id: 'srv.u1', userId: 'u1', userName: 'U1', deviceId: 'dev-1' });
    expect(getSession().active?.id).toBe('srv.u1');
    expect(secure.get('tok_srv.u1')).toBe('tok-u1');
    expect(saved()).toMatchObject({ activeId: 'srv.u1', accounts: [{ id: 'srv.u1' }] });
    expect(Storage.getItemSync('session.accounts')).not.toContain('tok-u1');
  });

  it('builds the connection from the stored token', async () => {
    const account = await addAccount(server, auth('u1'), 'dev-1');
    expect(connectionFor(account)).toEqual({
      baseUrl: 'https://jf.example.com',
      deviceId: 'dev-1',
      token: 'tok-u1',
      accountId: 'srv.u1',
    });
  });

  it('replaces a re-added account and revokes its old token', async () => {
    await addAccount(server, auth('u1', 'old'), 'dev-1');
    await addAccount(server, auth('u1', 'new'), 'dev-2');
    const { accounts } = getSession();
    expect(accounts).toHaveLength(1);
    expect(accounts[0].deviceId).toBe('dev-2');
    expect(logout).toHaveBeenCalledWith(expect.objectContaining({ token: 'old', deviceId: 'dev-1' }));
    expect(secure.get('tok_srv.u1')).toBe('new');
  });
});

describe('switch, sign out, remove', () => {
  beforeEach(async () => {
    await addAccount(server, auth('u1'), 'dev-1');
    await addAccount(server, auth('u2'), 'dev-2');
  });

  it('switches the active account', () => {
    switchAccount('srv.u1');
    expect(getSession().active?.id).toBe('srv.u1');
  });

  it('signs out: revokes, forgets the token, keeps the record, activates the next signed-in one', () => {
    expect(signOut('srv.u2')?.id).toBe('srv.u1');
    const { accounts, active } = getSession();
    expect(logout).toHaveBeenCalledWith(expect.objectContaining({ token: 'tok-u2' }));
    expect(secure.has('tok_srv.u2')).toBe(false);
    expect(accounts.find((a) => a.id === 'srv.u2')?.signedOut).toBe(true);
    expect(active?.id).toBe('srv.u1');
  });

  it('signs out the last signed-in account: no active account', () => {
    signOut('srv.u1');
    expect(signOut('srv.u2')).toBeNull();
    expect(getSession().active).toBeNull();
  });

  it('keeps the active account when another one signs out', () => {
    expect(signOut('srv.u1')?.id).toBe('srv.u2');
  });

  it('does not switch to a signed-out account', () => {
    signOut('srv.u1');
    switchAccount('srv.u1');
    expect(getSession().active).toBeNull();
  });

  it('removes the active account and activates the next signed-in one', () => {
    expect(removeAccount('srv.u2')?.id).toBe('srv.u1');
    expect(getSession().accounts.map((a) => a.id)).toEqual(['srv.u1']);
    expect(getSession().active?.id).toBe('srv.u1');
    expect(secure.has('tok_srv.u2')).toBe(false);
  });

  // Regression: addAccount saved the list it read before awaiting the keychain, undoing a sign-out in between.
  it('keeps changes made to other accounts while the token is being stored', async () => {
    const adding = addAccount(server, auth('u3'), 'dev-3');
    signOut('srv.u1');
    await adding;
    expect(getSession().accounts.find((a) => a.id === 'srv.u1')?.signedOut).toBe(true);
    expect(getSession().active?.id).toBe('srv.u3');
  });

  // Regression: a request still running with a replaced token came back 401 and signed out the new session.
  it('ignores a late 401 for a token that was already replaced', async () => {
    const oldConn = connectionFor(getSession().active!)!;
    await addAccount(server, auth('u2', 'fresh'), 'dev-2b');
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: false, status: 401, text: async () => '' } as Response),
    ) as unknown as typeof fetch;
    await request(oldConn, '/UserViews').catch(() => {});
    expect(getSession().active?.id).toBe('srv.u2');
    expect(secure.get('tok_srv.u2')).toBe('fresh');
  });

  it('rejects a sign-in whose server id differs from the probed server', async () => {
    await expect(addAccount(server, { ...auth('u9'), ServerId: 'other' }, 'dev-9')).rejects.toMatchObject({
      kind: 'parse',
    });
    expect(getSession().accounts.find((a) => a.userId === 'u9')).toBeUndefined();
  });

  it('returns null when no signed-in account is left', () => {
    signOut('srv.u1');
    expect(removeAccount('srv.u2')).toBeNull();
  });

  it('signs out once for a burst of parallel 401s', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: false, status: 401, text: async () => '' } as Response),
    ) as unknown as typeof fetch;
    const conn = connectionFor(getSession().active!)!;
    const writes = jest.spyOn(Storage, 'setItemSync');
    await Promise.all([1, 2, 3].map(() => request(conn, '/UserViews').catch(() => {})));
    expect(writes).toHaveBeenCalledTimes(1);
    expect(getSession().accounts.filter((a) => a.signedOut)).toHaveLength(1);
    writes.mockRestore();
  });

  it('marks the account signed out on a 401 and keeps it, without switching to another', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: false, status: 401, text: async () => '' } as Response),
    ) as unknown as typeof fetch;
    const conn = connectionFor(getSession().active!)!;
    await request(conn, '/UserViews').catch(() => {});
    expect(getSession().active).toBeNull();
    expect(getSession().accounts.find((a) => a.id === 'srv.u2')?.signedOut).toBe(true);
    expect(secure.has('tok_srv.u2')).toBe(false);
  });
});

describe('boot', () => {
  /** Fresh module registry = app launch; seeds storage first. */
  function boot(seed: (storage: typeof Storage, secureStore: Map<string, string>) => void) {
    let session!: typeof import('./session');
    jest.isolateModules(() => {
      seed(
        jest.requireMock<typeof import('expo-sqlite/kv-store')>('expo-sqlite/kv-store').Storage,
        jest.requireMock<{ __store: Map<string, string> }>('expo-secure-store').__store,
      );
      session = jest.requireActual<typeof import('./session')>('./session');
    });
    return session.getSession();
  }

  const record = { id: 'srv.u1', server, userId: 'u1', userName: 'U1', deviceId: 'dev-1' };

  it('restores accounts and the active one when the token is there', () => {
    const state = boot((storage, secureStore) => {
      storage.setItemSync('session.accounts', JSON.stringify({ accounts: [record], activeId: 'srv.u1' }));
      secureStore.set('tok_srv.u1', 'tok');
    });
    expect(state.active?.id).toBe('srv.u1');
  });

  it('treats an account without its token as signed out', () => {
    const state = boot((storage, secureStore) => {
      storage.setItemSync('session.accounts', JSON.stringify({ accounts: [record], activeId: 'srv.u1' }));
      secureStore.clear();
    });
    expect(state.active).toBeNull();
    expect(state.accounts[0].signedOut).toBe(true);
  });

  // Regression: one failing keychain read wiped every account (empty state, then overwritten on the next save).
  it('boots only the account with an unreadable token signed out', () => {
    const second = { ...record, id: 'srv.u2', userId: 'u2' };
    const state = boot((storage, secureStore) => {
      storage.setItemSync('session.accounts', JSON.stringify({ accounts: [record, second], activeId: 'srv.u2' }));
      secureStore.set('tok_srv.u1', 'tok-1');
      secureStore.set('tok_srv.u2', 'tok-2');
      const mod = jest.requireMock<{ getItem: (key: string) => string | null }>('expo-secure-store');
      const read = mod.getItem;
      mod.getItem = (key) => {
        if (key === 'tok_srv.u1') throw new Error('keychain locked');
        return read(key);
      };
    });
    expect(state.accounts).toHaveLength(2);
    expect(state.accounts[0].signedOut).toBe(true);
    expect(state.active?.id).toBe('srv.u2');
  });

  it('starts empty on missing or corrupt storage', () => {
    expect(boot((storage) => storage.clearSync()).accounts).toEqual([]);
    expect(boot((storage) => storage.setItemSync('session.accounts', '{nope')).accounts).toEqual([]);
  });
});
