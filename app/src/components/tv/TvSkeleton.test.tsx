// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV placeholders take the loaded content's paddings, gaps, card sizes and line heights, so nothing jumps.
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { act, render, screen, within } from '@testing-library/react-native';
import { Dimensions, Platform, StyleSheet } from 'react-native';

import { tv, type } from '@/theme';

import { CardPlaceholder, LandscapeCard } from '../Card';
import { fitCards } from '../Row';
import { CardRowPlaceholder, PosterGridPlaceholder } from '../Skeleton';
import { TextBone } from '../Text';
import { TvDetailPlaceholder, TvShelvesPlaceholder } from './TvSkeleton';
import { tvShelfListContent } from './TvShelf';

const isTV = Object.getOwnPropertyDescriptor(Platform, 'isTV')!;
const window = Dimensions.get('window');
beforeEach(async () => {
  Object.defineProperty(Platform, 'isTV', { get: () => true, configurable: true });
  await act(() => Dimensions.set({ window: { ...window, width: 1920, height: 1080 } }));
});
afterEach(async () => {
  Object.defineProperty(Platform, 'isTV', isTV);
  await act(() => Dimensions.set({ window }));
});

const style = (el: { props: { style?: unknown } }) => StyleSheet.flatten(el.props.style as never) ?? {};
const all = { includeHiddenElements: true };
/** The text style each line bone is as tall as (its hidden line). */
const boneFonts = (root?: ReturnType<typeof screen.getByTestId>) =>
  (root ? within(root) : screen)
    .getAllByTestId('text-bone', all)
    .map((b) => style(b.children[0] as never).fontSize as number);

describe('TV placeholders', () => {
  it('a text bone is a hidden line of the same text, the bar the font size tall', async () => {
    await render(<TextBone style={tv.type.shelf} width={300} />);
    const bone = screen.getByTestId('text-bone', all);
    expect(style(bone).width).toBe(300);
    expect(style(bone.children[0] as never)).toMatchObject({ ...tv.type.shelf, color: 'transparent' });
    expect(style(bone.children[1] as never).height).toBe(tv.type.shelf.fontSize);
  });

  it('a card stands in with the TV card text lines (title, subtitle), not phone caption bars', async () => {
    await render(<CardPlaceholder shape="landscape" width={400} />);
    expect(boneFonts()).toEqual([tv.type.cardTitle.fontSize, tv.type.small.fontSize]);
    const placeholder = style(screen.getByTestId('card-placeholder', all));
    // Same width and gap under the art as a loaded card.
    await render(<LandscapeCard title="A" subtitle="B" width={400} />);
    expect(style(screen.getByRole('button'))).toMatchObject({ width: placeholder.width, gap: placeholder.gap });
  });

  it('shelf and grid placeholders space cards like the shelf (TvShelf) and grid (PagedList)', async () => {
    await render(<CardRowPlaceholder shape="poster" count={3} label="Loading" />);
    expect(style(screen.getByLabelText('Loading')).gap).toBe(tv.shelf.gap);
    await render(<PosterGridPlaceholder columns={6} width={256} />);
    expect(style(screen.getByTestId('poster-grid-placeholder')).gap).toBe(tv.shelf.gap);
  });

  it('Library shelves: the shelf title and row in TvShelf paddings, whole TV posters across', async () => {
    await render(<TvShelvesPlaceholder rows={2} gap={tv.gap.lg} />);
    const root = screen.getByTestId('tv-shelves-placeholder');
    expect(style(root).gap).toBe(tv.gap.lg);
    const shelves = root.children as never[];
    expect(shelves).toHaveLength(2);
    const [title, row] = (shelves[0] as { children: never[] }).children;
    expect(style(title).paddingHorizontal).toBe(tv.margin);
    expect(boneFonts(title)[0]).toBe(tv.type.shelf.fontSize);
    expect(style(row)).toMatchObject(tvShelfListContent);
    const posters = fitCards(1920 - 2 * tv.margin, tv.shelf.posterWidth, 1, tv.shelf.gap);
    const cards = within(row).getAllByTestId('card-placeholder', all);
    expect(cards).toHaveLength(posters.count);
    expect(style(cards[0]).width).toBe(posters.width);
  });

  it('detail: the text column spaced like TvDetailScreen, one bone per line at its text size', async () => {
    await render(<TvDetailPlaceholder />);
    const text = screen.getByTestId('tv-detail-placeholder-text', all);
    expect(style(text)).toMatchObject({ marginLeft: tv.margin, maxWidth: tv.hero.textWidth, gap: tv.gap.sm / 2 });
    expect(style(text).width).toBeUndefined();
    // Title, subtitle, three summary lines + More, facts.
    const { body, caption, label, title } = tv.type;
    expect(boneFonts(text)).toEqual([
      title.fontSize,
      body.fontSize,
      body.fontSize,
      body.fontSize,
      body.fontSize,
      label.fontSize,
      caption.fontSize,
    ]);
  });
});

describe('phone placeholders stay as they were', () => {
  beforeEach(() => {
    Object.defineProperty(Platform, 'isTV', isTV);
  });

  it('cards: two caption-high bars, the phone card gap', async () => {
    await render(<CardRowPlaceholder shape="poster" count={3} label="Loading" />);
    expect(style(screen.getByLabelText('Loading')).gap).toBe(12);
    expect(screen.queryAllByTestId('text-bone', all)).toHaveLength(0);
    const lines = (screen.getAllByTestId('card-placeholder', all)[0].children as never[]).slice(1);
    expect(lines.map((l) => style(l).height)).toEqual([type.caption.fontSize, type.caption.fontSize]);
  });
});
