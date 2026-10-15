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

  // Regression: "Audio" broke to "Audi / o" next to a long value.
  it('keeps the label whole beside a value; the value truncates', async () => {
    await render(<ListRow label="Audio" value="Surround 7.1 - English - AAC - 5.1 - Default" />);
    expect(screen.getByText('Audio')).toHaveStyle({ flexShrink: 0 });
    expect(screen.getByText('Surround 7.1 - English - AAC - 5.1 - Default')).toHaveProp('numberOfLines', 1);
  });

  it('lets a label without a value wrap', async () => {
    await render(<ListRow label="a very long recent search" onPress={() => {}} />);
    expect(screen.getByText('a very long recent search')).toHaveStyle({ flexShrink: 1 });
  });

  it('keeps rows without onPress read-only', async () => {
    await render(<ListRow label="Version" value="0.1.0" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
