// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import * as api from '@/api';
import { listItems, NO_FILTERS } from '@/items';
import * as session from '@/session';
import { palettes } from '@/theme';

import { FilterButton, FilterSheet } from './FilterSheet';

const server = { id: 'srv', url: 'https://jf.example.com', name: 'Home server', version: '12.1.0' };
let seq = 0;
const request = jest.spyOn(api, 'request');

beforeEach(() => {
  jest.clearAllMocks();
  const account = { id: `srv.u${++seq}`, server, userId: `u${seq}`, userName: 'anna', deviceId: 'dev' };
  jest.spyOn(session, 'useSession').mockImplementation(() => ({ accounts: [account], active: account }));
  jest.spyOn(session, 'getSession').mockImplementation(() => ({ accounts: [account], active: account }));
  jest.spyOn(session, 'connectionFor').mockImplementation((a) => ({
    baseUrl: a.server.url,
    deviceId: a.deviceId,
    token: 'tok',
    accountId: a.id,
  }));
  // Count: 11 without a genre, 1 with Animation.
  request.mockImplementation(
    (_c, _p, options) =>
      Promise.resolve({ Items: [], TotalRecordCount: options?.query?.genres ? 1 : 11 }) as Promise<never>,
  );
});

describe('FilterSheet', () => {
  it('edits a draft with a live count and applies it', async () => {
    const onApply = jest.fn();
    const onClose = jest.fn();
    await render(
      <FilterSheet
        visible
        value={NO_FILTERS}
        genres={['Animation', 'Fantasy']}
        onApply={onApply}
        onClose={onClose}
        countEndpoint={(draft) => listItems({ term: 's', scope: 'all', sort: 'name', filters: draft }, 0)}
      />,
    );
    expect(await screen.findByRole('button', { name: 'Show 11 Results' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Animation', selected: false }));
    await fireEvent.press(screen.getByRole('button', { name: 'Unwatched' }));
    await fireEvent.press(screen.getByRole('button', { name: '★ 7+' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Show 1 Result' })).toBeOnTheScreen());
    await fireEvent.press(screen.getByRole('button', { name: 'Show 1 Result' }));
    expect(onApply).toHaveBeenCalledWith({ ...NO_FILTERS, show: 'unwatched', genres: ['Animation'], minRating: 7 });
    expect(onClose).toHaveBeenCalled();
  });

  it('resets the draft and closes without applying', async () => {
    const onApply = jest.fn();
    const onClose = jest.fn();
    await render(
      <FilterSheet visible value={{ ...NO_FILTERS, only4K: true }} genres={[]} onApply={onApply} onClose={onClose} />,
    );
    expect(screen.getByRole('button', { name: '4K', selected: true })).toBeOnTheScreen();
    expect(screen.queryByText('GENRES')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Reset filters' }));
    expect(screen.getByRole('button', { name: '4K', selected: false })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Show Results' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Close filters' }));
    expect(onClose).toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });
});

describe('FilterButton', () => {
  it('fills and counts active filters', async () => {
    await render(<FilterButton value={{ ...NO_FILTERS, genres: ['Drama'], only4K: true }} onPress={() => {}} />);
    expect(screen.getByRole('button', { name: 'Filters, 2 on' })).toHaveStyle({
      backgroundColor: palettes.dark.accent,
    });
  });

  it('is plain without filters', async () => {
    await render(<FilterButton value={NO_FILTERS} onPress={() => {}} />);
    expect(screen.getByRole('button', { name: 'Filters' })).toBeOnTheScreen();
  });

  it('counts the applied filters right away when reopened (not the last draft)', async () => {
    const props = {
      genres: ['Animation'],
      onApply: jest.fn(),
      onClose: jest.fn(),
      countEndpoint: (draft: typeof NO_FILTERS) => listItems({ scope: 'all', sort: 'name', filters: draft }, 0),
    };
    const view = await render(<FilterSheet visible value={NO_FILTERS} {...props} />);
    expect(await screen.findByRole('button', { name: 'Show 11 Results' })).toBeOnTheScreen();
    await view.rerender(<FilterSheet visible={false} value={NO_FILTERS} {...props} />);
    // A tag added outside the sheet, then the sheet opens again.
    const animation = { ...NO_FILTERS, genres: ['Animation'] };
    await view.rerender(<FilterSheet visible value={animation} {...props} />);
    expect(request.mock.calls.at(-1)?.[2]?.query).toMatchObject({ genres: 'Animation', limit: 0 });
    expect(await screen.findByRole('button', { name: 'Show 1 Result' })).toBeOnTheScreen();
  });
});
