// SPDX-License-Identifier: GPL-3.0-or-later
import { useLocalSearchParams } from 'expo-router';

import { KidsShow } from '@/screens/kids/KidsShow';

/** Kids show page: a show's episodes as big pictures (from a kids Home poster). */
export default function KidsShowRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <KidsShow id={id} />;
}
