// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { NO_FILTERS } from '@/items';

import { FilterChips } from './FilterChips';

describe('FilterChips', () => {
  it('removes one filter, or clears them all', async () => {
    const onChange = jest.fn();
    const value = { ...NO_FILTERS, show: 'unwatched' as const, genres: ['Animation'] };
    await render(<FilterChips value={value} onChange={onChange} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Remove Animation' }));
    expect(onChange).toHaveBeenLastCalledWith({ ...value, genres: [] });
    await fireEvent.press(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onChange).toHaveBeenLastCalledWith(NO_FILTERS);
  });

  it('shows nothing without filters', async () => {
    await render(<FilterChips value={NO_FILTERS} onChange={() => {}} />);
    expect(screen.toJSON()).toBeNull();
  });
});
