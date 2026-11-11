// SPDX-License-Identifier: GPL-3.0-or-later
// Library: browse (and search, on phones) by type, sort and filter. Route only: the phone / tablet or the Apple TV
// screen (`src/screens/phone/`, `src/screens/tv/`), data in `useLibrary`. Data rules: docs/context/api.md (Library).
import { screenFor } from '@/device';
import { PhoneLibrary } from '@/screens/phone/PhoneLibrary';
import { TvLibrary } from '@/screens/tv/TvLibrary';

export default screenFor({ phone: PhoneLibrary, tv: TvLibrary });
