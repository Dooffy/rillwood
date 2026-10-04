// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { Text } from './Text';
import { Row } from './Row';

describe('Row', () => {
  it('renders the header and its cards', async () => {
    await render(
      <Row title="Recently Added">
        <Text>Dune</Text>
        <Text>Arrival</Text>
      </Row>,
    );
    expect(screen.getByRole('header', { name: 'Recently Added' })).toBeOnTheScreen();
    expect(screen.getByText('Dune')).toBeOnTheScreen();
    expect(screen.getByText('Arrival')).toBeOnTheScreen();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('makes the header a button when it opens the full list', async () => {
    const onPress = jest.fn();
    await render(
      <Row title="Continue Watching" onPress={onPress}>
        <Text>Episode 3</Text>
      </Row>,
    );
    expect(screen.getByText('See All')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Continue Watching, See All' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
