// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Keyboard } from 'react-native';

import { Button } from './Button';
import { Page } from './Page';

describe('Page', () => {
  it('lets the content take touches when idle', async () => {
    const onPress = jest.fn();
    await render(
      <Page form>
        <Button title="Go" onPress={onPress} />
      </Page>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Go' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('locks the whole page and dismisses the keyboard while busy', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    const onPress = jest.fn();
    await render(
      <Page form busy>
        <Button title="Example" onPress={onPress} />
      </Page>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Example' }));
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByTestId('page-content')).toHaveProp('pointerEvents', 'none');
    expect(screen.getByTestId('page-content')).toBeBusy();
    expect(dismiss).toHaveBeenCalled();
  });
});
