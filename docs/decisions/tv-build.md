# Apple TV build setup

Date: 2026-11-06. Roadmap TV task 1. Background: `docs/research/apple-tv.md`.

## Decision

| What          | Choice                                                                                                                              | Why                                                                                                                                                                                                                                                                                        |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| React Native  | `"react-native": "npm:react-native-tvos@0.88.1-0"` for **every** build (phone + TV), pinned to the SDK's RN version                 | Expo's TV path. The fork is a superset of RN (same version, adds tvOS); npm can't switch the package per build. Phone builds run the fork too                                                                                                                                              |
| Config plugin | `@react-native-tvos/config-tv` (dev dep, last in `app.json` plugins)                                                                | Does nothing unless `EXPO_TV=1`, so phone prebuilds are unchanged                                                                                                                                                                                                                          |
| TV project    | `EXPO_TV=1 npx expo prebuild --clean -p ios`                                                                                        | Turns `ios/` into a tvOS project. Phone and TV can't share one `ios/` - prebuild again (`--clean`, without `EXPO_TV`) to go back                                                                                                                                                           |
| Swift crash   | `patch-package` (dev dep, `postinstall`) + `patches/expo-modules-core+58.0.28.patch`                                                | Swift 6.4 crashes on `case .failure(let error as any Error)` in `AsyncFunctionDefinition.swift`. iOS uses Expo's precompiled xcframeworks; tvOS has none and builds from source. The patch drops a no-op cast. Re-check on every Expo / Xcode bump - drop the patch once upstream is fixed |
| Tab bar glass | `patches/react-native-screens+4.30.0.patch`: no `tabBarItem.standardAppearance` / `scrollEdgeAppearance` on tvOS                    | Any appearance replaces the tvOS Liquid Glass top tab bar with the classic opaque one. The TV shell takes the system's colours anyway. Re-check on every `react-native-screens` bump                                                                                                       |
| EAS           | `production_tv` profile (extends `production`, `EXPO_TV=1`)                                                                         | One `eas.json` for phone + TV                                                                                                                                                                                                                                                              |
| CI            | No extra job: `npm run bundle:check` already bundles the JS against the fork; TV JS is the same bundle (`Platform.isTV` at runtime) | KISS. A tvOS native build in CI needs macOS runners - later, with the release workflow                                                                                                                                                                                                     |

Upgrades: bump `react-native-tvos` with the SDK's RN version (`<rn version>-<n>` on npm, `latest` tag), then `patch-package` must still apply (it fails `npm install` loudly when it doesn't).

## Gating (task 2)

tvOS skips modules that don't declare it; importing them throws at launch. `Platform.isTV`: `modules/downloads` exports a stand-in (no tasks, calls do nothing), `src/orientation.ts` never loads `expo-screen-orientation`, the Downloads tab / buttons / offline link are hidden, the player renders no `GestureDetector` (tvOS has no pinch recogniser - attaching one aborts). Tests: `src/tv.test.ts`.

## Verified

| Check                                                  | Result                                                                                                                                                |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`, `npm run licenses`                    | Pass (fork is MIT)                                                                                                                                    |
| Expo doctor                                            | Accepts the fork (only the usual patch-version drift)                                                                                                 |
| `EXPO_TV=1` prebuild                                   | tvOS Podfile (`platform :tvos`), MpvPlayer + MPVKit install for tvOS                                                                                  |
| tvOS simulator Release build                           | Builds, installs, launches; before task 2 it stopped on `Cannot find native module 'Downloads'`, after it the TV Welcome shows and takes remote input |
| Phone iOS simulator Release build (fork, no `EXPO_TV`) | Builds (`platform :ios`, precompiled Expo modules)                                                                                                    |
