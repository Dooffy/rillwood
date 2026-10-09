// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import type { BaseItemDto } from '@/api';
import * as control from '@/useDownloadControl';
import type { DownloadControl } from '@/useDownloadControl';

import { DownloadButton } from './DownloadButton';

const item: BaseItemDto = { Id: 'm', Name: 'Dune', Type: 'Movie' };
let state: DownloadControl;
const summary = (s: 'downloading' | 'paused' | 'done') => ({ state: s, progress: 0.4, ids: ['x'], itemIds: ['m'] });

beforeEach(() => {
  state = {
    available: true,
    summary: null,
    partial: false,
    starting: false,
    start: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    remove: jest.fn(),
  };
  jest.spyOn(control, 'useDownloadControl').mockImplementation(() => state);
});

describe('DownloadButton', () => {
  it('↓ starts the download', async () => {
    await render(<DownloadButton item={item} label="Download Season 1" />);
    await fireEvent.press(screen.getByRole('button', { name: 'Download Season 1' }));
    expect(state.start).toHaveBeenCalled();
  });

  it('a spinner while the files are looked up', async () => {
    state.starting = true;
    await render(<DownloadButton item={item} />);
    expect(screen.getByLabelText('Starting download')).toBeOnTheScreen();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('the ring pauses while downloading and resumes when paused', async () => {
    state.summary = summary('downloading');
    const { rerender } = await render(<DownloadButton item={item} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Pause download', value: { text: '40%' } }));
    expect(state.pause).toHaveBeenCalled();
    state = { ...state, summary: summary('paused') };
    await rerender(<DownloadButton item={item} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Resume download' }));
    expect(state.resume).toHaveBeenCalled();
  });

  it('a partial season shows ↓ for the rest unless something of it is downloading', async () => {
    state.summary = summary('paused');
    state.partial = true;
    const { rerender } = await render(<DownloadButton item={item} label="Download Season 1" />);
    await fireEvent.press(screen.getByRole('button', { name: 'Download Season 1' }));
    expect(state.start).toHaveBeenCalled();
    state = { ...state, summary: summary('downloading') };
    await rerender(<DownloadButton item={item} label="Download Season 1" />);
    expect(screen.getByRole('button', { name: 'Pause download' })).toBeOnTheScreen();
  });

  it('✓ once downloaded asks to delete', async () => {
    state.summary = summary('done');
    await render(<DownloadButton item={item} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Downloaded, delete download' }));
    expect(state.remove).toHaveBeenCalled();
  });
});
