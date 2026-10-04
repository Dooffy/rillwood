// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { Screen } from './Screen';
import { Text } from './Text';

describe('Screen', () => {
  it('shows the title as a header and the right-hand buttons', async () => {
    await render(<Screen title="Home" right={<Text>avatar</Text>} />);
    expect(screen.getByRole('header', { name: 'Home' })).toBeOnTheScreen();
    expect(screen.getByText('avatar')).toBeOnTheScreen();
  });

  it('makes the title a menu button when it has onTitlePress', async () => {
    const onTitlePress = jest.fn();
    await render(<Screen title="Movies" onTitlePress={onTitlePress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Movies' }));
    expect(onTitlePress).toHaveBeenCalledTimes(1);
  });
});
