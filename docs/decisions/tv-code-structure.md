# Apple TV code structure

Date: 2026-11-07. Roadmap TV task 4c. Background: `docs/decisions/tv-build.md` (one bundle, `Platform.isTV` at runtime).

## Problem

TV screens grew inside the phone screens: `Platform.isTV` checks spread across ~15 files, 15 in Home alone. Every TV
change touches phone code and every phone change has to read past TV branches.

## Decision

| Rule                          | What                                                                                                                                                                                                                                                                                                                                                                                                                      | Why                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1. One switch per screen      | A screen that looks different on TV = two views, `src/screens/phone/Phone<Screen>.tsx` (phone + tablet) + `src/screens/tv/Tv<Screen>.tsx`. The route file only picks: `export default screenFor({ phone, tv })` (`src/device.ts`). Neither view checks the platform                                                                                                                                                       | The check lives in one place; each view reads straight through          |
| 2. Logic in a shared hook     | Fetches, layout, state the two views share go in a `use<Screen>` hook (`src/use<Screen>.ts`), like `useSignIn` / `useServerConnect` / `useHome`                                                                                                                                                                                                                                                                           | Behaviour stays identical on both, views stay JSX                       |
| 3. Sizes are tokens           | A shared component that only differs in size or type (cards, shelves) reads `deviceSizes.*` in `src/theme.ts` (getters, read on use), not `Platform.isTV`                                                                                                                                                                                                                                                                 | One place to tune the TV scale                                          |
| 4. Ask what the device can do | Missing features read `features.*` from `src/device.ts`, not the platform: `downloads`, `rotation`, `touch` (player gestures, pull to refresh), `lastingFiles` (`src/persist.ts`)                                                                                                                                                                                                                                         | Reads as intent; Android TV later touches one file                      |
| 5. Group by device            | Device-only code in a folder per device, shared code at the folder root: `src/screens/phone/`, `src/screens/tv/`; TV-only pieces (`TvButton`, `TvTextField`, `TvShelf`, `TvHero`, `TvMenu`) in `src/components/tv/` (another device: `<folder>/<device>/`). Files keep the device prefix (`TvWelcome.tsx`, not two `Welcome.tsx`). A shared component may hand off to its TV piece in one spot (`ActionSheet` → `TvMenu`) | Easy to find; a later build-time split (or Android TV) works per folder |

Stays as is: the navigation shell (`(tabs)/_layout.tsx`, `navigation.ts` tabs, `TabsSidebar`) and root stack options - they are the TV / phone split itself.

`screenFor` picks on render, not at import: tests switch `Platform.isTV` per test. Rules 1-4 also make a build-time split
possible later (Metro preferring `*.tv.tsx` when `EXPO_TV=1`, no phone code in the TV bundle) - needs a spike first
(expo-router route files, Jest, typecheck, CI bundle check).

## Steps

| #   | Change                                                                                                                                                                                                                                | Status |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | `src/device.ts` (`screenFor`), `src/screens/phone/` + `tv/`; Welcome as the pilot (`PhoneWelcome`, `TvWelcome`)                                                                                                                       | Done   |
| 2   | Sign in: `PhoneSignIn` into `src/screens/phone/`, `TvSignIn` into `src/screens/tv/`; the route reads the server, then `screenFor`                                                                                                     | Done   |
| 3   | Home: `useHome()` out of `home.tsx`, `PhoneHome` + `TvHome`; shelves shared in `HomeRows` (the view passes its shelf)                                                                                                                 | Done   |
| 4   | `features` in `src/device.ts` (getters, read on use): downloads (download buttons, Go to Downloads), rotation, touch (player gestures, pull to refresh), lasting files. The Downloads tab stays with the tabs list (navigation shell) | Done   |
| 5   | TV tokens: `deviceSizes` in `src/theme.ts` for `Card` text and `shelfCards`; `Message` only differed in downloads (`features.downloads`)                                                                                              | Done   |
| 6   | Cleanup: other device-only components and screens into their device folders (`components/phone/` where it helps)                                                                                                                      |        |
| 7   | Spike: `*.tv.tsx` build-time split                                                                                                                                                                                                    |        |

New TV screens (Library, detail, Search, ...) follow the rules from the start - `/tv-screen` skill.
