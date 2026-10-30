// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import type { BaseItemDto } from '@/api';
import { detailView } from '@/detail';
import { PHONE, resetDevice, setDevice, TABLET_PORTRAIT } from '@/testDevice';

import { DetailsSection } from './DetailsSection';

// No account: the item has no download group (its Download row is the downloads store's, tested there).
jest.mock('@/useDownloadControl', () => ({ useDownloadGroup: () => null }));

afterEach(resetDevice);

const movie: BaseItemDto = {
  Id: 'm',
  Name: 'Glass Orbit',
  Type: 'Movie',
  Overview: 'An engineer wakes alone after a debris strike.',
  MediaSources: [
    {
      Id: 'ms',
      Name: "Director's Cut",
      Container: 'mkv,webm',
      Size: 4_200_000_000,
      MediaStreams: [
        { Type: 'Video', Index: 0, DisplayTitle: '1080p H264 SDR', Width: 1920, Height: 1080 },
        { Type: 'Audio', Index: 1, DisplayTitle: 'English - AAC - 5.1', IsDefault: true, Channels: 6 },
      ],
    },
    { Id: 'ms2', Name: 'Theatrical' },
  ],
};

describe('DetailsSection', () => {
  it('shows About with the whole overview, then the tracks, version and file', async () => {
    await render(<DetailsSection item={movie} view={detailView(movie)} />);
    expect(screen.getByRole('header', { name: 'Details' })).toBeOnTheScreen();
    expect(screen.getByText('An engineer wakes alone after a debris strike.')).toBeOnTheScreen();
    expect(screen.getByText('Video')).toBeOnTheScreen();
    expect(screen.getByText('Audio')).toBeOnTheScreen();
    expect(screen.getByText('Version (2)')).toBeOnTheScreen();
    expect(screen.getByText("Director's Cut")).toBeOnTheScreen();
    expect(screen.getByText('4.2 GB MKV')).toBeOnTheScreen();
  });

  it('puts About and Media side by side on tablets, one above the other on phones', async () => {
    const direction = () => StyleSheet.flatten(screen.getByTestId('details-columns').props.style).flexDirection;
    await setDevice(...PHONE);
    await render(<DetailsSection item={movie} view={detailView(movie)} />);
    expect(direction()).toBeUndefined();
    await setDevice(...TABLET_PORTRAIT);
    expect(direction()).toBe('row');
  });

  it('draws nothing when there is nothing to tell', async () => {
    const bare: BaseItemDto = { Id: 'x', Name: 'X', Type: 'Movie' };
    await render(<DetailsSection item={bare} view={detailView(bare)} />);
    expect(screen.queryByTestId('details')).toBeNull();
  });
});
