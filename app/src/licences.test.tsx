// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { LicencesList } from '@/components/LicencesList';
import { LicenceSettings } from '@/components/SettingsPages';
import { licenceById, licences, licenceSections } from '@/licences';

let mockDataReads = 0;
jest.mock('./licences.json', () => {
  mockDataReads++;
  return {
    app: { name: 'Rillwood', licence: 'GPL-3.0-or-later', texts: [0] },
    native: [
      { name: 'Both', licence: 'MPL-2.0', url: 'https://example.com/both', texts: [1] },
      { name: 'iOS only', licence: 'GPL-3.0', platform: 'ios', texts: [0] },
      { name: 'Android only', licence: 'GPL-3.0', platform: 'android', texts: [0] },
    ],
    packages: [
      {
        name: 'org/mono',
        licence: 'MIT',
        url: 'https://example.com/mono',
        packages: ['a 1.0.0', 'b 2.0.0'],
        texts: [2],
      },
      { name: 'bare', licence: 'ISC', packages: ['bare 1.0.0'], texts: [] },
    ],
    texts: ['GPL text\n\nSecond paragraph', 'MPL text', 'MIT text'],
  };
});

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

describe('licences', () => {
  it('reads the data on first use, not on import', () => {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- isolateModules needs a sync require
      const fresh: typeof import('@/licences') = require('@/licences');
      const before = mockDataReads;
      fresh.licences();
      fresh.licenceSections();
      expect(mockDataReads).toBe(before + 1);
    });
  });

  it('numbers every entry and resolves its texts', () => {
    expect(licences().map((l) => l.id)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(licences()[0].texts).toEqual(['GPL text\n\nSecond paragraph']);
    expect(licences()[4].texts).toEqual(['MIT text']);
  });

  it("lists only this platform's native parts", () => {
    expect(Platform.OS).toBe('ios');
    expect(licenceSections().native.map((l) => l.name)).toEqual(['Both', 'iOS only']);
    expect(licenceSections().packages.map((l) => l.name)).toEqual(['org/mono', 'bare']);
  });

  it('finds an entry by a route param', () => {
    expect(licenceById('4')?.name).toBe('org/mono');
    expect(licenceById(0)?.name).toBe('Rillwood');
    expect(licenceById('99')).toBeUndefined();
    expect(licenceById('x')).toBeUndefined();
    expect(licenceById('')).toBeUndefined();
    expect(licenceById(undefined)).toBeUndefined();
  });
});

describe('Licences page', () => {
  it('lists Rillwood, the native parts with the FFmpeg credit, then the packages', async () => {
    await render(<LicencesList />);
    expect(screen.getByRole('button', { name: 'Rillwood' })).toHaveAccessibilityValue({ text: 'GPL-3.0-or-later' });
    expect(screen.getByRole('button', { name: 'iOS only' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Android only' })).toBeNull();
    expect(screen.getByText(/uses code of FFmpeg/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'org/mono' })).toHaveAccessibilityValue({ text: 'MIT' });
  });

  it('an entry shows its licence, source, packages and text by paragraph', async () => {
    await render(<LicenceSettings id={4} />);
    expect(screen.getByText('Source: https://example.com/mono')).toBeOnTheScreen();
    expect(screen.getByText('Packages:\na 1.0.0\nb 2.0.0')).toBeOnTheScreen();
    expect(screen.getByText('MIT text')).toBeOnTheScreen();
  });

  it('splits a long text into paragraphs', async () => {
    await render(<LicenceSettings id={0} />);
    expect(screen.getByText('GPL text')).toBeOnTheScreen();
    expect(screen.getByText('Second paragraph')).toBeOnTheScreen();
  });

  it('says so when a package ships no licence file', async () => {
    await render(<LicenceSettings id={5} />);
    expect(screen.getByText('The package ships no licence file.')).toBeOnTheScreen();
    expect(screen.queryByText(/^Packages:/)).toBeNull();
  });

  it("an id this build doesn't have", async () => {
    await render(<LicenceSettings id={99} />);
    expect(screen.getByText("This licence isn't available.")).toBeOnTheScreen();
  });
});
