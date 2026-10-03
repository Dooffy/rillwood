// SPDX-License-Identifier: GPL-3.0-or-later
// Auth calls used by the (auth) screens. UI-only stubs for now: no network, accounts in memory only.
// M2 wiring replaces the bodies with api.ts calls and moves accounts into session.tsx (docs/context/api.md).
import { useSyncExternalStore } from 'react';

export type Server = { url: string; name: string; version: string };

export type Account = { id: string; server: Server; userName: string };

export const QUICK_CONNECT_POLL_MS = 5000;

const STUB_DELAY_MS = 500;
const STUB_APPROVE_MS = 6000;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** First candidate that answers `/System/Info/Public`. */
export async function probeServer(candidates: string[]): Promise<Server> {
  await delay(STUB_DELAY_MS);
  return { url: candidates[0], name: 'Jellyfin', version: '12.1.0' };
}

export async function signIn(server: Server, userName: string, _password: string): Promise<void> {
  await delay(STUB_DELAY_MS);
  addAccount(server, userName);
}

export async function quickConnectEnabled(_server: Server): Promise<boolean> {
  return true;
}

export async function initiateQuickConnect(_server: Server): Promise<{ code: string; secret: string }> {
  await delay(STUB_DELAY_MS);
  return { code: '482913', secret: String(Date.now()) };
}

/** True once the code is approved on another device. */
export async function checkQuickConnect(_server: Server, secret: string): Promise<boolean> {
  return Date.now() - Number(secret) > STUB_APPROVE_MS;
}

/** Exchanges the approved secret for a session. An aborted `signal` adds no account. */
export async function finishQuickConnect(server: Server, _secret: string, signal: AbortSignal): Promise<void> {
  await delay(STUB_DELAY_MS);
  signal.throwIfAborted();
  addAccount(server, 'Quick Connect user');
}

// In-memory accounts store.

export type AccountsState = { accounts: Account[]; activeId: string | null; active: Account | null };

let state: AccountsState = { accounts: [], activeId: null, active: null };
const listeners = new Set<() => void>();

function set(accounts: Account[], activeId: string | null) {
  state = { accounts, activeId, active: accounts.find((a) => a.id === activeId) ?? null };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function addAccount(server: Server, userName: string) {
  const id = `${server.url}|${userName}`;
  const account = { id, server, userName };
  set([...state.accounts.filter((a) => a.id !== id), account], id);
}

export function switchAccount(id: string) {
  set(state.accounts, id);
}

export function removeAccount(id: string) {
  const accounts = state.accounts.filter((a) => a.id !== id);
  set(accounts, state.activeId === id ? (accounts[0]?.id ?? null) : state.activeId);
}

export function getAccounts(): AccountsState {
  return state;
}

/** All accounts + the active one (null when signed out). */
export function useAccounts(): AccountsState {
  return useSyncExternalStore(subscribe, getAccounts);
}
