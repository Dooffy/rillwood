// SPDX-License-Identifier: GPL-3.0-or-later
// Signed-out start. Route only: the phone / tablet or the Apple TV screen (`src/screens/phone/`, `src/screens/tv/`).
import { screenFor } from '@/device';
import { PhoneWelcome } from '@/screens/phone/PhoneWelcome';
import { TvWelcome } from '@/screens/tv/TvWelcome';

export default screenFor({ phone: PhoneWelcome, tv: TvWelcome });
