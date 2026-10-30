// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import appJson from '../../app.json';

import About from '@/app/about';
import { aboutLinks } from '@/components/SettingsPages';

// Jest's expo-constants has no `extra`: hand it the real one from app.json.
jest.mock('expo-constants', () => ({
  expoConfig: { extra: jest.requireActual<typeof import('../../app.json')>('../../app.json').expo.extra },
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('expo-linking', () => ({ openURL: jest.fn(() => Promise.resolve(true)) }));

const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');
const { openURL } = jest.requireMock<{ openURL: jest.Mock }>('expo-linking');

describe('aboutLinks', () => {
  it('builds the links from app.json extra', () => {
    expect(
      aboutLinks({
        sourceUrl: 'https://example.com/repo',
        privacyUrl: 'https://example.com/privacy',
        supportUrl: 'https://example.org',
      }),
    ).toEqual({
      source: 'https://example.com/repo',
      issues: 'https://example.com/repo/issues',
      privacy: 'https://example.com/privacy',
      support: 'https://example.org',
    });
  });

  it('drops missing and non-https links', () => {
    expect(aboutLinks({})).toEqual({ source: undefined, issues: undefined, privacy: undefined, support: undefined });
    expect(aboutLinks({ sourceUrl: 'http://example.com/repo', privacyUrl: 42 })).toEqual({
      source: undefined,
      issues: undefined,
      privacy: undefined,
      support: undefined,
    });
  });

  it('reads the app config by default', () => {
    expect(aboutLinks()).toEqual(aboutLinks(appJson.expo.extra));
    expect(aboutLinks().source).toMatch(/^https:\/\//);
    expect(aboutLinks().privacy).toMatch(/^https:\/\/.*\/privacy$/);
  });
});

describe('About screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows what Rillwood is and the licence line', async () => {
    await render(<About />);
    expect(screen.getByRole('header', { name: 'Rillwood' })).toBeOnTheScreen();
    expect(screen.getByText(/open-source app for Jellyfin servers/)).toBeOnTheScreen();
    expect(screen.getByText(/GNU GPL version 3 or later/)).toBeOnTheScreen();
  });

  it('opens the source code, privacy policy, issues and Stand with Ukraine in the browser', async () => {
    const { source, privacy, issues } = aboutLinks();
    await render(<About />);
    await fireEvent.press(screen.getByRole('link', { name: 'Source code' }));
    await fireEvent.press(screen.getByRole('link', { name: 'Privacy policy' }));
    await fireEvent.press(screen.getByRole('link', { name: 'Report a problem' }));
    await fireEvent.press(screen.getByRole('link', { name: 'Stand with Ukraine' }));
    expect(openURL.mock.calls).toEqual([[source], [privacy], [issues], ['https://u24.gov.ua']]);
  });

  it('lists the web links first, Licences last', async () => {
    await render(<About />);
    const rows = screen.getAllByRole(/^(link|button)$/).map((row) => row.props.accessibilityLabel);
    expect(rows.slice(0, 4)).toEqual(['Source code', 'Privacy policy', 'Report a problem', 'Licences']);
  });

  it('opens Licences', async () => {
    await render(<About />);
    await fireEvent.press(screen.getByRole('button', { name: 'Licences' }));
    expect(router.push).toHaveBeenCalledWith('/licences');
    expect(openURL).not.toHaveBeenCalled();
  });

  it("ignores a link the phone can't open", async () => {
    openURL.mockImplementationOnce(() => Promise.reject(new Error('no browser')));
    await render(<About />);
    await fireEvent.press(screen.getByRole('link', { name: 'Source code' }));
    expect(openURL).toHaveBeenCalledTimes(1);
  });
});
