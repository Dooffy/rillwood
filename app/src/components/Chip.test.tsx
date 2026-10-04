// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { Chip } from './Chip';

describe('Chip', () => {
  it('toggles as an option and reports its selected state', async () => {
    const onPress = jest.fn();
    await render(<Chip label="Movies" selected onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Movies', selected: true }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('reads as Remove when removable', async () => {
    await render(<Chip label="Animation" removable onPress={() => {}} />);
    expect(screen.getByRole('button', { name: 'Remove Animation' })).toBeOnTheScreen();
  });
});
