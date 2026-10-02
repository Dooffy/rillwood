// SPDX-License-Identifier: GPL-3.0-or-later
import { Spinner } from '@/components/Spinner';

// Detail screen lands in M3. Never fetch with an empty id (docs/context/api.md).
export default function ItemDetail() {
  return <Spinner fill />;
}
