// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from '@jest/globals';

import { isOutdatedServer, serverHost, serverUrlCandidates } from './server';

describe('serverUrlCandidates', () => {
  it.each([
    ['192.168.1.10:8096', ['https://192.168.1.10:8096', 'http://192.168.1.10:8096']],
    ['  Jellyfin.Example.com  ', ['https://jellyfin.example.com', 'http://jellyfin.example.com']],
    ['http://localhost:8096', ['http://localhost:8096']],
    ['HTTPS://media.example.com/', ['https://media.example.com']],
    ['https://example.com/jellyfin/', ['https://example.com/jellyfin']],
    ['https://example.com/jellyfin/web/#/home.html', ['https://example.com/jellyfin']],
    ['http://10.0.0.2:8096/web/index.html', ['http://10.0.0.2:8096']],
    ['http://[::1]:8096', ['http://[::1]:8096']],
    ['https://example.com?foo=bar', ['https://example.com']],
  ])('%s', (input, expected) => {
    expect(serverUrlCandidates(input)).toEqual(expected);
  });

  it.each([
    '',
    '   ',
    'ftp://example.com',
    'http://',
    'user:pass@example.com',
    'exa mple.com',
    'example.com:0',
    'example.com:70000',
    '.example.com',
    'example..com',
  ])('rejects %j', (input) => {
    expect(serverUrlCandidates(input)).toEqual([]);
  });
});

describe('isOutdatedServer', () => {
  it.each([
    ['10.10.6', true],
    ['10.9.11', true],
    ['10.10.7', false],
    ['10.11.11', false],
    ['12.1.0', false],
    ['12.0.0-rc1', false],
    ['unknown', false],
  ])('%s → %s', (version, expected) => {
    expect(isOutdatedServer(version)).toBe(expected);
  });
});

describe('serverHost', () => {
  it.each([
    ['https://jf.example.com/', 'jf.example.com'],
    ['http://10.0.0.2:8096', '10.0.0.2:8096'],
    ['https://example.com/jellyfin//', 'example.com/jellyfin'],
  ])('%s → %s', (url, host) => {
    expect(serverHost(url)).toBe(host);
  });
});
