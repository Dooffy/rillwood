// SPDX-License-Identifier: GPL-3.0-or-later
import { screenFor } from '@/device';
import { PhoneSettings } from '@/screens/phone/PhoneSettings';
import { TvSettings } from '@/screens/tv/TvSettings';

export default screenFor({ phone: PhoneSettings, tv: TvSettings });
