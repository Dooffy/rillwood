// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

import {
  DetailPlaceholder,
  EpisodeCardsPlaceholder,
  EpisodeRowsPlaceholder,
  PosterGridPlaceholder,
  PosterRowsPlaceholder,
} from './Skeleton';

describe('Skeleton placeholders', () => {
  it.each([
    ['detail', <DetailPlaceholder key="d" />, 'detail-placeholder', 'Loading'],
    ['episode cards', <EpisodeCardsPlaceholder key="c" />, 'episodes-placeholder', 'Loading episodes'],
    ['episode rows', <EpisodeRowsPlaceholder key="r" />, 'episode-rows-placeholder', 'Loading'],
    ['poster rows', <PosterRowsPlaceholder key="p" />, 'poster-rows-placeholder', 'Loading'],
    ['poster grid', <PosterGridPlaceholder key="g" columns={3} width={100} />, 'poster-grid-placeholder', 'Loading'],
  ])('%s: one "Loading" element for screen readers, its shapes hidden', async (_, ui, testID, label) => {
    await render(ui);
    const placeholder = screen.getByTestId(testID);
    expect(placeholder).toHaveProp('accessibilityLabel', label);
    expect(screen.getAllByLabelText(label)).toHaveLength(1);
  });
});
