// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { TvTextField } from './TvTextField';

const input = () => screen.getByTestId('Server address input');

describe('TvTextField', () => {
  // Regressions: tvOS copies the typing field's font, colour and padding into its keyboard screen (tiny, off centre,
  // black letters). The typing field carries no style; the capsule we draw shows the text.
  it('types in a field with no style; the capsule shows the value', async () => {
    await render(<TvTextField label="Server address" placeholder="192.168.1.20:8096" value="demo.jellyfin.org" />);
    expect(input().props.style).toBeUndefined();
    expect(input().props.placeholderTextColor).toBeUndefined();
    expect(screen.getByRole('button', { name: 'Server address' })).toHaveTextContent('demo.jellyfin.org');
  });

  it('shows the placeholder when empty and dots for a password', async () => {
    const view = await render(<TvTextField label="Server address" placeholder="192.168.1.20:8096" value="" />);
    expect(screen.getByRole('button', { name: 'Server address' })).toHaveTextContent('192.168.1.20:8096');
    await view.rerender(<TvTextField label="Server address" secureTextEntry value="abc" />);
    expect(screen.getByRole('button', { name: 'Server address' })).toHaveTextContent('•••');
  });

  it('a click opens the keyboard: a new typing field with autoFocus', async () => {
    await render(<TvTextField label="Server address" value="" />);
    expect(input().props.autoFocus).toBe(false);
    await fireEvent.press(screen.getByRole('button', { name: 'Server address' }));
    expect(input().props.autoFocus).toBe(true);
  });

  it('not editable: the click does nothing', async () => {
    await render(<TvTextField label="Server address" value="" editable={false} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Server address' }));
    expect(input().props.autoFocus).toBe(false);
    expect(StyleSheet.flatten(input().props.style)).toBeUndefined();
  });
});
