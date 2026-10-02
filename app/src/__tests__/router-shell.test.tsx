// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from '@jest/globals';
import { renderRouter, screen } from 'expo-router/testing-library';

describe('router shell', () => {
  it('redirects / to the Home tab', async () => {
    const result = await renderRouter('./src/app', { initialUrl: '/' });
    expect(result.getPathname()).toBe('/home');
    expect(screen.getByRole('header', { name: 'Home' })).toBeOnTheScreen();
  });

  it.each(['/library', '/search', '/downloads', '/server', '/login', '/quick-connect', '/accounts', '/settings'])(
    'resolves %s',
    async (path) => {
      const result = await renderRouter('./src/app', { initialUrl: path });
      expect(result.getPathname()).toBe(path);
    },
  );

  it.each(['/item/abc', '/series/abc'])('resolves %s', async (path) => {
    const result = await renderRouter('./src/app', { initialUrl: path });
    expect(result.getPathname()).toBe(path);
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
  });
});
