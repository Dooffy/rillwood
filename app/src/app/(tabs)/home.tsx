// SPDX-License-Identifier: GPL-3.0-or-later
// Home: Up Next hero, Continue Watching, Next Up, Recently Added per library (docs/context/api.md, Home data). Route
// only: the phone / tablet or the Apple TV screen (`src/screens/phone/`, `src/screens/tv/`), data in `useHome`.
import { screenFor } from '@/device';
import { PhoneHome } from '@/screens/phone/PhoneHome';
import { TvHome } from '@/screens/tv/TvHome';

export default screenFor({ phone: PhoneHome, tv: TvHome });
