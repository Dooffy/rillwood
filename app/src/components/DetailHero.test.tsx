// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { DetailHero } from './DetailHero';

describe('DetailHero', () => {
  it('shows the text title, subtitle and art', async () => {
    await render(<DetailHero art="https://jf/a.jpg" title="Sintel" subtitle="Movie · Animation" />);
    expect(screen.getByRole('header', { name: 'Sintel' })).toBeOnTheScreen();
    expect(screen.getByText('Movie · Animation')).toBeOnTheScreen();
    expect(screen.getByTestId('detail-backdrop')).toBeOnTheScreen();
  });

  it('uses the logo as the title when given, and hides an empty subtitle', async () => {
    await render(<DetailHero logo="https://jf/l.png" title="Sintel" subtitle="" />);
    expect(screen.getByTestId('detail-logo')).toHaveProp('accessibilityLabel', 'Sintel');
    expect(screen.queryByText('Sintel')).toBeNull();
    expect(screen.queryByTestId('detail-backdrop')).toBeNull();
  });

  it('links to the parent series', async () => {
    const onPress = jest.fn();
    await render(<DetailHero title="Episode 2" subtitle="S1:E2" parent={{ name: 'Test Show', onPress }} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Test Show' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
