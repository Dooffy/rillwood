// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { palettes } from '@/theme';

import { ListRow, ListSection } from './List';

describe('List', () => {
  it('renders the section title and rows', async () => {
    await render(
      <ListSection title="Downloads">
        <ListRow label="Network" value="Wi-Fi only" />
      </ListSection>,
    );
    expect(screen.getByRole('header', { name: 'DOWNLOADS' })).toBeOnTheScreen();
    expect(screen.getByText('Network')).toBeOnTheScreen();
    expect(screen.getByText('Wi-Fi only')).toBeOnTheScreen();
  });

  it('shows a colour dot before the value', async () => {
    await render(<ListRow label="Colour" value="Yellow" swatch="#FFEB3B" onPress={() => {}} />);
    expect(screen.getByRole('button', { name: 'Colour' })).toHaveAccessibilityValue({ text: 'Yellow' });
    expect(JSON.stringify(screen.toJSON())).toContain('#FFEB3B');
  });

  it('makes rows with onPress tappable buttons', async () => {
    const onPress = jest.fn();
    await render(<ListRow label="Accounts" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Accounts' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('exposes the value of a tappable row to screen readers', async () => {
    await render(<ListRow label="Appearance" value="System" onPress={() => {}} />);
    expect(screen.getByRole('button', { name: 'Appearance' })).toHaveAccessibilityValue({ text: 'System' });
  });

  it('shows an active dot value in the primary colour, a muted one in grey', async () => {
    await render(
      <>
        <ListRow label="anna" value="Active" dot="active" />
        <ListRow label="ben" value="Signed out" dot="muted" />
      </>,
    );
    expect(screen.getByText('Active')).toHaveStyle({ color: palettes.dark.text });
    expect(screen.getByText('Signed out')).toHaveStyle({ color: palettes.dark.textSecondary });
  });

  it('keeps rows without onPress read-only', async () => {
    await render(<ListRow label="Version" value="0.1.0" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
