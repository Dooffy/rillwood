// SPDX-License-Identifier: GPL-3.0-or-later
// Saved accounts. Route only: the phone / tablet list or Apple TV's Who's Watching (`src/screens/phone/`,
// `src/screens/tv/`).
import { screenFor } from '@/device';
import { PhoneAccounts } from '@/screens/phone/PhoneAccounts';
import { TvAccounts } from '@/screens/tv/TvAccounts';

export default screenFor({ phone: PhoneAccounts, tv: TvAccounts });
