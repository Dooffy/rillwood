// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { minTouch, palettes, radii } from '@/theme';

import { IconButton } from './IconButton';

const colors = palettes.dark; // default palette outside the root layout's provider
const icon = { ios: 'plus', android: 'add' } as const;

describe('IconButton', () => {
  it('is a labelled round 44pt button', async () => {
    const onPress = jest.fn();
    await render(<IconButton icon={icon} label="Add" onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Add' });
    expect(button).toHaveStyle({ width: minTouch, height: minTouch, borderRadius: radii.pill });
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('uses the elevated surface by default and the accent for primary', async () => {
    await render(<IconButton icon={icon} label="Add" onPress={() => {}} />);
    expect(screen.getByRole('button')).toHaveStyle({ backgroundColor: colors.elevated });
    await render(<IconButton icon={icon} label="Play" variant="primary" onPress={() => {}} />);
    expect(screen.getByRole('button', { name: 'Play' })).toHaveStyle({ backgroundColor: colors.accent });
  });
});
