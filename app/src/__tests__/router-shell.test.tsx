// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from '@jest/globals';
import { renderRouter, screen } from 'expo-router/testing-library';

describe('router shell', () => {
  it('opens Add server on launch when signed out', async () => {
    const result = await renderRouter('./src/app', { initialUrl: '/' });
    expect(result.getPathname()).toBe('/server');
  });

  it.each(['/library', '/search', '/downloads', '/server', '/accounts', '/account', '/settings'])(
    'resolves %s',
    async (path) => {
      const result = await renderRouter('./src/app', { initialUrl: path });
      expect(result.getPathname()).toBe(path);
    },
  );

  it.each(['/login', '/quick-connect'])('redirects %s without a server to /server', async (path) => {
    const result = await renderRouter('./src/app', { initialUrl: path });
    expect(result.getPathname()).toBe('/server');
  });

  it.each(['/item/abc', '/series/abc'])('resolves %s', async (path) => {
    const result = await renderRouter('./src/app', { initialUrl: path });
    expect(result.getPathname()).toBe(path);
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
  });
});
