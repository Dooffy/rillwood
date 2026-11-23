// SPDX-License-Identifier: GPL-3.0-or-later
// Fails if an iOS / tvOS build (.ipa) links a framework it doesn't carry: the app would crash at launch before any of
// its code runs (dyld "Library not loaded: @rpath/X.framework/X"). Run on every release build before upload
// (`npm run build:ios:prod`, docs/release/ios.md). macOS only: needs `unzip` and `otool` (Xcode).
// Usage: node scripts/check-ipa.mjs <app.ipa>
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

const ipa = process.argv[2];
if (!ipa || !existsSync(ipa)) {
  process.stderr.write('Usage: node scripts/check-ipa.mjs <app.ipa>\n');
  process.exit(2);
}

const dir = mkdtempSync(join(tmpdir(), 'check-ipa-'));
try {
  execFileSync('unzip', ['-q', ipa, '-d', dir]);
  const payload = join(dir, 'Payload');
  const appName = readdirSync(payload).find((n) => n.endsWith('.app'));
  if (!appName) throw new Error('no .app in Payload/');
  const app = join(payload, appName);
  const frameworksDir = join(app, 'Frameworks');
  const embedded = existsSync(frameworksDir) ? readdirSync(frameworksDir).filter((n) => n.endsWith('.framework')) : [];

  // The app's executable and each embedded framework's: every @rpath framework they link must be in Frameworks/.
  const binaries = [
    { name: appName, path: join(app, basename(appName, '.app')) },
    ...embedded.map((f) => ({ name: f, path: join(frameworksDir, f, basename(f, '.framework')) })),
  ];
  const missing = [];
  for (const { name, path } of binaries) {
    const links = execFileSync('otool', ['-L', path], { encoding: 'utf8' });
    for (const [, framework] of links.matchAll(/@rpath\/([^/\s]+\.framework)\//g)) {
      if (!embedded.includes(framework)) missing.push(`${framework} (linked by ${name})`);
    }
  }

  if (missing.length > 0) {
    process.stderr.write(`${ipa}: frameworks linked but not in the app - it would crash at launch:\n`);
    for (const m of [...new Set(missing)]) process.stderr.write(`  ${m}\n`);
    process.exit(1);
  }
  process.stdout.write(`${ipa}: OK - ${embedded.length} frameworks, every @rpath link present\n`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
