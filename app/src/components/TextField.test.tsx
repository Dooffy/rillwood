// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { palettes } from '@/theme';

import { TextField } from './TextField';

const colors = palettes.dark;

describe('TextField', () => {
  it('is labelled and reports changes', async () => {
    const onChangeText = jest.fn();
    await render(<TextField label="Username" value="" onChangeText={onChangeText} />);
    expect(screen.getByText('Username')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Username'), 'anna');
    expect(onChangeText).toHaveBeenCalledWith('anna');
  });

  it('shows the error in the danger colour', async () => {
    await render(<TextField label="Server address" error="Enter a valid address" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid address');
    expect(screen.getByText('Enter a valid address')).toHaveStyle({ color: colors.danger });
  });

  it('has no error line without an error', async () => {
    await render(<TextField label="Server address" />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('hides secure input until toggled', async () => {
    await render(<TextField label="Password" secure />);
    expect(screen.getByLabelText('Password')).toHaveProp('secureTextEntry', true);
    await fireEvent.press(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password')).toHaveProp('secureTextEntry', false);
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeOnTheScreen();
  });

  it('has no toggle for plain fields', async () => {
    await render(<TextField label="Username" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
