// SPDX-License-Identifier: GPL-3.0-or-later
// Jellyfin fetch client: auth header, 8s fail-fast timeout, ApiError, offline flag (docs/context/api.md).
// Header auth only - never put a token in a URL, a log line or an error message.
import Constants from 'expo-constants';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

export const TIMEOUT_MS = 8000;

const CLIENT = 'Rillwood';
const VERSION = Constants.expoConfig?.version ?? '0.0.0';
const DEVICE = Platform.OS === 'ios' ? (Platform.isPad ? 'iPad' : 'iPhone') : 'Android';

/** Public endpoints only (server info) - no auth header. */
export type ServerConnection = { baseUrl: string };

/**
 * Sign-in and authed calls. `deviceId` is minted per sign-in and kept with the account; `token` and
 * `accountId` are set once signed in.
 */
export type Connection = ServerConnection & { deviceId: string; token?: string; accountId?: string };

/** `MediaBrowser Client=..., Device=..., DeviceId=..., Version=...[, Token=...]` */
export function authHeader({ deviceId, token }: Connection): string {
  const auth = `MediaBrowser Client="${CLIENT}", Device="${DEVICE}", DeviceId="${deviceId}", Version="${VERSION}"`;
  return token ? `${auth}, Token="${token}"` : auth;
}

/**
 * - `network`: server unreachable or no answer within 8s (sets the offline flag)
 * - `http`: server answered with a non-2xx `status` (401 = bad / revoked token)
 * - `aborted`: the caller's signal fired - ignore
 * - `parse`: 2xx with a body that isn't JSON, or a probe that isn't Jellyfin
 */
export type ApiErrorKind = 'network' | 'http' | 'aborted' | 'parse';

export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    readonly status?: number,
    message: string = kind,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Offline flag: true after a network failure, false after any server response. Probes don't touch it.

let offline = false;
const offlineListeners = new Set<() => void>();

function setOffline(next: boolean) {
  if (offline === next) return;
  offline = next;
  offlineListeners.forEach((l) => l());
}

function subscribeOffline(listener: () => void) {
  offlineListeners.add(listener);
  return () => offlineListeners.delete(listener);
}

export function isOffline(): boolean {
  return offline;
}

export function useOffline(): boolean {
  return useSyncExternalStore(subscribeOffline, isOffline);
}

// 401 listeners: the session signs the account out (keeps downloads). Only for signed-in calls (`accountId`).

/** Gets the rejected token too, so a late 401 for a replaced token doesn't sign out the new session. */
type UnauthorizedListener = (accountId: string, token: string | undefined) => void;

const unauthorizedListeners = new Set<UnauthorizedListener>();

export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

export type Query = Record<string, string | number | boolean | undefined>;

export type RequestOptions = {
  method?: 'GET' | 'POST';
  query?: Query;
  body?: unknown;
  signal?: AbortSignal;
  /** Address probe (Add server): a wrong address must not mark the app offline. */
  probe?: boolean;
};

function buildUrl(baseUrl: string, path: string, query?: Query): string {
  const params = Object.entries(query ?? {})
    .filter((e): e is [string, string | number | boolean] => e[1] !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return `${baseUrl}${path}${params ? `?${params}` : ''}`;
}

/** One API call. JSON in / out; 204 resolves to undefined. Errors are always `ApiError`. */
export async function request<T>(
  conn: ServerConnection | Connection,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', query, body, signal, probe = false } = options;
  if (signal?.aborted) throw new ApiError('aborted');

  // Own controller: aborted by the 8s timeout or by the caller's signal (AbortSignal.any isn't on every Hermes).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const forwardAbort = () => controller.abort();
  signal?.addEventListener('abort', forwardAbort);

  const headers: Record<string, string> = { Accept: 'application/json' };
  if ('deviceId' in conn) headers.Authorization = authHeader(conn);
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  // The body read stays inside the timeout + abort window: a server that sends headers and stalls still fails in 8s.
  let response: Response;
  let text: string;
  try {
    response = await fetch(buildUrl(conn.baseUrl, path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    text = response.ok ? await response.text() : '';
  } catch {
    if (signal?.aborted) throw new ApiError('aborted');
    if (!probe) setOffline(true);
    throw new ApiError('network');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }

  if (!probe) setOffline(false);
  if (!response.ok) {
    const accountId = 'accountId' in conn ? conn.accountId : undefined;
    if (response.status === 401 && accountId) {
      const token = 'token' in conn ? conn.token : undefined;
      unauthorizedListeners.forEach((l) => l(accountId, token));
    }
    // Path only - the query can carry a Quick Connect secret.
    throw new ApiError('http', response.status, `${method} ${path} → ${response.status}`);
  }

  // Empty body (204 included) → undefined.
  if (text === '') return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError('parse');
  }
}

// DTOs - only the fields the app reads (docs/research/jellyfin-api.md).

export type PublicSystemInfo = {
  Id: string;
  ServerName: string;
  Version: string;
  ProductName?: string;
  StartupWizardCompleted?: boolean;
};

export type UserDto = {
  Id: string;
  Name: string;
  ServerId?: string;
  PrimaryImageTag?: string;
  HasPassword?: boolean;
};

export type AuthenticationResult = {
  User: UserDto;
  AccessToken: string;
  ServerId: string;
};

export type QuickConnectResult = {
  Secret: string;
  Code: string;
  Authenticated: boolean;
};

// Endpoints - auth.

export function getPublicSystemInfo(conn: ServerConnection, signal?: AbortSignal) {
  return request<PublicSystemInfo>(conn, '/System/Info/Public', { signal });
}

/** Empty when the server hides users (common) - always allow a typed username. */
export function getPublicUsers(conn: ServerConnection, signal?: AbortSignal) {
  return request<UserDto[]>(conn, '/Users/Public', { signal });
}

export function authenticateByName(conn: Connection, username: string, password: string, signal?: AbortSignal) {
  return request<AuthenticationResult>(conn, '/Users/AuthenticateByName', {
    method: 'POST',
    body: { Username: username, Pw: password },
    signal,
  });
}

export function getQuickConnectEnabled(conn: ServerConnection, signal?: AbortSignal) {
  return request<boolean>(conn, '/QuickConnect/Enabled', { signal });
}

/** POST - GET is 405 on 12.x. */
export function initiateQuickConnect(conn: Connection, signal?: AbortSignal) {
  return request<QuickConnectResult>(conn, '/QuickConnect/Initiate', { method: 'POST', signal });
}

export function getQuickConnectState(conn: Connection, secret: string, signal?: AbortSignal) {
  return request<QuickConnectResult>(conn, '/QuickConnect/Connect', { query: { secret }, signal });
}

/** 404 until the code is approved. */
export function authenticateWithQuickConnect(conn: Connection, secret: string, signal?: AbortSignal) {
  return request<AuthenticationResult>(conn, '/Users/AuthenticateWithQuickConnect', {
    method: 'POST',
    body: { Secret: secret },
    signal,
  });
}

/** Revokes the token server-side (401 afterwards). A 401 here (token already dead) is not a sign-out event. */
export function logout({ accountId: _, ...conn }: Connection) {
  return request<void>(conn, '/Sessions/Logout', { method: 'POST' });
}

/**
 * Probes every candidate base URL in parallel and returns the first one, in candidate order, that answers
 * like a Jellyfin server (https before http). Once it wins, the slower probes are cancelled - an
 * unreachable https never costs a timeout, and a hanging http never delays a working https.
 */
export async function findServer(
  candidates: string[],
  signal?: AbortSignal,
): Promise<{ baseUrl: string; info: PublicSystemInfo }> {
  const controller = new AbortController();
  const forwardAbort = () => controller.abort();
  signal?.addEventListener('abort', forwardAbort);
  const probes = candidates.map((baseUrl) =>
    request<PublicSystemInfo>({ baseUrl }, '/System/Info/Public', { signal: controller.signal, probe: true }).then(
      (info) => (info?.Id && info.Version ? info : Promise.reject(new ApiError('parse'))),
    ),
  );
  probes.forEach((p) => p.catch(() => {})); // settled in order below; avoid unhandled rejections
  let failure: unknown;
  try {
    for (const [i, probe] of probes.entries()) {
      try {
        return { baseUrl: candidates[i], info: await probe };
      } catch (e) {
        if (signal?.aborted) throw new ApiError('aborted');
        failure ??= e;
      }
    }
    throw failure ?? new ApiError('parse');
  } finally {
    controller.abort();
    signal?.removeEventListener('abort', forwardAbort);
  }
}
