// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from '@jest/globals';

import { DOWNLOAD_OVER_LIMIT, overLimitMessage } from './useDownloadControl';

describe('overLimitMessage', () => {
  it('names the share other accounts take of the limit', () => {
    expect(overLimitMessage(12.3e9)).toBe(
      "This would go over your download storage limit - other accounts' downloads take 12.3 GB of it. Change it in Settings.",
    );
  });

  it('keeps the plain message when only this account downloads', () => {
    expect(overLimitMessage(0)).toBe(DOWNLOAD_OVER_LIMIT);
  });
});
