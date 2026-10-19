# iOS TestFlight build

Local EAS build, manual upload with Transporter, internal testers only. External testers need the repo public first (`CLAUDE.md` §7) and Beta App Review (`docs/research/store-requirements.md` §A5).

## Once

| Step           | How                                                                                                                                                                                                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tools          | Xcode 27, `eas-cli` (`>= 18.4.0`, `eas.json`), Transporter (Mac App Store)                                                                                                                                                                                                                 |
| Expo account   | `eas login`                                                                                                                                                                                                                                                                                |
| EAS project    | `cd app && eas init` - `app.config.ts` is dynamic, so it prints the project id instead of writing it. Keep it outside the repo: `export EAS_PROJECT_ID=<id>` in your shell profile                                                                                                         |
| App record     | App Store Connect → Apps → + → New App: iOS, name, primary language, bundle id `app.rillwood.client` (EAS registers it on the first build if it isn't listed yet), any SKU. Listing details (screenshots, description, privacy label, age rating) can wait until external testing / review |
| Internal group | TestFlight → Internal Testing → +: add testers (App Store Connect users of the team, up to 100)                                                                                                                                                                                            |

## Each build

```bash
cd app
eas build -p ios --profile production --local --output rillwood.ipa
```

- Builds in a temp folder from a fresh prebuild - your `ios/` dev build isn't touched. Don't set `RILLWOOD_FILE_SHARING`.
- First run: signs in to Apple and creates the distribution certificate + provisioning profile (stored by EAS).
- `autoIncrement` + `appVersionSource: remote`: EAS keeps the build number. Bump `version` in `app.json` for a new release.
- `*.ipa` is gitignored; delete it after upload.

Upload: Transporter → add `rillwood.ipa` → Deliver.

In App Store Connect, once processed (TestFlight tab):

1. **Export compliance** (asked per build, `ITSAppUsesNonExemptEncryption` is unset on purpose): the app uses standard encryption not provided by Apple OS (MPVKit bundles OpenSSL + GnuTLS for `https` streams) - see `docs/research/store-requirements.md` §A3 and `docs/open-items.md`.
2. Add the build to the internal group. Testers install it from the TestFlight app.
3. Check the processing email: no ITMS-91053 (missing privacy reasons) or other ITMS warnings.

## Smoke test on the TestFlight build

- [ ] First connect to a LAN server shows the local network prompt with our text ("Rillwood connects to your Jellyfin server ...")
- [ ] `http://<ip>:8096` and `http://<name>.local:8096` sign in; an `https://` server signs in
- [ ] Plain `http://` to a non-local host name fails (ATS, expected - `CLAUDE.md` §2 iOS network)
- [ ] Browse, play an MKV (direct play), resume, tracks, progress shows on the server dashboard
- [ ] Download an episode, close the app, it finishes; plays in flight mode
- [ ] No dev-client menu or test screens; Settings → About shows the build's version
