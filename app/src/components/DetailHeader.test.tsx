// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { render } from '@testing-library/react-native';

import type { BaseItemDto } from '@/api';
import * as control from '@/useDownloadControl';

import { DetailHeader } from './DetailHeader';

jest.mock('expo-router', () => ({ Stack: { Screen: jest.fn(() => null) } }));
const { Stack } = jest.requireMock<{ Stack: { Screen: jest.Mock } }>('expo-router');
const headerRight = () =>
  (Stack.Screen.mock.lastCall?.[0] as { options: { headerRight?: unknown } }).options.headerRight;

const item: BaseItemDto = { Id: 'm', Name: 'Dune', Type: 'Movie' };
let available = true;

beforeEach(() => {
  available = true;
  jest.spyOn(control, 'useCanDownload').mockImplementation(() => available);
});

describe('DetailHeader', () => {
  it('has the Download button when it can be downloaded', async () => {
    await render(<DetailHeader download={item} />);
    expect(headerRight()).toEqual(expect.any(Function));
  });

  it('no header button at all otherwise (iOS would draw an empty one)', async () => {
    available = false;
    await render(<DetailHeader download={item} />);
    expect(headerRight()).toBeUndefined();
    await render(<DetailHeader />);
    expect(headerRight()).toBeUndefined();
  });
});
