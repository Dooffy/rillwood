// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { TabsSidebar } from './TabsSidebar';

jest.mock('expo-router', () => ({ router: { navigate: jest.fn() }, usePathname: jest.fn() }));

const { router, usePathname } = jest.requireMock<{ router: { navigate: jest.Mock }; usePathname: jest.Mock }>(
  'expo-router',
);

describe('TabsSidebar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    usePathname.mockReturnValue('/library');
  });

  it('lists the tabs in order and marks the current one', async () => {
    await render(<TabsSidebar />);
    expect(screen.getAllByRole('tab').map((t) => t.props.accessibilityLabel)).toEqual(['Home', 'Library', 'Downloads']);
    expect(screen.getByRole('tab', { name: 'Library', selected: true })).toBeOnTheScreen();
    expect(screen.getAllByRole('tab', { selected: true })).toHaveLength(1);
  });

  it('keeps the tab selected while a screen is pushed over the tabs', async () => {
    const { rerender } = await render(<TabsSidebar />);
    usePathname.mockReturnValue('/item/sintel');
    await rerender(<TabsSidebar />);
    expect(screen.getByRole('tab', { name: 'Library', selected: true })).toBeOnTheScreen();
  });

  it('switches tabs', async () => {
    await render(<TabsSidebar />);
    await fireEvent.press(screen.getByRole('tab', { name: 'Downloads' }));
    expect(router.navigate).toHaveBeenCalledWith('/downloads');
  });
});
