// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { Hero } from './Hero';

describe('Hero', () => {
  it('reads eyebrow, title and progress, and opens on press', async () => {
    const onPress = jest.fn();
    await render(
      <Hero
        eyebrow="Continue Watching"
        title="Sintel"
        subtitle="2010"
        image="https://jf.example.com/bd.jpg"
        progress={0.25}
        remainingSeconds={600}
        onPress={onPress}
      />,
    );
    expect(screen.getByText('Continue Watching')).toBeOnTheScreen();
    expect(screen.getByText('10m')).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Continue Watching, Sintel, 2010, 25% watched, 10 minutes left' }),
    );
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows the artwork placeholder without an image', async () => {
    await render(<Hero eyebrow="Up Next" title="Test Show" onPress={() => {}} />);
    expect(screen.getByTestId('artwork-placeholder')).toBeOnTheScreen();
  });
});
