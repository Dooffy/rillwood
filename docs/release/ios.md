# iOS TestFlight build

Local EAS build, manual upload with Transporter, internal testers only. External testers need the repo public first (`CLAUDE.md` §7) and Beta App Review (`docs/research/store-requirements.md` §A5).

## Once

| Step           | How                                                                                                                                                                                                                                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tools          | Xcode 27, `eas-cli` (`>= 18.4.0`, `eas.json`), Transporter (Mac App Store)                                                                                                                                                                                                                           |
| Expo account   | `eas login`                                                                                                                                                                                                                                                                                          |
| EAS project    | `cd app && eas init --non-interactive --force`, note the printed project id, then **undo its edits to `app.json`** (`git checkout -- app.json` - it writes `owner` + `extra.eas.projectId` and reformats the file). Keep the id outside the repo: `export EAS_PROJECT_ID=<id>` in your shell profile |
| App record     | App Store Connect → Apps → + → New App: iOS, name, primary language, bundle id `app.rillwood.client` (EAS registers it on the first build if it isn't listed yet), any SKU. Listing details (screenshots, description, privacy label, age rating) can wait until external testing / review           |
| Internal group | TestFlight → Internal Testing → +: add testers (App Store Connect users of the team, up to 100)                                                                                                                                                                                                      |

## Release

1. Bump `version` in `app/app.json` in a PR, merge it. Format `YY.N`: two-digit year, then the release number in that year from 0 (`26.0`, `26.1`, ... `27.0` in a new year). No patch number - a fix is the next release. `app/package.json` has no version.
2. Actions → **Release** → Run workflow on `main`: version check, every CI check plus Expo doctor, then tag `v<version>` + a draft GitHub Release with notes from the merged PRs. A failure creates nothing - fix it in a PR (Expo doctor: `npx expo install --check`) and run it again.
3. Build from the tag (`git switch --detach v<version>`, then [Each build](#each-build)) and upload.
4. Publish the draft release. A build that failed before reaching testers: delete the draft + tag, fix, run Release again. Once testers have it, never move the tag - fix in the next release.

## Each build

```bash
cd app
npm run build:ios:prod     # iPhone / iPad → rillwood.ipa
npm run build:tv:prod      # Apple TV (`production_tv`) → rillwood-tv.ipa
```

Each runs `eas build ... --local`, then `scripts/check-ipa.mjs` on the result (`npm run check:ipa <file>` on its own). Don't upload a build the check fails.

- Builds in a temp folder from a fresh prebuild - your `ios/` dev build isn't touched. Don't set `RILLWOOD_FILE_SHARING`.
- First run: signs in to Apple and creates the distribution certificate + provisioning profile (stored by EAS).
- `autoIncrement` + `appVersionSource: remote`: EAS keeps the build number. Bump `version` in `app.json` for a new release.
- Expo modules build from source (`EXPO_USE_PRECOMPILED_MODULES=0` in both `eas.json` profiles). With Expo's precompiled modules (the SDK 58 default) the app linked ready-made frameworks nothing checked against each other: React Native's core fell back to building from source when its prebuilt download check failed, while the precompiled modules still linked `React.framework`, and the TestFlight build crashed at launch (dyld `Library not loaded: @rpath/React.framework/React`, 26.1 (20)). The check catches a framework that is linked but not in the app.
- `*.ipa` is gitignored; delete it after upload.

Upload: Transporter → add `rillwood.ipa` → Deliver.

In App Store Connect, once processed (TestFlight tab):

1. **Export compliance**: not asked - `app.json` `ios.config.usesNonExemptEncryption: false` (only `https` to the user's own server, `CLAUDE.md` §2 iOS network).
2. Add the build to the internal group. Testers install it from the TestFlight app.
3. Check the processing email: no ITMS-91053 (missing privacy reasons) or other ITMS warnings.

## Smoke test on the TestFlight build

- [ ] First connect to a LAN server shows the local network prompt with our text ("Rillwood connects to your Jellyfin server ...")
- [ ] `http://<ip>:8096` and `http://<name>.local:8096` sign in; an `https://` server signs in
- [ ] Plain `http://` to a non-local host name fails (ATS, expected - `CLAUDE.md` §2 iOS network)
- [ ] Browse, play an MKV (direct play), resume, tracks, progress shows on the server dashboard
- [ ] Download an episode, close the app, it finishes; plays in flight mode
- [ ] No dev-client menu or test screens
- [ ] Settings → About Rillwood: Source code, Privacy policy, Report a problem and Stand with Ukraine open the browser; Licences opens
