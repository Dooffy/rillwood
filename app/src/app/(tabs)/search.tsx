// SPDX-License-Identifier: GPL-3.0-or-later
// Search tab: Apple TV only (hidden on phones - search lives in Library there). Route only: the TV view
// (`src/screens/tv/TvSearch`); a phone never shows the tab, Library stands in.
import { screenFor } from '@/device';
import { PhoneLibrary } from '@/screens/phone/PhoneLibrary';
import { TvSearch } from '@/screens/tv/TvSearch';

export default screenFor({ phone: PhoneLibrary, tv: TvSearch });
