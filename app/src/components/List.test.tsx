// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

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

  it('makes rows with onPress tappable buttons', async () => {
    const onPress = jest.fn();
    await render(<ListRow label="Accounts" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Accounts' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('keeps rows without onPress read-only', async () => {
    await render(<ListRow label="Version" value="0.1.0" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
