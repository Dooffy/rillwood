// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { SearchField } from './SearchField';

describe('SearchField', () => {
  it('types, submits and clears', async () => {
    const onChangeText = jest.fn();
    const onSubmit = jest.fn();
    const { rerender } = await render(<SearchField value="" onChangeText={onChangeText} onSubmit={onSubmit} />);
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Search'), 'sin');
    expect(onChangeText).toHaveBeenLastCalledWith('sin');
    await rerender(<SearchField value="sin" onChangeText={onChangeText} onSubmit={onSubmit} />);
    await fireEvent(screen.getByLabelText('Search'), 'submitEditing');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Clear search' }));
    expect(onChangeText).toHaveBeenLastCalledWith('');
  });
});
