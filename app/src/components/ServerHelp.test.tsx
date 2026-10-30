// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

import { STEP_NUMBER, WhereToFindServer } from './ServerHelp';

describe('WhereToFindServer', () => {
  it('shows the three numbered steps', async () => {
    await render(<WhereToFindServer />);
    expect(screen.getByRole('header', { name: 'Where do I find it?' })).toBeOnTheScreen();
    for (const n of ['1', '2', '3']) expect(screen.getByText(n)).toBeOnTheScreen();
  });

  it('keeps each number a circle beside multi-line text', async () => {
    await render(<WhereToFindServer />);
    for (const number of screen.getAllByTestId('step-number')) {
      expect(number).toHaveStyle({ width: STEP_NUMBER, height: STEP_NUMBER, alignSelf: 'flex-start' });
    }
  });
});
