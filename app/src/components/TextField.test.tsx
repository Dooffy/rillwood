// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { palettes } from '@/theme';

import { repairSecureEdit, TextField } from './TextField';

const colors = palettes.dark;

describe('TextField', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

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

  it('dims and locks the show / hide toggle when not editable', async () => {
    await render(<TextField label="Password" secure editable={false} />);
    expect(screen.getByRole('button', { name: 'Show password' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password')).toHaveProp('secureTextEntry', true);
  });

  it('has no toggle for plain fields', async () => {
    await render(<TextField label="Username" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  // Regression: after a failed sign-in, refocusing the password and typing wiped it on iOS - typos couldn't be fixed.
  it('keeps a hidden password when iOS wipes it on the first keystroke after refocus', async () => {
    const onChangeText = jest.fn();
    await render(<TextField label="Password" secure value="secrt" onChangeText={onChangeText} />);
    const field = screen.getByLabelText('Password');
    await fireEvent(field, 'focus');
    await fireEvent.changeText(field, 'x');
    expect(onChangeText).toHaveBeenLastCalledWith('secrtx');
    await fireEvent.changeText(field, 'ab');
    expect(onChangeText).toHaveBeenLastCalledWith('ab');
  });

  // Regression: autofill after refocus was appended to the old text ("secrt" + "secret").
  it('keeps an autofilled password after refocus as is', async () => {
    const onChangeText = jest.fn();
    await render(<TextField label="Password" secure value="secrt" onChangeText={onChangeText} />);
    await fireEvent(screen.getByLabelText('Password'), 'focus');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'secret');
    expect(onChangeText).toHaveBeenLastCalledWith('secret');
  });

  it('still calls its own onFocus', async () => {
    const onFocus = jest.fn();
    await render(<TextField label="Password" secure value="secrt" onFocus={onFocus} />);
    await fireEvent(screen.getByLabelText('Password'), 'focus');
    expect(onFocus).toHaveBeenCalledTimes(1);
  });

  it('does not repair on Android (no wipe there)', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const onChangeText = jest.fn();
    await render(<TextField label="Password" secure value="secrt" onChangeText={onChangeText} />);
    await fireEvent(screen.getByLabelText('Password'), 'focus');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'x');
    expect(onChangeText).toHaveBeenLastCalledWith('x');
  });

  // Regression: the repair didn't follow the show / hide toggle while the field kept focus.
  it('repairs after the password is hidden again while focused', async () => {
    const onChangeText = jest.fn();
    await render(<TextField label="Password" secure value="secrt" onChangeText={onChangeText} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Show password' }));
    await fireEvent(screen.getByLabelText('Password'), 'focus');
    await fireEvent.press(screen.getByRole('button', { name: 'Hide password' }));
    await fireEvent.changeText(screen.getByLabelText('Password'), 'x');
    expect(onChangeText).toHaveBeenLastCalledWith('secrtx');
  });

  it('stops repairing once the password is shown while focused', async () => {
    const onChangeText = jest.fn();
    await render(<TextField label="Password" secure value="secrt" onChangeText={onChangeText} />);
    await fireEvent(screen.getByLabelText('Password'), 'focus');
    await fireEvent.press(screen.getByRole('button', { name: 'Show password' }));
    await fireEvent.changeText(screen.getByLabelText('Password'), 'x');
    expect(onChangeText).toHaveBeenLastCalledWith('x');
  });

  it('leaves plain fields alone', async () => {
    const onChangeText = jest.fn();
    await render(<TextField label="Username" value="anna" onChangeText={onChangeText} />);
    await fireEvent(screen.getByLabelText('Username'), 'focus');
    await fireEvent.changeText(screen.getByLabelText('Username'), 'b');
    expect(onChangeText).toHaveBeenLastCalledWith('b');
  });

  it('leaves a shown password alone', async () => {
    const onChangeText = jest.fn();
    await render(<TextField label="Password" secure value="secrt" onChangeText={onChangeText} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Show password' }));
    await fireEvent(screen.getByLabelText('Password'), 'focus');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'b');
    expect(onChangeText).toHaveBeenLastCalledWith('b');
  });
});

describe('repairSecureEdit', () => {
  it.each([
    ['', 'a', 'a'],
    ['abc', 'abcd', 'abcd'],
    ['abc', 'd', 'abcd'],
    ['a', 'a', 'aa'],
    ['abc', 'xyz', 'xyz'],
    ['abc', '', 'ab'],
  ])('%j + %j → %j', (previous, next, expected) => {
    expect(repairSecureEdit(previous, next)).toBe(expected);
  });
});
