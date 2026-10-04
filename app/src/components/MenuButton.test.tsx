// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { palettes } from '@/theme';

import { MenuButton } from './MenuButton';

const options = [
  { key: 'name', label: 'Name' },
  { key: 'year', label: 'Year' },
] as const;

describe('MenuButton', () => {
  it('opens its sheet with the current choice and picks another', async () => {
    const onChange = jest.fn();
    await render(
      <MenuButton
        icon={{ ios: 'arrow.up.arrow.down', android: 'sort' }}
        label="Sort: Name"
        title="Sort by"
        options={options}
        value="name"
        onChange={onChange}
      />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Sort: Name' }));
    expect(screen.getByText('Sort by')).toBeOnTheScreen();
    expect(screen.getByRole('menuitem', { name: 'Name', selected: true })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Year' }));
    expect(onChange).toHaveBeenCalledWith('year');
  });

  it('fills the button when active', async () => {
    await render(
      <MenuButton
        icon={{ ios: 'line.3.horizontal.decrease', android: 'filter_list' }}
        label="Filter: Unwatched"
        title="Show"
        options={options}
        value="year"
        onChange={() => {}}
        active
      />,
    );
    expect(screen.getByRole('button', { name: 'Filter: Unwatched' })).toHaveStyle({
      backgroundColor: palettes.dark.accent,
    });
  });
});
