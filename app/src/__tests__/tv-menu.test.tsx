// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV menus (roadmap TV task 4b): an ActionSheet draws in the app's own view, not an RN Modal.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { BackHandler, Platform, TVEventControl } from 'react-native';

import { ActionSheet } from '@/components/ActionSheet';
import { TvButton } from '@/components/tv/TvButton';
import { holdMenuKey } from '@/components/tv/focus';
import { TvMenuHost } from '@/components/tv/TvMenu';

const isTV = Object.getOwnPropertyDescriptor(Platform, 'isTV')!;
beforeEach(() => {
  Object.defineProperty(Platform, 'isTV', { get: () => true, configurable: true });
});
afterEach(() => {
  Object.defineProperty(Platform, 'isTV', isTV);
});

function sheet(visible: boolean, onClose = jest.fn(), onPress = jest.fn()) {
  return (
    <TvMenuHost>
      <ActionSheet
        visible={visible}
        title="Sintel · 2010"
        actions={[
          { label: 'Resume', onPress },
          { label: 'Cancel Download', destructive: true, onPress: jest.fn() },
        ]}
        onClose={onClose}
      />
    </TvMenuHost>
  );
}

describe('ActionSheet on Apple TV', () => {
  it('draws a TV menu in the app, no Modal, focus on the first action', async () => {
    await render(sheet(true));
    expect(screen.getByTestId('tv-menu')).toBeOnTheScreen();
    expect(screen.queryByTestId('action-sheet')).toBeNull();
    expect(screen.getByText('Sintel · 2010')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Resume' }).props.hasTVPreferredFocus).toBe(true);
    expect(screen.getByRole('button', { name: 'Cancel Download' }).props.hasTVPreferredFocus).toBeFalsy();
  });

  it('an action closes the menu, then runs', async () => {
    const onClose = jest.fn();
    const onPress = jest.fn();
    await render(sheet(true, onClose, onPress));
    await fireEvent.press(screen.getByRole('button', { name: 'Resume' }));
    expect(onClose).toHaveBeenCalled();
    expect(onPress).toHaveBeenCalled();
  });

  it('has no Cancel (Back closes it, like tvOS menus); hidden, nothing shows', async () => {
    const onClose = jest.fn();
    const view = await render(sheet(true, onClose));
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    await view.rerender(sheet(false, onClose));
    expect(screen.queryByTestId('tv-menu')).toBeNull();
  });

  it('keeps Done for a sheet that applies as it changes', async () => {
    const onClose = jest.fn();
    await render(
      <TvMenuHost>
        <ActionSheet visible title="Subtitle timing" closeLabel="Done" onClose={onClose} />
      </TvMenuHost>,
    );
    const done = screen.getByRole('button', { name: 'Done' });
    expect(done.props.hasTVPreferredFocus).toBe(true);
    await fireEvent.press(done);
    expect(onClose).toHaveBeenCalled();
  });

  it('takes the Menu key while open and gives it back when closed', async () => {
    const enable = jest.spyOn(TVEventControl, 'enableTVMenuKey');
    const disable = jest.spyOn(TVEventControl, 'disableTVMenuKey');
    const view = await render(sheet(true));
    expect(enable).toHaveBeenCalled();
    await view.rerender(sheet(false));
    expect(disable).toHaveBeenCalled();
    enable.mockRestore();
    disable.mockRestore();
  });
});

describe('focus back on the opener', () => {
  /** A button that opens a menu; its focus event carries a stand-in native view. */
  function Opener({ onPick = jest.fn() }: { onPick?: () => void }) {
    const [open, setOpen] = useState(false);
    return (
      <TvMenuHost>
        <TvButton title="More" onPress={() => setOpen(true)} />
        <ActionSheet
          visible={open}
          actions={[{ label: 'Mark Watched', onPress: onPick }]}
          onClose={() => setOpen(false)}
        />
      </TvMenuHost>
    );
  }
  const view = () => ({ requestTVFocus: jest.fn() });

  it('an action hands focus back to the button that opened the menu, before it runs', async () => {
    const opener = view();
    const onPick = jest.fn();
    await render(<Opener onPick={onPick} />);
    await fireEvent(screen.getByRole('button', { name: 'More' }), 'focus', { currentTarget: opener });
    await fireEvent.press(screen.getByRole('button', { name: 'More' }));
    // The menu's own buttons aren't remembered.
    await fireEvent(screen.getByRole('button', { name: 'Mark Watched' }), 'focus', { currentTarget: view() });
    await fireEvent.press(screen.getByRole('button', { name: 'Mark Watched' }));
    expect(opener.requestTVFocus).toHaveBeenCalledTimes(1);
    expect(opener.requestTVFocus.mock.invocationCallOrder[0]).toBeLessThan(onPick.mock.invocationCallOrder[0]);
    expect(screen.queryByTestId('tv-menu')).toBeNull();
  });

  it('Back closes the menu and hands focus back too', async () => {
    const back: (() => boolean)[] = [];
    const add = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_, handler) => {
      back.push(handler as () => boolean);
      return { remove: () => {} };
    });
    const opener = view();
    await render(<Opener />);
    await fireEvent(screen.getByRole('button', { name: 'More' }), 'focus', { currentTarget: opener });
    await fireEvent.press(screen.getByRole('button', { name: 'More' }));
    await act(() => {
      back.at(-1)!();
    });
    expect(opener.requestTVFocus).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('tv-menu')).toBeNull();
    add.mockRestore();
  });
});

describe('holdMenuKey', () => {
  it('counts holders: the key goes back to the system only when the last one lets go', () => {
    const enable = jest.spyOn(TVEventControl, 'enableTVMenuKey');
    const disable = jest.spyOn(TVEventControl, 'disableTVMenuKey');
    enable.mockClear();
    disable.mockClear();
    const screenHold = holdMenuKey();
    const menuHold = holdMenuKey();
    expect(enable).toHaveBeenCalledTimes(1);
    menuHold();
    menuHold();
    expect(disable).not.toHaveBeenCalled();
    screenHold();
    expect(disable).toHaveBeenCalledTimes(1);
    enable.mockRestore();
    disable.mockRestore();
  });
});
