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

/** The server couldn't be reached (no network, server down, timeout, TLS) - not an answer like a 5xx or a 404. */
export const isConnectionError = (error: unknown): error is ApiError =>
  error instanceof ApiError && error.kind === 'network';

// Offline flag: true after a network failure, false after any server response. Probes don't touch it.

let offline = false;
const offlineListeners = new Set<() => void>();

function setOffline(next: boolean) {
  if (offline === next) return;
  offline = next;
  offlineListeners.forEach((l) => l());
}

export function subscribeOffline(listener: () => void) {
  offlineListeners.add(listener);
  return () => offlineListeners.delete(listener);
}

/** Another server is active: the last one's state doesn't apply (`src/connection.ts` checks the new one). */
export function resetOffline() {
  setOffline(false);
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
  method?: 'GET' | 'POST' | 'DELETE';
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
  /** `/Users/Me` only. */
  Policy?: { EnableContentDownloading?: boolean };
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

export type ImageType = 'Primary' | 'Backdrop' | 'Thumb' | 'Logo';

/** Per-user state of an item. Ticks: 10,000,000 per second. */
export type UserItemDataDto = {
  PlaybackPositionTicks: number;
  Played: boolean;
  PlayCount?: number;
  IsFavorite?: boolean;
  /** Series / seasons. */
  PlayedPercentage?: number;
  UnplayedItemCount?: number;
  LastPlayedDate?: string;
};

/** One video / audio / subtitle stream of a media source. */
export type MediaStreamDto = {
  /** `Video`, `Audio`, `Subtitle`, ... */
  Type: string;
  Index: number;
  Codec?: string;
  Language?: string;
  Title?: string;
  /** Server-built label: "English - Dolby Digital - 5.1 - Default". */
  DisplayTitle?: string;
  IsDefault?: boolean;
  IsForced?: boolean;
  IsExternal?: boolean;
  Width?: number;
  Height?: number;
  /** Video: display shape (anamorphic files differ from Width / Height), "16:9", "2.40:1". */
  AspectRatio?: string;
  /** `SDR`, `HDR`. */
  VideoRange?: string;
  /** `SDR`, `HDR10`, `HDR10Plus`, `HLG`, `DOVI`, `DOVIWithHDR10`, ... */
  VideoRangeType?: string;
  Channels?: number;
  /** Audio: "LC", "TrueHD + Atmos", "Dolby Atmos" ... */
  Profile?: string;
  /** Subtitles for the deaf and hard of hearing (SDH). */
  IsHearingImpaired?: boolean;
  /** PlaybackInfo subtitles: `Embed`, `External`, `Encode`, `Hls`. `DeliveryUrl` is left out on purpose (`ApiKey=`). */
  DeliveryMethod?: string;
};

/** A file (version) of an item. */
export type MediaSourceDto = {
  Id: string;
  Name?: string;
  Container?: string;
  Size?: number;
  MediaStreams?: MediaStreamDto[];
  // PlaybackInfo only.
  /** False comes without an `ErrorCode` (no transcoding profiles are sent). */
  SupportsDirectPlay?: boolean;
  DefaultAudioStreamIndex?: number;
  DefaultSubtitleStreamIndex?: number;
};

/** `POST /Items/{id}/PlaybackInfo`. `ErrorCode`: `NotAllowed`, `NoCompatibleStream`, `RateLimitExceeded`. */
export type PlaybackInfoResponse = {
  MediaSources: MediaSourceDto[];
  PlaySessionId?: string;
  ErrorCode?: string;
};

/** Cast / crew entry of an item. */
export type PersonDto = {
  Id: string;
  Name: string;
  /** Character for actors, job for crew. */
  Role?: string;
  /** `Actor`, `GuestStar`, `Director`, `Writer`, `Producer`, ... */
  Type?: string;
  PrimaryImageTag?: string;
};

/** Library item or view (`/UserViews`). */
export type BaseItemDto = {
  Id: string;
  Name: string;
  /** `Movie`, `Series`, `Season`, `Episode`, `CollectionFolder`, ... */
  Type: string;
  ServerId?: string;
  IsFolder?: boolean;
  MediaType?: string;
  /** Views only: `movies`, `tvshows`, `music`, ... */
  CollectionType?: string;
  RunTimeTicks?: number;
  ProductionYear?: number;
  PremiereDate?: string;
  /** Episode number; season number for seasons. */
  IndexNumber?: number;
  /** Season number of an episode. */
  ParentIndexNumber?: number;
  SeriesId?: string;
  /** `Virtual` = no file (a missing or not yet aired episode); `FileSystem` otherwise. */
  LocationType?: string;
  SeriesName?: string;
  SeasonId?: string;
  SeasonName?: string;
  /** Series: `Continuing` or `Ended`. */
  Status?: string;
  /** Series: last air date (ISO) once ended. */
  EndDate?: string;
  /** Series: number of seasons; season: number of episodes. */
  ChildCount?: number;
  SeriesPrimaryImageTag?: string;
  ImageTags?: Partial<Record<ImageType, string>>;
  BackdropImageTags?: string[];
  ParentBackdropItemId?: string;
  ParentBackdropImageTags?: string[];
  ParentThumbItemId?: string;
  ParentThumbImageTag?: string;
  UserData?: UserItemDataDto;
  // Detail (`/Items/{id}`) only.
  Overview?: string;
  Genres?: string[];
  /** Age rating: "PG-13". */
  OfficialRating?: string;
  /** 0-10. */
  CommunityRating?: number;
  MediaSources?: MediaSourceDto[];
  People?: PersonDto[];
};

/** Paged list. `/Items/Latest` is the exception: a bare array. */
export type ItemsResult = {
  Items: BaseItemDto[];
  TotalRecordCount: number;
  StartIndex?: number;
};

/** A GET as data, for `useFetch(path, { query })` or `request`. */
export type Endpoint = { path: string; query?: Query };

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

// Endpoints - user data. Both answer the item's new UserData (200; same on 10.11 + 12.1). Unknown id: 404 on 12.x,
// 500 on 10.11.

/**
 * Mark watched (`POST`) or unwatched (`DELETE`). Either clears the resume point; a season / series marks its episodes.
 * `datePlayed` (ISO): the `LastPlayedDate` to set instead of the server's now (offline sync).
 */
export function setPlayed(conn: Connection, itemId: string, played: boolean, datePlayed?: string) {
  return request<UserItemDataDto>(conn, `/UserPlayedItems/${encodeURIComponent(itemId)}`, {
    method: played ? 'POST' : 'DELETE',
    query: played ? { datePlayed } : undefined,
  });
}

/** The item's UserData (offline sync, docs/context/sync.md). Unknown id: 404. */
export function getUserData(conn: Connection, itemId: string) {
  return request<UserItemDataDto>(conn, `/UserItems/${encodeURIComponent(itemId)}/UserData`);
}

/** Stored exactly as sent - no resume rules, no checks (offline sync clamps first). Only the fields sent change. */
export function updateUserData(
  conn: Connection,
  itemId: string,
  body: Pick<UserItemDataDto, 'PlaybackPositionTicks' | 'LastPlayedDate'>,
) {
  return request<UserItemDataDto>(conn, `/UserItems/${encodeURIComponent(itemId)}/UserData`, { method: 'POST', body });
}

/** These items with their UserData, no images; unknown ids are left out. */
export function getItemsById(conn: Connection, ids: readonly string[]) {
  return request<ItemsResult>(conn, '/Items', { query: { ids: ids.join(','), enableImages: false } });
}

/** Add to (`POST`) or remove from (`DELETE`) favourites. */
export function setFavourite(conn: Connection, itemId: string, favourite: boolean) {
  return request<UserItemDataDto>(conn, `/UserFavoriteItems/${encodeURIComponent(itemId)}`, {
    method: favourite ? 'POST' : 'DELETE',
  });
}

// Endpoints - playback.

/** Media sources + `PlaySessionId` for playing `itemId` (user from the token). `body` = `playbackInfoBody` (playback.ts). */
export function getPlaybackInfo(conn: Connection, itemId: string, body: unknown, signal?: AbortSignal) {
  return request<PlaybackInfoResponse>(conn, `/Items/${encodeURIComponent(itemId)}/PlaybackInfo`, {
    method: 'POST',
    body,
    signal,
  });
}

/**
 * `Sessions/Playing*` body (PlaybackStartInfo / PlaybackProgressInfo / PlaybackStopInfo - only the fields we send).
 * Resume rules apply on every report: < 5% → position 0, ≥ 90% → Played (docs/research/jellyfin-api.md §4).
 */
export type PlaybackReport = {
  ItemId: string;
  MediaSourceId: string;
  PlaySessionId?: string;
  PositionTicks: number;
  PlayMethod: 'DirectPlay';
  CanSeek: boolean;
  IsPaused?: boolean;
  /** Progress only. */
  EventName?: 'TimeUpdate' | 'Pause' | 'Unpause' | 'AudioTrackChange' | 'SubtitleTrackChange';
  /**
   * The tracks playing (Jellyfin indexes, subtitle -1 = off). Playing / Progress store them per user + item (with the
   * user's "remember selections" settings on, the default) - the next PlaybackInfo of the item starts with them.
   */
  AudioStreamIndex?: number;
  SubtitleStreamIndex?: number;
};

/** Session start: sets LastPlayedDate + PlayCount (only here). 204. */
export function reportPlaybackStart(conn: Connection, report: PlaybackReport) {
  return request<void>(conn, '/Sessions/Playing', { method: 'POST', body: report });
}

/** Position update (every 10 s, pause / unpause, seek). 204. */
export function reportPlaybackProgress(conn: Connection, report: PlaybackReport) {
  return request<void>(conn, '/Sessions/Playing/Progress', { method: 'POST', body: report });
}

/** Session end with the final position. 204. */
export function reportPlaybackStopped(conn: Connection, report: PlaybackReport) {
  return request<void>(conn, '/Sessions/Playing/Stopped', { method: 'POST', body: report });
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
