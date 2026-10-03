// SPDX-License-Identifier: GPL-3.0-or-later
// Pure server-address helpers (docs/context/api.md). No network here.

// [scheme://]host[:port][/path][?query][#hash] - host is a name, IPv4 or [IPv6]; no user:pass@.
const ADDRESS = /^(?:(https?):\/\/)?(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::(\d{1,5}))?(\/[^?#]*)?(?:[?#].*)?$/i;

/**
 * User input → base URLs to probe, in order. Empty = not a valid address.
 * No scheme → https first, then http. Keeps a reverse-proxy sub-path, drops the web client path (`/web/...`).
 */
export function serverUrlCandidates(input: string): string[] {
  const match = ADDRESS.exec(input.trim());
  if (!match) return [];
  const [, scheme, host, port, path = ''] = match;
  if (port !== undefined && (Number(port) < 1 || Number(port) > 65535)) return [];
  if (/^[.-]|[.-]$|\.\./.test(host)) return [];

  const base = path.replace(/\/web(\/.*)?$/i, '').replace(/\/+$/, '');
  const rest = `${host.toLowerCase()}${port ? `:${port}` : ''}${base}`;
  return scheme ? [`${scheme.toLowerCase()}://${rest}`] : [`https://${rest}`, `http://${rest}`];
}

export const MIN_SERVER_VERSION = '10.10.7';

// major.minor.patch → one comparable number (each part < 1000).
const versionNumber = (v: string) => {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v);
  return m ? Number(m[1]) * 1e6 + Number(m[2]) * 1e3 + Number(m[3]) : null;
};
const MIN = versionNumber(MIN_SERVER_VERSION)!;

/** True below MIN_SERVER_VERSION. Unparseable versions don't warn. */
export function isOutdatedServer(version: string): boolean {
  const v = versionNumber(version);
  return v !== null && v < MIN;
}
