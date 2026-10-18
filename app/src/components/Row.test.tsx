// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { Text } from './Text';
import { CARD_GAP, fitCards, Row } from './Row';

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

  it('adds a See All button beside the header when it opens the full list (the title stays a header)', async () => {
    const onPress = jest.fn();
    await render(
      <Row title="Continue Watching" onPress={onPress}>
        <Text>Episode 3</Text>
      </Row>,
    );
    expect(screen.getByRole('header', { name: 'Continue Watching' })).toBeOnTheScreen();
    expect(screen.getByText('See All')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Continue Watching, See All' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('fitCards', () => {
  it('fits as many whole cards as stay at least the target wide, the row ending on a card edge', () => {
    // iPad portrait row (802): 5 posters; landscape beside the sidebar (902): 6.
    expect(fitCards(802, 140)).toEqual({ count: 5, width: 150 });
    expect(fitCards(902, 140)).toEqual({ count: 6, width: 140 });
    const { count, width } = fitCards(802, 220);
    expect(count * width + (count - 1) * CARD_GAP).toBeLessThanOrEqual(802);
    expect(width).toBeGreaterThanOrEqual(220);
  });

  it('keeps the minimum count, narrower, when the row is too small', () => {
    // Phone grid (358): 3 columns of 111, not 2 of 140+.
    expect(fitCards(358, 140, 3)).toEqual({ count: 3, width: 111 });
    expect(fitCards(100, 220)).toEqual({ count: 1, width: 100 });
  });
});
