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

  it('grows for the player: large and xlarge', async () => {
    await render(<IconButton icon={icon} label="Pause" size="large" onPress={() => {}} />);
    expect(screen.getByRole('button', { name: 'Pause' })).toHaveStyle({ width: minTouch * 1.6 });
    await render(<IconButton icon={icon} label="Play" size="xlarge" onPress={() => {}} />);
    expect(screen.getByRole('button', { name: 'Play' })).toHaveStyle({ width: minTouch * 2, height: minTouch * 2 });
  });

  it('uses the elevated surface by default and the accent for primary', async () => {
    await render(<IconButton icon={icon} label="Add" onPress={() => {}} />);
    expect(screen.getByRole('button')).toHaveStyle({ backgroundColor: colors.elevated });
    await render(<IconButton icon={icon} label="Play" variant="primary" onPress={() => {}} />);
    expect(screen.getByRole('button', { name: 'Play' })).toHaveStyle({ backgroundColor: colors.accent });
  });

  it('draws no circle when plain (header buttons)', async () => {
    await render(
      <IconButton
        icon={{ ios: 'arrow.down', android: 'download' }}
        label="Download"
        variant="plain"
        onPress={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Download' })).not.toHaveStyle({
      backgroundColor: palettes.dark.elevated,
    });
  });
});
