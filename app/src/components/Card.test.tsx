// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import type { BaseItemDto } from '@/api';

import { CardPlaceholder, cardLabel, LANDSCAPE_WIDTH, LandscapeCard, POSTER_WIDTH, PosterCard } from './Card';

describe('cardLabel', () => {
  it.each([
    [{ title: 'Dune', subtitle: '2021' }, 'Dune, 2021'],
    [{ title: 'Dune', progress: 0.4 }, 'Dune, 40% watched'],
    [{ title: 'Dune', progress: 0.4, played: true }, 'Dune, watched'],
    [{ title: 'Dune', progress: 1 }, 'Dune'],
    [{ title: 'Dune', progress: 0.004 }, 'Dune, 1% watched'],
    [{ title: 'Dune', progress: 0.996 }, 'Dune, 99% watched'],
    [{ title: 'Dune', progress: 0.4, remainingSeconds: 1920 }, 'Dune, 40% watched, 32 minutes left'],
    [{ title: 'Dune', played: true, remainingSeconds: 1920 }, 'Dune, watched'],
  ])('%j → %s', (props, label) => {
    expect(cardLabel({ ...props, onPress: () => {} })).toBe(label);
  });
});

describe('PosterCard', () => {
  it('shows title + subtitle and opens on press', async () => {
    const onPress = jest.fn();
    await render(<PosterCard title="Dune" subtitle="2021" image="https://jf.example.com/i.jpg" onPress={onPress} />);
    expect(screen.getByText('Dune')).toBeOnTheScreen();
    expect(screen.getByText('2021')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Dune, 2021' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('long press (and the VoiceOver "More" action) opens the menu; no action without one', async () => {
    const onLongPress = jest.fn();
    const { rerender } = await render(<PosterCard title="Dune" onPress={() => {}} onLongPress={onLongPress} />);
    const card = screen.getByRole('button', { name: 'Dune' });
    await fireEvent(card, 'longPress');
    expect(card.props.accessibilityActions).toEqual([{ name: 'more', label: 'More' }]);
    await fireEvent(card, 'accessibilityAction', { nativeEvent: { actionName: 'more' } });
    expect(onLongPress).toHaveBeenCalledTimes(2);
    await rerender(<PosterCard title="Dune" onPress={() => {}} />);
    expect(screen.getByRole('button', { name: 'Dune' }).props.accessibilityActions).toBeUndefined();
  });

  it('shows a placeholder without an image', async () => {
    await render(<PosterCard title="Dune" onPress={() => {}} />);
    expect(screen.getByTestId('artwork-placeholder')).toBeOnTheScreen();
    expect(screen.queryByTestId('artwork-image')).toBeNull();
  });

  // Jellyfin answers 404 for a missing image type.
  it('falls back to the placeholder when the image fails', async () => {
    await render(<PosterCard title="Dune" image="https://jf.example.com/missing.jpg" onPress={() => {}} />);
    await fireEvent(screen.getByTestId('artwork-image'), 'error', { nativeEvent: { error: '404' } });
    expect(screen.getByTestId('artwork-placeholder')).toBeOnTheScreen();
  });

  it('shows "Watched" over the fade instead of progress', async () => {
    await render(<PosterCard title="Dune" played progress={0.5} onPress={() => {}} />);
    expect(screen.getByTestId('artwork-played')).toHaveTextContent('Watched');
    expect(screen.getByTestId('artwork-fade')).toBeOnTheScreen();
    expect(screen.queryByTestId('progress-bar')).toBeNull();
  });

  it('shows progress over the placeholder when the image is missing', async () => {
    await render(<PosterCard title="Dune" progress={0.5} onPress={() => {}} />);
    expect(screen.getByTestId('artwork-placeholder')).toBeOnTheScreen();
    expect(screen.getByTestId('progress-bar')).toBeOnTheScreen();
  });
});

describe('LandscapeCard', () => {
  it('shows the progress bar over the image while in progress', async () => {
    await render(<LandscapeCard title="Episode 3" subtitle="12 min left" progress={0.6} onPress={() => {}} />);
    expect(screen.getByTestId('progress-fill')).toHaveStyle({ width: '60%' });
    expect(screen.getByTestId('artwork-fade')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Episode 3, 12 min left, 60% watched' })).toBeOnTheScreen();
  });

  it('shows the time left after the bar', async () => {
    await render(<LandscapeCard title="Sintel" progress={0.4} remainingSeconds={1920} onPress={() => {}} />);
    expect(screen.getByText('32m')).toBeOnTheScreen();
  });

  it('has no progress bar when not started', async () => {
    await render(<LandscapeCard title="Episode 4" onPress={() => {}} />);
    expect(screen.queryByTestId('progress-bar')).toBeNull();
    expect(screen.queryByTestId('artwork-fade')).toBeNull();
  });
});

describe('CardPlaceholder', () => {
  it.each([
    ['poster', POSTER_WIDTH],
    ['landscape', LANDSCAPE_WIDTH],
  ] as ['poster' | 'landscape', number][])(
    '%s takes the card width and stays out of VoiceOver',
    async (shape, width) => {
      await render(<CardPlaceholder shape={shape} />);
      expect(screen.queryByTestId('card-placeholder')).toBeNull();
      expect(screen.getByTestId('card-placeholder', { includeHiddenElements: true })).toHaveStyle({ width });
    },
  );

  it('fills its parent for the hero', async () => {
    await render(<CardPlaceholder shape="landscape" width="100%" />);
    expect(screen.getByTestId('card-placeholder', { includeHiddenElements: true })).toHaveStyle({ width: '100%' });
  });
});

describe('item handlers', () => {
  it("passes the card's item to onOpen and onMenu (one stable handler per list)", async () => {
    const item: BaseItemDto = { Id: 'i1', Name: 'Dune', Type: 'Movie' };
    const onOpen = jest.fn();
    const onMenu = jest.fn();
    await render(<PosterCard title="Dune" item={item} onOpen={onOpen} onMenu={onMenu} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Dune' }));
    await fireEvent(screen.getByRole('button', { name: 'Dune' }), 'longPress');
    expect(onOpen).toHaveBeenCalledWith(item);
    expect(onMenu).toHaveBeenCalledWith(item);
  });

  it('onPress / onLongPress win over the item handlers', async () => {
    const onPress = jest.fn();
    const onOpen = jest.fn();
    await render(
      <PosterCard title="Dune" item={{ Id: 'i1', Name: 'Dune', Type: 'Movie' }} onOpen={onOpen} onPress={onPress} />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Dune' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });
});
