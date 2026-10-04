// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

import { Chips } from './Chips';

describe('Chips', () => {
  it('shows each fact and reads them as one line', async () => {
    await render(<Chips items={['2010', '12m', 'PG']} />);
    expect(screen.getByLabelText('2010, 12m, PG')).toBeOnTheScreen();
    expect(screen.getByText('12m')).toBeOnTheScreen();
  });

  it('renders nothing without facts', async () => {
    await render(<Chips items={[]} />);
    expect(screen.toJSON()).toBeNull();
  });
});
