// SPDX-License-Identifier: GPL-3.0-or-later
// Sign in. Route only: the server from the params, then the phone / tablet or the Apple TV screen
// (`src/screens/phone/`, `src/screens/tv/`).
import { Redirect, useLocalSearchParams } from 'expo-router';

import { useServerParam } from '@/auth';
import { screenFor } from '@/device';
import { PhoneSignIn } from '@/screens/phone/PhoneSignIn';
import { TvSignIn } from '@/screens/tv/TvSignIn';

const SignIn = screenFor({ phone: PhoneSignIn, tv: TvSignIn });

export default function Login() {
  const server = useServerParam();
  // Prefilled when signing a signed-out account back in.
  const { userName } = useLocalSearchParams<{ userName?: string }>();
  if (!server) return <Redirect href="/server" />;
  return <SignIn server={server} initialUserName={userName} />;
}
