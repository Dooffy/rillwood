// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { StepSlider, stopAt } from './StepSlider';

const touch = (locationX: number) => ({ nativeEvent: { locationX } });
const STOPS = ['5 GB', '10 GB', '20 GB', 'No limit'];
const slider = (value: number, onChange = jest.fn()) => (
  <StepSlider
    count={STOPS.length}
    value={value}
    onChange={onChange}
    format={(i) => STOPS[i]}
    label="Limit"
    ends={['Low', 'High']}
  />
);

describe('stopAt', () => {
  it('rounds to the nearest stop, clamped to the track', () => {
    expect(stopAt(0, 300, 4)).toBe(0);
    expect(stopAt(140, 300, 4)).toBe(1);
    expect(stopAt(160, 300, 4)).toBe(2);
    expect(stopAt(400, 300, 4)).toBe(3);
    expect(stopAt(-20, 300, 4)).toBe(0);
  });

  it('is the first stop before layout or with one stop', () => {
    expect(stopAt(50, 0, 4)).toBe(0);
    expect(stopAt(50, 300, 1)).toBe(0);
  });
});

describe('StepSlider', () => {
  it('shows the value; − / + move one stop and stop at the ends', async () => {
    const onChange = jest.fn();
    await render(slider(0, onChange));
    expect(screen.getByText('5 GB')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Less' }));
    expect(onChange).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'More' }));
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  it('quick presses step from each other, not from a stale value', async () => {
    const onChange = jest.fn();
    await render(slider(0, onChange));
    await fireEvent.press(screen.getByRole('button', { name: 'More' }));
    await fireEvent.press(screen.getByRole('button', { name: 'More' }));
    expect(onChange.mock.calls).toEqual([[1], [2]]);
  });

  it('a tap on the current stop still saves it (a value between stops shows on the nearest)', async () => {
    const onChange = jest.fn();
    await render(slider(3, onChange));
    const track = screen.getByTestId('step-slider');
    await fireEvent(track, 'layout', { nativeEvent: { layout: { width: 300, height: 44 } } });
    await fireEvent(track, 'responderGrant', touch(300));
    await fireEvent(track, 'responderRelease', touch(300));
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('a drag shows its stop as it moves and saves on release', async () => {
    const onChange = jest.fn();
    await render(slider(0, onChange));
    const track = screen.getByTestId('step-slider');
    await fireEvent(track, 'layout', { nativeEvent: { layout: { width: 300, height: 44 } } });
    await fireEvent(track, 'responderGrant', touch(0));
    await fireEvent(track, 'responderMove', touch(200));
    expect(screen.getByText('20 GB')).toBeOnTheScreen();
    expect(onChange).not.toHaveBeenCalled();
    await fireEvent(track, 'responderRelease', touch(300));
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('is adjustable for VoiceOver', async () => {
    const onChange = jest.fn();
    await render(slider(2, onChange));
    const track = screen.getByRole('adjustable', { name: 'Limit' });
    expect(track).toHaveAccessibilityValue({ text: '20 GB' });
    await fireEvent(track, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(onChange).toHaveBeenCalledWith(1);
  });
});
