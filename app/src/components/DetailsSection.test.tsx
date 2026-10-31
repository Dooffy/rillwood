// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import type { BaseItemDto } from '@/api';
import { detailView } from '@/detail';

import { PHONE, resetDevice, setDevice, TABLET_LANDSCAPE, TABLET_PORTRAIT } from '@/testDevice';

import { DetailsSection } from './DetailsSection';

// No account: the item has no download group (its Download row is the downloads store's, tested there).
jest.mock('@/useDownloadControl', () => ({ useDownloadGroup: () => null }));

const movie: BaseItemDto = {
  Id: 'm',
  Name: 'Glass Orbit',
  Type: 'Movie',
  Overview: 'An engineer wakes alone after a debris strike.',
  Taglines: ['Nine hours of air. One way home.'],
  OfficialRating: 'PG-13',
  RunTimeTicks: 80_400_000_000,
  MediaSources: [
    {
      Id: 'ms',
      Name: "Director's Cut",
      Container: 'mkv,webm',
      Size: 4_200_000_000,
      MediaStreams: [
        { Type: 'Video', Index: 0, DisplayTitle: '1080p H264 SDR', Width: 1920, Height: 1080 },
        {
          Type: 'Audio',
          Index: 1,
          DisplayTitle: 'English - AAC - 5.1',
          IsDefault: true,
          Channels: 6,
        },
        { Type: 'Subtitle', Index: 2, Language: 'eng', IsHearingImpaired: true },
      ],
    },
    { Id: 'ms2', Name: 'Theatrical' },
  ],
};

afterEach(resetDevice);

describe('DetailsSection', () => {
  it('shows About with the tagline and whole overview, Information, Languages, Media and Accessibility', async () => {
    await render(<DetailsSection item={movie} view={detailView(movie)} />);
    for (const name of ['About', 'Information', 'Media', 'Accessibility']) {
      expect(screen.getByRole('header', { name })).toBeOnTheScreen();
    }
    expect(screen.getByText('Nine hours of air. One way home.')).toBeOnTheScreen();
    expect(screen.getByText('An engineer wakes alone after a debris strike.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Rated, PG-13')).toBeOnTheScreen();
    expect(screen.getByText('Video')).toBeOnTheScreen();
    expect(screen.getByText('Version (2)')).toBeOnTheScreen();
    expect(screen.getByText("Director's Cut")).toBeOnTheScreen();
    expect(screen.getByText('4.2 GB MKV')).toBeOnTheScreen();
  });

  it('leaves out sections without data', async () => {
    const plain: BaseItemDto = { Id: 'p', Name: 'P', Type: 'Movie', Overview: 'Home video.' };
    await render(<DetailsSection item={plain} view={detailView(plain)} />);
    expect(screen.getByRole('header', { name: 'About' })).toBeOnTheScreen();
    for (const name of ['Information', 'Production', 'On Your Server', 'Media', 'Accessibility']) {
      expect(screen.queryByRole('header', { name })).toBeNull();
    }
  });

  it('puts Information beside Production on big tablet windows, one above the other elsewhere', async () => {
    const direction = () => StyleSheet.flatten(screen.getByTestId('details-columns').props.style).flexDirection;
    await setDevice(...TABLET_LANDSCAPE);
    await render(<DetailsSection item={movie} view={detailView(movie)} />);
    expect(direction()).toBe('row');
    await setDevice(...TABLET_PORTRAIT);
    expect(direction()).toBeUndefined();
    await setDevice(...PHONE);
    expect(direction()).toBeUndefined();
  });

  it('draws nothing when there is nothing to tell', async () => {
    const bare: BaseItemDto = { Id: 'x', Name: 'X', Type: 'Movie' };
    await render(<DetailsSection item={bare} view={detailView(bare)} />);
    expect(screen.queryByTestId('details')).toBeNull();
  });
});
