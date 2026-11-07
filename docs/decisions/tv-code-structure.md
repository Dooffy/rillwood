# Apple TV code structure

Date: 2026-11-07. Roadmap TV task 4c. Background: `docs/decisions/tv-build.md` (one bundle, `Platform.isTV` at runtime).

## Problem

TV screens grew inside the phone screens: `Platform.isTV` checks spread across ~15 files, 15 in Home alone. Every TV
change touches phone code and every phone change has to read past TV branches.

## Decision

| Rule                          | What                                                                                                                                                                                                                                   | Why                                                            |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1. One switch per screen      | A screen that looks different on TV = two views, `src/screens/<screen>/Phone<Screen>.tsx` + `Tv<Screen>.tsx`. The route file only picks: `export default screenFor({ phone, tv })` (`src/device.ts`). Neither view checks the platform | The check lives in one place; each view reads straight through |
| 2. Logic in a shared hook     | Fetches, layout, state the two views share go in a `use<Screen>` hook (`src/use<Screen>.ts`), like `useSignIn` / `useServerConnect`                                                                                                    | Behaviour stays identical on both, views stay JSX              |
| 3. Sizes are tokens           | A shared component that only differs in size or type (cards, messages, shelves) reads a token resolved once in `src/theme.ts`, not `Platform.isTV`                                                                                     | One place to tune the TV scale                                 |
| 4. Ask what the device can do | Missing features (downloads, rotation, touch gestures, pull to refresh) read `features.*` from `src/device.ts`, not the platform                                                                                                       | Reads as intent; Android TV later touches one file             |
| 5. Shared TV pieces           | `TvButton`, `TvTextField`, `TvShelf`, `TvHero`, `TvMenu` stay in `src/components/`; a shared component may hand off to its TV piece in one spot (`ActionSheet` → `TvMenu`)                                                             | Reuse across TV screens                                        |

Stays as is: the navigation shell (`(tabs)/_layout.tsx`, `navigation.ts` tabs, `TabsSidebar`) and root stack options - they are the TV / phone split itself.

`screenFor` picks on render, not at import: tests switch `Platform.isTV` per test. Rules 1-4 also make a build-time split
possible later (Metro preferring `*.tv.tsx` when `EXPO_TV=1`, no phone code in the TV bundle) - needs a spike first
(expo-router route files, Jest, typecheck, CI bundle check).

## Steps

| #   | Change                                                                                                                        | Status |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | `src/device.ts` (`screenFor`), `src/screens/`; Welcome as the pilot (`PhoneWelcome`, `TvWelcome`)                             | Done   |
| 2   | Sign in: `PhoneSignIn` + `TvSignIn` into `src/screens/login/`                                                                 |        |
| 3   | Home: `useHome()` out of `home.tsx`, `PhoneHome` + `TvHome`                                                                   |        |
| 4   | `features` in `src/device.ts` (getters, read on use): downloads, orientation, player gestures, Downloads tab, pull to refresh |        |
| 5   | TV tokens for `Card`, `Message`, `shelfCards`                                                                                 |        |
| 6   | Spike: `*.tv.tsx` build-time split                                                                                            |        |

New TV screens (Library, detail, Search, ...) follow the rules from the start - `/tv-screen` skill.
