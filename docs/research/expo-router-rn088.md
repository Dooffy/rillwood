# expo-router navigation on Android (SDK 58, RN 0.88 RC)

Research date: 2026-10-02. Why the M0 spike route "didn't navigate" in an Android release build, and what M1 should do. Read-only: source of `expo-router` 58 in `node_modules`, the release bundle, upstream issues.

## TL;DR

- **Not an expo-router bug.** The spike route is dev-only on purpose:
  - `src/app/index.tsx` renders `{__DEV__ && <Link href="/spike">...}` - stripped from the release bundle (the `Player spike` string isn't in `index.android.bundle`), so taps hit empty space.
  - `src/app/spike.tsx` starts with `if (!__DEV__) return <Redirect href="/" />;` - a release deep link to `rillwood://spike` navigates, then immediately redirects to `/`. Matches "intent delivered, router stayed on index, no JS errors".
  - Re-exporting the spike as `index` makes `index` redirect to itself in release - not a stale bundle.
- **Debug flakiness** (1-3 `adb input tap`s per navigation) is unproven: slow debug JS on a low-RAM emulator, heavy first render of the native mpv view and a small Text hit box are likelier than a bug. No matching upstream issue.
- **Doesn't block M1.** No version bump available or needed (expo 58.0.2, expo-router 58.0.12, react-native 0.88.0-rc.3 were current on 2026-10-02).

## How expo-router 58 navigates

- `Link` -> `useLinkToPathProps` -> `router.linkTo(href)`; on native only `event.defaultPrevented` is checked.
- Deep links: `fork/useLinking.native.js` listens to `Linking` `url` events and enqueues `NAVIGATE_TO_HREF`.
- Link presses and deep links share one routing queue (`global-state/routingQueueContext.js`, drained in a `useEffect`; default `transitionMode` `'preload-only'`). A release failure of both would point at the queue - here the shared factor was the `Redirect`.
- `react-navigation` is vendored inside expo-router; no `@react-navigation/*` packages.
- `rillwood:///spike` and `rillwood://spike` both resolve to `/spike`. `+native-intent` is only needed to rewrite incoming URLs (e.g. a Jellyfin web link).
- Android manifest: `MainActivity` `singleTask`, schemes `rillwood` + `exp+rillwood`. Warm links arrive via `onNewIntent`. Nothing extra needed in `proguard-rules.pro`.

## Release bundle checks

- `export:embed` starts its own Metro; RN Gradle's bundle task passes `--reset-cache` unless `CI` is set. Edits under the project root re-run the bundle task.
- Force a clean bundle: `rm -rf android/app/build/generated/assets android/app/build/intermediates/assets .expo node_modules/.cache "$TMPDIR"/metro-* "$TMPDIR"/haste-map-*`, `CI` unset, then `./gradlew :app:createBundleReleaseJsAndAssets --rerun-tasks`.
- Check without running: `unzip -p app-release.apk assets/index.android.bundle | strings | grep "<unique string>"`.

## Upstream issues

| Ref                                                                         | Relevance                                                                                                       |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| expo/expo#50230 - iOS warm deep links emit no `url` event with UIScene      | iOS only. Fixed by expo/expo#50235 (merged 2026-09-16), likely in 58.0.0+. Re-test warm deep links on iOS in M2 |
| expo/expo#50282 (open) - Android `getInitialURL` state update after unmount | Dev warning on cold launch; doesn't block navigation                                                            |
| expo/expo#50320 (closed) - iOS release crash without `scheme`               | N/A (`scheme` set)                                                                                              |

## Recommendations for M1

| #   | Action                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Don't test `__DEV__`-guarded routes in release builds; use an unguarded test route                                                                                 |
| 2   | Tappable items are `Pressable` + `router.push` (or `Link asChild` around `Pressable`), not bare Text `Link` - bigger hit box, pressed state, future TV focus (§10) |
| 3   | RNTL test: `fireEvent.press` -> mocked `expo-router` `router.push` called with the route. Covers JS, not native hit-testing                                        |
| 4   | No pins or bumps; re-run the repro after the next SDK 58 / RN 0.88 release                                                                                         |
| 5   | Optional: dev-only `usePathname()` label to tell "didn't navigate" from "navigated, then redirected"                                                               |

## Manual repro (if the flakiness matters later)

1. Debug build, `npx expo start --clear`, wait until JS is idle.
2. Find the link bounds with `adb shell uiautomator dump`, tap the center once, wait 5 s; 10 runs by `adb`, 10 by hand. Repeat with `Pressable` + `router.push`. File upstream only if the Text `Link` alone flakes.
3. Warm deep link: `adb shell am start -a android.intent.action.VIEW -d rillwood://<route> app.rillwood.client`, 5 runs; cold after `am force-stop`.
4. Release build with an unguarded route, steps 2-3 again; confirm bundle contents with `strings`.
5. Record emulator API level, RAM and results in `docs/test-plans/`.
