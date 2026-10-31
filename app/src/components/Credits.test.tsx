// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

import { Credits } from './Credits';

const credits = [
  { label: 'Starring', names: ['Mara Vell', 'Ilan Ross'] },
  { label: 'Director', names: ['Jun Aldren'] },
];

describe('Credits', () => {
  it('shows a label over its names in a column, read as one line each', async () => {
    await render(<Credits credits={credits} />);
    expect(screen.getByLabelText('Starring: Mara Vell, Ilan Ross')).toBeOnTheScreen();
    expect(screen.getByLabelText('Director: Jun Aldren')).toBeOnTheScreen();
  });

  it('draws nothing without credits', async () => {
    await render(<Credits credits={[]} />);
    expect(screen.queryByTestId('credits')).toBeNull();
  });
});
