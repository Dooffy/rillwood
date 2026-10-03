// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from '@jest/globals';
import { renderRouter, screen } from 'expo-router/testing-library';

describe('router shell', () => {
  it('opens Welcome on a fresh install', async () => {
    const result = await renderRouter('./src/app', { initialUrl: '/' });
    expect(result.getPathname()).toBe('/welcome');
    expect(screen.getByRole('button', { name: 'Get started' })).toBeOnTheScreen();
  });

  it.each(['/library', '/search', '/downloads', '/welcome', '/server', '/accounts', '/account', '/settings'])(
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
