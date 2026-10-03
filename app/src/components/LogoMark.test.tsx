// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

import { ColorsContext, palettes } from '@/theme';

import { LogoMark } from './LogoMark';

describe('LogoMark', () => {
  it('draws the mark on a surface tile of the given size, hidden from screen readers', async () => {
    await render(<LogoMark size={56} />);
    const tile = screen.getByTestId('logo-mark', { includeHiddenElements: true });
    expect(tile).toHaveStyle({ width: 56, height: 56, backgroundColor: palettes.dark.surface });
    expect(screen.queryByTestId('logo-mark')).toBeNull();
  });

  it('follows the light palette', async () => {
    await render(
      <ColorsContext.Provider value={palettes.light}>
        <LogoMark />
      </ColorsContext.Provider>,
    );
    expect(screen.getByTestId('logo-mark', { includeHiddenElements: true })).toHaveStyle({
      backgroundColor: palettes.light.surface,
    });
  });
});
