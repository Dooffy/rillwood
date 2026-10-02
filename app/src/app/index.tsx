// SPDX-License-Identifier: GPL-3.0-or-later
import { Redirect } from 'expo-router';

// Auth gating (signed out → /server) lands with the session in M2.
export default function Index() {
  return <Redirect href="/home" />;
}
