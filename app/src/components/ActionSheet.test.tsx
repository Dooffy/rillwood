// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { ActionSheet } from './ActionSheet';
import { Text } from './Text';

describe('ActionSheet', () => {
  it('shows the title and actions; a pick closes the sheet, then runs once it is gone', async () => {
    const onClose = jest.fn();
    const onPick = jest.fn();
    const sheet = (visible: boolean) => (
      <ActionSheet
        visible={visible}
        title="S2, E3 · Pilot"
        actions={[
          { label: 'Season 1', detail: 'Watched', selected: false, onPress: () => {} },
          { label: 'Season 2', detail: '5 unwatched', selected: true, onPress: onPick },
        ]}
        onClose={onClose}
      />
    );
    const { rerender } = await render(sheet(true));
    expect(screen.getByText('S2, E3 · Pilot')).toBeOnTheScreen();
    expect(screen.getByRole('menuitem', { name: 'Season 1, Watched', selected: false })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Season 2, 5 unwatched', selected: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
    // iOS: another screen can't open while this one is still closing.
    expect(onPick).not.toHaveBeenCalled();
    await rerender(sheet(false));
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it('content over the actions, with its own close label', async () => {
    const onClose = jest.fn();
    await render(
      <ActionSheet visible title="Subtitle timing" closeLabel="Done" onClose={onClose}>
        <Text>Slider</Text>
      </ActionSheet>,
    );
    expect(screen.getByText('Slider')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    expect(screen.queryByTestId('action-sheet-list')).toBeNull();
  });

  it('closes on Cancel and on the backdrop', async () => {
    const onClose = jest.fn();
    await render(<ActionSheet visible actions={[]} onClose={onClose} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('renders nothing while hidden', async () => {
    await render(
      <ActionSheet visible={false} actions={[{ label: 'Download', onPress: () => {} }]} onClose={() => {}} />,
    );
    expect(screen.queryByText('Download')).toBeNull();
  });

  // Regression: a long list (subtitles in landscape) ran off the top of the screen and couldn't be reached.
  it('long lists scroll inside the sheet; the title stays put', async () => {
    const actions = Array.from({ length: 30 }, (_, i) => ({ label: `Track ${i + 1}`, onPress: () => {} }));
    await render(<ActionSheet visible title="Subtitles" actions={actions} onClose={() => {}} />);
    const list = screen.getByTestId('action-sheet-list');
    expect(within(list).getByRole('menuitem', { name: 'Track 30' })).toBeOnTheScreen();
    expect(within(list).queryByText('Subtitles')).toBeNull();
  });
});
