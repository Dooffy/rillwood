// SPDX-License-Identifier: GPL-3.0-or-later
// Accounts + active account (docs/context/api.md). Records in kv-store (the Keychain on Apple TV - `src/persist.ts`),
// tokens in secure-store `tok_<accountId>`.
// Read once (sync) on first use, then served from memory. A store, not Context: the 401 listener and the auth calls
// change it from outside React.
import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';

import { ApiError, logout, onUnauthorized, type AuthenticationResult, type Connection } from '@/api';
import { getPersisted, setPersisted } from '@/persist';

/** A probed Jellyfin server. `id` is the server's own id (`ServerId`). */
export type Server = { id: string; url: string; name: string; version: string };

/** One user on one server. `signedOut`: token gone (401 or sign out); the record stays (a 401 keeps its downloads too). */
export type Account = {
  id: string;
  server: Server;
  userId: string;
  userName: string;
  deviceId: string;
  signedOut?: boolean;
};

export type SessionState = { accounts: Account[]; active: Account | null };

const STORAGE_KEY = 'session.accounts';

// Secure-store keys allow [A-Za-z0-9._-]; server and user ids are hex GUIDs.
const accountId = (serverId: string, userId: string) => `${serverId}.${userId}`;
const tokenKey = (id: string) => `tok_${id}`;

let state: SessionState | undefined;
const tokens = new Map<string, string>();
const listeners = new Set<() => void>();

/** A signed-out account is never active. */
function withActive(accounts: Account[], activeId: string | null | undefined): SessionState {
  return { accounts, active: accounts.find((a) => a.id === activeId && !a.signedOut) ?? null };
}

function readToken(id: string): string | null {
  try {
    return SecureStore.getItem(tokenKey(id));
  } catch {
    return null;
  }
}

function load(): SessionState {
  try {
    const saved = JSON.parse(getPersisted(STORAGE_KEY) ?? 'null') as {
      accounts: Account[];
      activeId: string | null;
    } | null;
    if (!saved) return withActive([], null);
    // An account without a readable token (deleted, restored to a new device, keychain locked) boots signed out -
    // one bad read never drops the other accounts.
    const accounts = saved.accounts.map((a) => {
      const token = a.signedOut ? null : readToken(a.id);
      if (token) tokens.set(a.id, token);
      return token ? a : { ...a, signedOut: true };
    });
    return withActive(accounts, saved.activeId);
  } catch {
    return withActive([], null);
  }
}

export function getSession(): SessionState {
  state ??= load();
  return state;
}

function save(accounts: Account[], activeId: string | null | undefined) {
  state = withActive(accounts, activeId);
  setPersisted(STORAGE_KEY, JSON.stringify({ accounts, activeId: state.active?.id ?? null }));
  listeners.forEach((l) => l());
}

/** Every session change (sign-in, sign-out, switch); for stores outside React. */
export function subscribeSession(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** All accounts + the active one (null when signed out). */
export function useSession(): SessionState {
  return useSyncExternalStore(subscribeSession, getSession);
}

/** Connection for API calls as this account; null when it's signed out. */
export function connectionFor(account: Account): Connection | null {
  const token = tokens.get(account.id);
  return token ? { baseUrl: account.server.url, deviceId: account.deviceId, token, accountId: account.id } : null;
}

function forgetToken(id: string) {
  tokens.delete(id);
  SecureStore.deleteItemAsync(tokenKey(id)).catch(() => {});
}

/** Best effort: revoke the token on the server (it may already be dead or offline). */
function revoke(account: Account) {
  const conn = connectionFor(account);
  if (conn) logout(conn).catch(() => {});
}

/**
 * Stores a successful sign-in and makes it active. The same server + user replaces its old record and revokes the
 * old token (each sign-in has its own DeviceId, so the server wouldn't revoke it by itself).
 */
export async function addAccount(server: Server, auth: AuthenticationResult, deviceId: string): Promise<Account> {
  // The account id comes from the server's answer: it must be the server the user probed, or a hostile server could
  // claim another server's id and replace that account.
  if (auth.ServerId !== server.id) throw new ApiError('parse');
  const id = accountId(auth.ServerId, auth.User.Id);
  const old = getSession().accounts.find((a) => a.id === id);
  if (old) revoke(old);

  await SecureStore.setItemAsync(tokenKey(id), auth.AccessToken);
  tokens.set(id, auth.AccessToken);
  // Re-read after the await: a 401 / sign-out may have changed other accounts meanwhile.
  const { accounts } = getSession();
  const account: Account = {
    id,
    server,
    userId: auth.User.Id,
    userName: auth.User.Name,
    deviceId,
  };
  save(
    accounts.some((a) => a.id === id) ? accounts.map((a) => (a.id === id ? account : a)) : [...accounts, account],
    id,
  );
  return account;
}

export function switchAccount(id: string) {
  save(getSession().accounts, id);
}

/** `handOver`: the active account signing out activates the next signed-in one (a 401 doesn't - no silent switch). */
function markSignedOut(id: string, handOver = false) {
  // A burst of parallel 401s signs out once.
  if (!tokens.has(id)) return;
  forgetToken(id);
  const { accounts, active } = getSession();
  const next = accounts.map((a) => (a.id === id ? { ...a, signedOut: true } : a));
  save(next, handOver && active?.id === id ? next.find((a) => !a.signedOut)?.id : active?.id);
}

/**
 * Revokes the token and keeps the account for signing in again (the Account screen deletes its downloads first). Signing out the active account
 * activates the next signed-in one, as removing does. Returns the active account afterwards (null = signed out).
 */
export function signOut(id: string): Account | null {
  const account = getSession().accounts.find((a) => a.id === id);
  if (account) revoke(account);
  markSignedOut(id, true);
  return getSession().active;
}

/**
 * Signs out and forgets the account. Removing the active account activates the next signed-in one.
 * Returns the active account afterwards (null = signed out).
 */
export function removeAccount(id: string): Account | null {
  const { accounts, active } = getSession();
  const account = accounts.find((a) => a.id === id);
  if (!account) return active;
  revoke(account);
  forgetToken(id);
  const rest = accounts.filter((a) => a.id !== id);
  save(rest, active?.id === id ? rest.find((a) => !a.signedOut)?.id : active?.id);
  return getSession().active;
}

// Servers the user picked: probed this run (memory only) or saved with an account. Sign in trusts only these -
// never a URL from route params alone, so a deep link can't point the password form at another address.
const probed = new Map<string, Server>();

export function rememberServer(server: Server) {
  probed.set(server.url, server);
}

export function knownServer(url: string): Server | null {
  return probed.get(url) ?? getSession().accounts.find((a) => a.server.url === url)?.server ?? null;
}

// Global 401 (revoked / expired token): sign that account out, keep its record and downloads. Only for the token it
// holds now - a late 401 for a token it already replaced is ignored.
onUnauthorized((id, token) => {
  if (token === tokens.get(id)) markSignedOut(id);
});
