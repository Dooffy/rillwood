// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { EpisodeCard, OVERVIEW_LINE_HEIGHT, OVERVIEW_LINES } from './EpisodeCard';

const handlers = () => ({ onPress: jest.fn(), onPlay: jest.fn(), onMore: jest.fn() });

describe('EpisodeCard', () => {
  it('opens on tap, plays from ▶, shows more on ⋯ and on long press', async () => {
    const h = handlers();
    await render(<EpisodeCard episode={3} title="Pilot" overview="It begins." runtimeSeconds={2700} {...h} />);
    expect(screen.getByText('EPISODE 3')).toBeOnTheScreen();
    expect(screen.getByText('It begins.')).toBeOnTheScreen();
    expect(screen.getByText('45m')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Episode 3, Pilot' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Play Episode 3, Pilot' }));
    await fireEvent.press(screen.getByRole('button', { name: 'More for Episode 3, Pilot' }));
    await fireEvent(screen.getByRole('button', { name: 'Episode 3, Pilot' }), 'longPress');
    expect(h.onPress).toHaveBeenCalledTimes(1);
    expect(h.onPlay).toHaveBeenCalledTimes(1);
    expect(h.onMore).toHaveBeenCalledTimes(2);
  });

  it('shows time left while in progress and resumes', async () => {
    await render(
      <EpisodeCard
        episode={3}
        title="Pilot"
        progress={0.3}
        remainingSeconds={1920}
        runtimeSeconds={2700}
        {...handlers()}
      />,
    );
    expect(screen.getByText('32m left')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Resume Episode 3, Pilot, 32 minutes left' })).toBeOnTheScreen();
  });

  it('says watched when played', async () => {
    await render(<EpisodeCard episode={1} title="Pilot" played runtimeSeconds={2700} {...handlers()} />);
    expect(screen.getByText('Watched')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Episode 1, Pilot, watched' })).toBeOnTheScreen();
  });

  it('offers Play and More as VoiceOver actions on the card', async () => {
    const h = handlers();
    await render(<EpisodeCard episode={3} title="Pilot" progress={0.3} remainingSeconds={1920} {...h} />);
    const card = screen.getByRole('button', { name: 'Episode 3, Pilot' });
    expect(card.props.accessibilityActions).toEqual([
      { name: 'play', label: 'Resume' },
      { name: 'more', label: 'More' },
    ]);
    await fireEvent(card, 'accessibilityAction', { nativeEvent: { actionName: 'play' } });
    await fireEvent(card, 'accessibilityAction', { nativeEvent: { actionName: 'more' } });
    expect(h.onPlay).toHaveBeenCalledTimes(1);
    expect(h.onMore).toHaveBeenCalledTimes(1);
  });

  it('shows ♥ for a favourite and reads it out', async () => {
    await render(<EpisodeCard episode={1} title="Pilot" played favourite runtimeSeconds={2700} {...handlers()} />);
    expect(screen.getByRole('button', { name: 'Episode 1, Pilot, watched, favourite' })).toBeOnTheScreen();
  });

  it('keeps two overview lines: a short one leaves one free, a long one ends with an ellipsis', async () => {
    await render(<EpisodeCard episode={1} title="Pilot" overview="It begins." {...handlers()} />);
    const overview = screen.getByText('It begins.');
    expect(OVERVIEW_LINES).toBe(2);
    expect(overview.props.numberOfLines).toBe(2);
    expect(overview).toHaveStyle({ minHeight: OVERVIEW_LINE_HEIGHT * 2 });
  });

  it('reserves no overview lines when the season has no overviews', async () => {
    await render(<EpisodeCard episode={1} title="Pilot" overview="It begins." overviewLines={false} {...handlers()} />);
    expect(screen.queryByText('It begins.')).toBeNull();
  });
});
