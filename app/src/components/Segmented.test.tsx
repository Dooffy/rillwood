// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { Segmented } from './Segmented';

const options = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
] as const;

describe('Segmented', () => {
  it('marks the selected option and reports changes', async () => {
    const onChange = jest.fn();
    await render(<Segmented options={options} value="a" onChange={onChange} />);
    expect(screen.getByRole('radio', { name: 'Alpha' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Beta' })).not.toBeChecked();
    await fireEvent.press(screen.getByRole('radio', { name: 'Beta' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });
});
