// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { minTouch, palettes, radii } from '@/theme';

import { Button } from './Button';

const colors = palettes.dark; // default palette outside the root layout's provider

describe('Button', () => {
  it('calls onPress', async () => {
    const onPress = jest.fn();
    await render(<Button title="Sign in" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('meets the minimum touch target and uses the accent colours', async () => {
    await render(<Button title="Sign in" onPress={() => {}} />);
    expect(screen.getByRole('button')).toHaveStyle({
      minHeight: minTouch,
      borderRadius: radii.pill,
      backgroundColor: colors.accent,
    });
    expect(screen.getByText('Sign in')).toHaveStyle({ color: colors.onAccent });
  });

  it('uses the elevated surface for secondary', async () => {
    await render(<Button title="Cancel" variant="secondary" onPress={() => {}} />);
    expect(screen.getByRole('button')).toHaveStyle({ backgroundColor: colors.elevated });
    expect(screen.getByText('Cancel')).toHaveStyle({ color: colors.text });
  });

  it('ignores presses when disabled', async () => {
    const onPress = jest.fn();
    await render(<Button title="Sign in" disabled onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('shows a spinner instead of the title while loading and ignores presses', async () => {
    const onPress = jest.fn();
    await render(<Button title="Sign in" loading onPress={onPress} />);
    expect(screen.queryByText('Sign in')).toBeNull();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeBusy();
    await fireEvent.press(screen.getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });
});
