// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

import type { PersonDto } from '@/api';

import { CastRow } from './CastRow';

jest.mock('@/session', () => ({ useSession: () => ({ active: null }) }));

const person = (i: number): PersonDto => ({ Id: `p${i}`, Name: `Person ${i}`, Type: 'Actor' });

describe('CastRow', () => {
  it('nothing without people', async () => {
    await render(<CastRow people={[]} />);
    expect(screen.queryByRole('header', { name: 'Cast & Crew' })).toBeNull();
  });

  it('draws the first people of a long cast, not all of them', async () => {
    await render(<CastRow people={Array.from({ length: 150 }, (_, i) => person(i))} />);
    expect(screen.getByRole('header', { name: 'Cast & Crew' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Person 0')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Person 149')).toBeNull();
  });
});
