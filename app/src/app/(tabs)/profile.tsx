// SPDX-License-Identifier: GPL-3.0-or-later
// Profile tab: Apple TV only (the icon at the bar's right end, `TvProfile`). Phones never show it - Settings opens from
// the avatar in each tab's header there; Home stands in.
import { screenFor } from '@/device';
import { PhoneHome } from '@/screens/phone/PhoneHome';
import { TvProfile } from '@/screens/tv/TvProfile';

export default screenFor({ phone: PhoneHome, tv: TvProfile });
