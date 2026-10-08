// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { TimingSlider } from './TimingSlider';

const touch = (locationX: number) => ({ nativeEvent: { locationX } });

describe('TimingSlider', () => {
  it('shows the value; − / + move by 0.1 s', async () => {
    const onChange = jest.fn();
    await render(<TimingSlider value={0.2} onChange={onChange} />);
    expect(screen.getByText('0.2 s later')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '0.1 s later' }));
    expect(onChange).toHaveBeenLastCalledWith(0.3);
    await fireEvent.press(screen.getByRole('button', { name: '0.1 s earlier' }));
    expect(onChange).toHaveBeenLastCalledWith(0.2);
  });

  // Regression (review): two presses before the parent re-rendered both stepped from the old value - one was lost.
  it('quick presses step from each other, not from a stale value', async () => {
    const onChange = jest.fn();
    await render(<TimingSlider value={0} onChange={onChange} />);
    await fireEvent.press(screen.getByRole('button', { name: '0.1 s later' }));
    await fireEvent.press(screen.getByRole('button', { name: '0.1 s later' }));
    expect(onChange.mock.calls).toEqual([[0.1], [0.2]]);
  });

  it('a drag shows its value as it moves and applies on release', async () => {
    const onChange = jest.fn();
    await render(<TimingSlider value={0} onChange={onChange} />);
    const slider = screen.getByTestId('timing-slider');
    await fireEvent(slider, 'layout', { nativeEvent: { layout: { width: 200, height: 44 } } });
    await fireEvent(slider, 'responderGrant', touch(100));
    await fireEvent(slider, 'responderMove', touch(50));
    expect(screen.getByText('5 s earlier')).toBeOnTheScreen();
    expect(onChange).not.toHaveBeenCalled();
    await fireEvent(slider, 'responderRelease', touch(160));
    expect(onChange).toHaveBeenCalledWith(6);
  });

  it('Reset goes back in sync; hidden from VoiceOver when already there', async () => {
    const onChange = jest.fn();
    const { rerender } = await render(<TimingSlider value={-1.5} onChange={onChange} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Reset' }));
    expect(onChange).toHaveBeenCalledWith(0);
    await rerender(<TimingSlider value={0} onChange={onChange} />);
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull();
  });

  it('VoiceOver: adjustable, swipe up / down = 0.1 s, never past 10 s', async () => {
    const onChange = jest.fn();
    await render(<TimingSlider value={10} onChange={onChange} />);
    const slider = screen.getByRole('adjustable', { name: 'Subtitle timing' });
    expect(slider.props.accessibilityValue).toEqual({ text: '10 s later' });
    await fireEvent(slider, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(onChange).not.toHaveBeenCalled();
    await fireEvent(slider, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(onChange).toHaveBeenLastCalledWith(9.9);
  });
});
