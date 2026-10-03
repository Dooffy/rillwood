// SPDX-License-Identifier: GPL-3.0-or-later
// Auth flows behind the (auth) screens: probe a server, sign in, Quick Connect (docs/context/api.md).
import { randomUUID } from 'expo-crypto';
import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import {
  ApiError,
  authenticateByName,
  authenticateWithQuickConnect,
  findServer,
  getQuickConnectEnabled,
  getQuickConnectState,
  initiateQuickConnect,
} from '@/api';
import { addAccount, knownServer, rememberServer, type Server } from '@/session';

export const QUICK_CONNECT_POLL_MS = 5000;

/** First candidate URL that answers like a Jellyfin server (https before http). */
export async function probeServer(candidates: string[], signal?: AbortSignal): Promise<Server> {
  const { baseUrl, info } = await findServer(candidates, signal);
  const server: Server = { id: info.Id, url: baseUrl, name: info.ServerName, version: info.Version };
  rememberServer(server);
  return server;
}

/**
 * Server for Sign in / Quick Connect from the `url` route param - only one the user probed or has an account on
 * (`knownServer`), never trusted from the params themselves. Null → back to Add server.
 */
export function useServerParam(): Server | null {
  const { url } = useLocalSearchParams<{ url?: string }>();
  return useMemo(() => (url ? knownServer(url) : null), [url]);
}

export async function signIn(server: Server, userName: string, password: string): Promise<void> {
  const deviceId = randomUUID();
  const auth = await authenticateByName({ baseUrl: server.url, deviceId }, userName, password);
  await addAccount(server, auth, deviceId);
}

export function quickConnectEnabled(server: Server, signal?: AbortSignal): Promise<boolean> {
  return getQuickConnectEnabled({ baseUrl: server.url }, signal);
}

/** Resolves after `ms`; rejects with `aborted` as soon as the signal fires. */
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new ApiError('aborted'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Full Quick Connect sign-in: shows the code via `onCode`, polls until it's approved on another device, then adds
 * the account. Aborting the signal stops polling and never adds the account.
 */
export async function quickConnect(
  server: Server,
  { signal, onCode }: { signal: AbortSignal; onCode: (code: string) => void },
): Promise<void> {
  const conn = { baseUrl: server.url, deviceId: randomUUID() };
  const { Secret, Code } = await initiateQuickConnect(conn, signal);
  onCode(Code);
  let approved = false;
  while (!approved) {
    await wait(QUICK_CONNECT_POLL_MS, signal);
    approved = (await getQuickConnectState(conn, Secret, signal)).Authenticated;
  }
  const auth = await authenticateWithQuickConnect(conn, Secret, signal);
  if (signal.aborted) throw new ApiError('aborted');
  await addAccount(server, auth, conn.deviceId);
}

/** User-facing message for a failed auth call. */
export function authErrorMessage(error: unknown, action: 'probe' | 'signIn' | 'quickConnect'): string {
  const e = error instanceof ApiError ? error : null;
  if (e?.kind === 'network') return "Couldn't reach the server. Check the address and your connection.";
  if (action === 'probe') return "That address doesn't look like a Jellyfin server.";
  if (action === 'signIn' && e?.status === 401) return 'Wrong username or password.';
  if (action === 'quickConnect' && e?.status === 401) return 'Quick Connect is turned off on this server.';
  return 'Something went wrong. Try again.';
}
