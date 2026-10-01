---
name: update-modules
description: Pre-release module check for Rillwood - finds upstream updates for every vendored module in app/modules, new versions of native binaries (MPVKit, libmpv) and Expo SDK packages, checks licences, then applies the chosen updates and re-records provenance in UPSTREAM.md and THIRD_PARTY_NOTICES.md. Use before a release, or when the user wants to check, sync, or update modules, upstream code, or native player binaries.
---

Check and update all modules. Usage: `/update-modules [module ...] [--check]`. No module → all. `--check` → report only (Steps 1-4), change nothing. All commands run from the repo root (`git rev-parse --show-toplevel`). Upstream clones go in the scratchpad, never in the repo.

> **NEVER add Claude as co-author or any AI attribution** - applies to anything this skill writes.

---

## Step 0 - Preconditions

```bash
git rev-parse --abbrev-ref HEAD
git status --short
```

- Dirty tree → stop and ask (commit via `/submit-code`, or stash). Never discard.
- `--check` → any branch is fine. Applying updates on `main` → run `/task-init update modules` first.

---

## Step 1 - Inventory

```bash
ls app/modules
```

| Kind | How to tell | Checked for |
|---|---|---|
| Vendored | Has `UPSTREAM.md` | Upstream commits since the recorded one, native binaries listed there |
| Own | No `UPSTREAM.md` (e.g. `downloads`) | Native deps pinned in `ios/*.podspec` and `android/build.gradle` |
| Expo / npm | `app/package.json` | SDK-aligned versions |

Read every `UPSTREAM.md` fully: repo, path, commit, kept / dropped files, local modifications, binaries. Missing a field → `[MUST]`, fix it before anything else.

---

## Step 2 - Upstream source updates (vendored modules)

Per module:

```bash
S=<scratchpad>/upstream-<module>
git clone -q --filter=blob:none --sparse <repo> "$S" && git -C "$S" sparse-checkout set <path>
git -C "$S" log --oneline <recorded-commit>..HEAD -- <path>
git -C "$S" diff --stat <recorded-commit>..HEAD -- <path>
```

Recorded commit gone from upstream (force-push) → say so, compare by file content instead.

Sort every upstream commit into one of:

| Bucket | Meaning | Default |
|---|---|---|
| **Fix** | Bug / crash / build fix in a kept file | Take |
| **Compat** | Expo SDK, RN, Xcode, Gradle, OS version support | Take |
| **Feature** | New behaviour in a kept file | Ask - only if useful for MVP |
| **Dropped** | Only touches files listed as dropped in `UPSTREAM.md` | Skip |
| **New file** | File didn't exist at the recorded commit | Ask - keep only if a kept file needs it |

Also flag: new dependencies (podspec, `build.gradle`, imports), any new file carrying the MPL Exhibit B "Incompatible With Secondary Licenses" notice (`[MUST]` - can't vendor it), licence change in upstream `LICENSE*`.

---

## Step 3 - Native binaries

For every binary in the `UPSTREAM.md` binaries table (and pinned native deps of own modules):

| Binary | Latest version | Licence check |
|---|---|---|
| MPVKit (iOS) | `gh api repos/<owner>/MPVKit/releases --jq '.[0:5][] \| .tag_name + " " + .published_at'`, podspec at the tag | Podspec `s.license`, build flags (`enable-gpl`, `--enable-nonfree`, libx264) |
| libmpv (Android, Maven) | `curl -s https://repo1.maven.org/maven2/dev/jdtech/mpv/libmpv/maven-metadata.xml` | POM licence, upstream build script flags |
| Pinned pods / Gradle deps | CocoaPods trunk / Maven Central metadata | Licence of the new version |

Release rule (CLAUDE.md §7): a GPL player binary is a **release blocker**, whatever its version. Report it as `BLOCKER` in Step 4 even when no update exists.

---

## Step 4 - Expo SDK packages + report

```bash
cd app && npx expo install --check
```

- Let `npx expo install --fix` decide versions - don't hand-pin (CLAUDE.md §11). Exception: `@react-native/jest-preset` must equal the `react-native` version.
- Note if Expo SDK 58 stable has shipped (CLAUDE.md §2) - moving off `next` is a separate task, not part of this run.

Report one table, then stop if `--check`:

| Module / binary | Current | Available | Buckets / changes | Licence | Recommendation |
|---|---|---|---|---|---|

Plus a `BLOCKERS` list (GPL binaries, Exhibit B files, licence changes, missing `UPSTREAM.md` fields). Ask which updates to apply. Default = all **Fix** + **Compat**.

---

## Step 5 - Apply source updates

Per vendored module, for the chosen commits only:

```bash
git -C "$S" diff <recorded-commit>..<target> -- <path>/<kept files...> > <scratchpad>/<module>.patch
git apply -3 --directory=app/modules/<module> -p<n> <scratchpad>/<module>.patch
```

- `-p<n>` = components in upstream `<path>` + 1 (`modules/mpv-player` → `-p3`), so files land in `app/modules/<module>/`.
- Conflicts → resolve by hand, keeping every entry in the "Local modifications" table.
- Never re-add dropped files or their deps (`build.gradle`, `expo-module.config.json`, `index.ts` exports).
- Keep upstream formatting (vendored files are in `app/.prettierignore`). Don't add SPDX headers to MPL files.
- Then update `UPSTREAM.md`: commit + date, kept / dropped lists, local modifications.

---

## Step 6 - Apply binary + package updates

- MPVKit: bump the podspec URL in `app/modules/mpv/app.plugin.js` (podspec at the new tag).
- libmpv / pinned native deps: bump in the module's `android/build.gradle` or podspec.
- Expo packages: `cd app && npx expo install --fix`, then re-pin `@react-native/jest-preset` if `react-native` moved.
- Update the binaries table in `UPSTREAM.md` and `THIRD_PARTY_NOTICES.md` (version, licence status).

---

## Step 7 - Verify

```bash
cd app
npm run check
npm run licenses
npm run bundle:check
npx expo-doctor
npx expo prebuild --clean --no-install && (cd ios && pod install)   # iOS native resolve
(cd android && ./gradlew :app:assembleDebug)                     # Android native build
```

- Native step needs Xcode / Android SDK. Not available → say so, don't claim it passed.
- `app/ios` and `app/android` are generated (CNG) - never commit them.
- List the device test plans to rerun: `docs/test-plans/<module>.md` for every changed module or binary. Missing plan → `[SHOULD]` create it.

---

## Step 8 - Summary

> **Modules updated** on `<branch>`
> | Module / binary | From | To | Notes |
> - Blockers: <list or "none">
> - Not verified: <native build / device tests not run>
> - Device test plans to rerun: <list>
> - Next: `/submit-code` (`[CHORE] Update modules`) → `/create-pull-request`
