# Contributing to Rillwood

Thanks for helping. Bug reports, fixes, tests and docs are all welcome. For a new feature or a new dependency, open an issue first so we can agree on it before you build it.

## Licence of contributions

Rillwood is licensed under the **GNU GPL version 3 or later, with an additional permission for app stores** (the end of [`LICENSE`](LICENSE)). The permission lets the app ship through the App Store and Google Play while its source stays public under the GPL.

By contributing, you agree that your contribution is licensed under the same terms: **GPL-3.0-or-later plus the same additional permission**. You keep the copyright in your work. There is no CLA.

Code you add must be your own, or under a licence compatible with the above. Don't add GPL-only or AGPL libraries to the iOS app, and note any vendored code or binary in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) (rules: [`CLAUDE.md`](CLAUDE.md) §7).

## Sign-off (DCO)

Every commit needs a `Signed-off-by` line, which certifies the [Developer Certificate of Origin](https://developercertificate.org/): that you wrote the change, or have the right to submit it under the project's licence.

```bash
git commit -s
```

The name and email must match the commit author. Forgot it? `git rebase --signoff origin/main`, then `git push --force-with-lease`. CI fails a pull request with an unsigned commit.

## Commits

```
[FEAT] Short summary in sentence case

- change A
- change B
```

- Prefix: `[FEAT]` new feature, `[ISSUE]` bug fix, `[CHORE]` deps / config / build / tooling, `[DOCS]` docs only, `[REFACTOR]` no behaviour change.
- A blank line after the summary is required.
- No AI co-author trailers or "generated with" lines - CI rejects them.
- Optional: commit in UTC (`TZ=UTC git commit -s`) so the timestamp doesn't show your timezone.

## Pull requests

1. Fork the repo and branch off `main`: `<type>/<short-slug>`, e.g. `issue/resume-after-seek`.
2. Keep a pull request to one change. Small is easier to review.
3. Run the checks (below) before you push.
4. Open the pull request against `main`. Say what changed, why, and how you tested it (device, OS, Jellyfin version). Add screenshots for UI changes.

Maintainers squash-merge, so the pull request title becomes the commit subject: use the same `[PREFIX] Summary` format.

## Setup

App (Expo SDK 58, React Native 0.88, in `app/`). It uses a native player, so it needs a development build, not Expo Go.

```bash
cd app
npm ci
npx expo prebuild
npx expo run:ios --device    # or: npx expo run:android --device
```

A local Jellyfin server with a generated test library: [`dev/jellyfin/README.md`](dev/jellyfin/README.md).

Website (Astro, in `web/`): `cd web && npm ci && npm run dev`.

## Checks

In `app/`:

```bash
npm run check    # lint, typecheck, format, unit tests
```

CI also runs Expo doctor, the iOS + Android bundle, the licence check, the website build and the commit checks.

- New logic comes with unit tests, and a bug fix with a test that fails without it. Tests sit next to the code as `*.test.ts(x)`; screen tests go in `app/src/__tests__/`.
- Native code (`app/modules/`) has manual device test plans in [`docs/test-plans/`](docs/test-plans/) - update the matching one.

## Project rules

[`CLAUDE.md`](CLAUDE.md) holds the locked decisions, design tokens, folder layout and conventions. Read it before a larger change. Feature contracts live in [`docs/context/`](docs/context/). In short:

- No UI kits, state libraries, `@jellyfin/sdk` or axios. Any new dependency needs an issue and maintainer approval first.
- Colours, sizes and radii come from `app/src/theme.ts`.
- New source files start with `// SPDX-License-Identifier: GPL-3.0-or-later`.
- Tokens stay in secure storage and the `Authorization` header - never in URLs, logs or files.
- Hyphens, not em dashes, in UI text and docs.
- Docs change in the same pull request as the code they describe.

## Forks

Forks are welcome under the licence. To publish your own build, give it a new name and icon: see [`TRADEMARKS.md`](TRADEMARKS.md).
