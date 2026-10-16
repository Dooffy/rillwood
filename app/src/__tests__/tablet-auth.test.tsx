// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render, renderHook, screen } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';

import Welcome from '@/app/(auth)/welcome';
import { Page } from '@/components/Page';
import { Text } from '@/components/Text';
import { isWide, readableWidth, useWide, useWideLandscape } from '@/theme';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

/** Window size for the screen under test (phone 390 x 844, iPad 834 x 1194 / 1194 x 834). */
function windowOf(width: number, height: number) {
  jest.spyOn(Dimensions, 'get').mockReturnValue({ width, height, scale: 2, fontScale: 1 });
}

const style = (testID: string) =>
  StyleSheet.flatten(screen.getByTestId(testID, { includeHiddenElements: true }).props.style);

afterEach(() => {
  jest.restoreAllMocks();
});

describe('isWide', () => {
  it('starts at tablet widths', () => {
    expect(isWide(440)).toBe(false);
    expect(isWide(600)).toBe(true);
    expect(isWide(834)).toBe(true);
  });
});

// Regression: a phone turned sideways in the player is 956 pt wide - the screens under it switched to tablet layouts.
describe('useWide / useWideLandscape', () => {
  it('stay off on a phone in landscape, on for a tablet', async () => {
    const flags = async () => (await renderHook(() => [useWide(), useWideLandscape()])).result.current;
    windowOf(956, 440);
    expect(await flags()).toEqual([false, false]);
    windowOf(1194, 834);
    expect(await flags()).toEqual([true, true]);
    windowOf(834, 1194);
    expect(await flags()).toEqual([true, false]);
  });
});

describe('Page on a wide screen', () => {
  it('centres a readable column; forms and narrow pages get the form width', async () => {
    await render(
      <Page>
        <Text>Settings</Text>
      </Page>,
    );
    expect(style('page-content')).toMatchObject({ maxWidth: readableWidth.page, alignSelf: 'center' });

    for (const props of [{ form: true }, { narrow: true }]) {
      await render(
        <Page {...props}>
          <Text>Sign in</Text>
        </Page>,
      );
      expect(style('page-content')).toMatchObject({ maxWidth: readableWidth.form, alignSelf: 'center' });
    }
  });
});

describe('Welcome by window size', () => {
  it('phone: the wall on top keeps the artwork ratio (its own fade)', async () => {
    windowOf(390, 844);
    await render(<Welcome />);
    expect(style('welcome-wall')).toMatchObject({ aspectRatio: 390 / 560 });
    expect(screen.getByRole('button', { name: 'Get started' })).toBeOnTheScreen();
  });

  it('wide portrait: the wall over the top 60%, copy in a centred column', async () => {
    windowOf(834, 1194);
    await render(<Welcome />);
    expect(style('welcome-wall')).toMatchObject({ height: '60%' });
    expect(screen.getByRole('button', { name: 'Get started' })).toBeOnTheScreen();
  });

  it('wide landscape: the wall on the left, copy beside it', async () => {
    windowOf(1194, 834);
    await render(<Welcome />);
    expect(style('welcome-wall')).toMatchObject({ flex: 1 });
    expect(screen.getByRole('button', { name: 'Get started' })).toBeOnTheScreen();
  });
});
