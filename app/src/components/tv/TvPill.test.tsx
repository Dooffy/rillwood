// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { lastFocused } from './focus';
import { TvPills } from './TvPill';

const TYPES = [
  { value: 'all', label: 'All' },
  { value: 'movies', label: 'Movies' },
  { value: 'shows', label: 'Shows' },
] as const;

describe('TvPills', () => {
  it('marks the selected pill and reports a pick', async () => {
    const onChange = jest.fn();
    await render(<TvPills options={TYPES} value="movies" onChange={onChange} accessibilityLabel="Type" />);
    expect(screen.getByRole('button', { name: 'Movies' }).props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByRole('button', { name: 'All' }).props.accessibilityState).toMatchObject({ selected: false });
    await fireEvent.press(screen.getByRole('button', { name: 'Shows' }));
    expect(onChange).toHaveBeenCalledWith('shows');
  });

  it('a focused pill is remembered, so a menu opened from it hands focus back', async () => {
    const view = { requestTVFocus: jest.fn() };
    await render(<TvPills options={TYPES} value="all" onChange={() => {}} />);
    await fireEvent(screen.getByRole('button', { name: 'Shows' }), 'focus', { currentTarget: view });
    expect(lastFocused()).toBe(view);
  });
});
