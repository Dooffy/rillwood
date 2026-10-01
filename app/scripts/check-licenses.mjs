// SPDX-License-Identifier: GPL-3.0-or-later
// Fails if any production dependency is GPL/AGPL-only (CLAUDE.md §7).
// LGPL and dual licences that offer a non-GPL option (e.g. "MIT OR GPL-2.0") are allowed.
import { execFileSync } from 'node:child_process';

const out = execFileSync('license-checker-rseidelsohn', ['--production', '--json'], {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
const pkgs = JSON.parse(out);

const gplOnly = (licence) => {
  const options = String(licence)
    .replace(/[()]/g, '')
    .split(/\s+OR\s+/i);
  // Matches GPL-3.0, GPLv3, AGPL-3.0-only, AGPLv3...; LGPL is fine.
  return options.every((o) => /GPL/i.test(o) && !/LGPL/i.test(o));
};

const bad = Object.entries(pkgs)
  .filter(([name]) => !name.startsWith('rillwood@'))
  .filter(([, info]) => [].concat(info.licenses ?? 'UNKNOWN').some(gplOnly));

if (bad.length) {
  for (const [name, info] of bad) process.stderr.write(`GPL/AGPL-only: ${name} (${info.licenses})\n`);
  process.exit(1);
}
process.stdout.write(`Licence check OK - ${Object.keys(pkgs).length} production packages, none GPL/AGPL-only\n`);
