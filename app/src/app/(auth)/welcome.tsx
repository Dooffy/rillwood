// SPDX-License-Identifier: GPL-3.0-or-later
// Signed-out start. Route only: the phone / tablet or the Apple TV screen (`src/screens/welcome/`).
import { screenFor } from '@/device';
import { PhoneWelcome } from '@/screens/welcome/PhoneWelcome';
import { TvWelcome } from '@/screens/welcome/TvWelcome';

export default screenFor({ phone: PhoneWelcome, tv: TvWelcome });
