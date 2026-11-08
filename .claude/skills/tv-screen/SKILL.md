---
name: tv-screen
description: Draft - build or rework one Apple TV screen for Rillwood the agreed way - shared hook, Phone / Tv views in src/screens/phone and src/screens/tv, one screenFor switch in the route, TV tokens, tests with Platform.isTV, then a fresh tvOS simulator install. Use when the user wants to build, port or rework a TV screen (roadmap TV tasks).
---

Build or rework one Apple TV screen. Usage: `/tv-screen <screen>` (e.g. `/tv-screen library`). Rules: `docs/decisions/tv-code-structure.md` - read it first. Work in the TV worktree on the task's branch (`/task-init` first if there is none).

> **NEVER add Claude as co-author or any AI attribution** - applies to anything this skill writes.

---

## Step 1 - Spec

- Roadmap TV task for the screen (`docs/roadmap.md`, TV section) and its draft in `docs/research/apple-tv-screens.html` (the number in brackets).
- The current route file (`app/src/app/...`) and every `Platform.isTV` in it and the components it uses: `grep -rn "Platform.isTV" app/src`.
- List what the draft wants that the phone screen doesn't do, and any decision the user must make (focus on open, what's left out). Ask once, then go on.

---

## Step 2 - Shared hook

Move the screen's logic out of the route into `app/src/use<Screen>.ts`: fetches, derived layout, state, handlers - everything both views need. No JSX, no platform checks. Phone behaviour must not change: run the screen's existing tests before going on.

---

## Step 3 - Views

- `app/src/screens/phone/Phone<Screen>.tsx` - the current phone / tablet JSX, moved as is (fix relative `require` paths).
- `app/src/screens/tv/Tv<Screen>.tsx` - the TV view from the draft. Build from the TV pieces (`TvButton`, `TvTextField`, `TvShelf`, `TvHero`, `TvMenu` via `ActionSheet`) and `tv` tokens; new TV-only pieces go in `app/src/components/tv/Tv*.tsx` (shared ones stay in `app/src/components/`).
- Neither view checks `Platform.isTV`. A size-only difference in a shared component → a token in `app/src/theme.ts`; a missing feature → `features.*` in `app/src/device.ts`.

TV rules (CLAUDE.md §3): focus by geometry - one column or a `TVFocusGuideView`; full-width `autoFocus` guides for rows; top buttons scroll back to the top; one `primary` button; never disable a TV button; no RN `Modal` (use `ActionSheet` → `TvMenu`); system text colours in text fields.

---

## Step 4 - Route

```tsx
// SPDX-License-Identifier: GPL-3.0-or-later
// <What the screen is>. Route only: the phone / tablet or the Apple TV screen (`src/screens/phone/`, `src/screens/tv/`).
import { screenFor } from '@/device';
import { Phone<Screen> } from '@/screens/phone/Phone<Screen>';
import { Tv<Screen> } from '@/screens/tv/Tv<Screen>';

export default screenFor({ phone: Phone<Screen>, tv: Tv<Screen> });
```

Route params (`useLocalSearchParams`, redirects) stay in the route or the hook, never in both views.

---

## Step 5 - Tests

- Existing screen tests keep passing untouched (they render the route).
- TV render test in `app/src/__tests__/tv-<screen>.test.tsx`: switch `Platform.isTV` with `Object.defineProperty(Platform, 'isTV', { get: () => true, configurable: true })` in `beforeEach`, restore in `afterEach` (block bodies, not arrow returns - typecheck). Cover: what has focus on open (`hasTVPreferredFocus`), main action, empty / error state.
- Pure logic added to the hook or `items.ts` / `detail.ts` → unit tests.
- `cd app && npm run check`.

---

## Step 6 - Simulator

The user's Apple TV simulator, fresh state every time (uninstall first). From `app/`:

```bash
EXPO_TV=1 CI=1 npx expo prebuild --clean -p ios   # only if ios/ isn't the tvOS project or native deps changed
cd ios && xcodebuild -workspace Rillwood.xcworkspace -scheme Rillwood -configuration Release \
  -sdk appletvsimulator -destination 'generic/platform=tvOS Simulator' ARCHS=arm64 CODE_SIGN_IDENTITY=- \
  -derivedDataPath <scratchpad>/dd-tv build
xcrun simctl terminate <udid> app.rillwood.client; xcrun simctl uninstall <udid> app.rillwood.client
xcrun simctl install <udid> <scratchpad>/dd-tv/Build/Products/Release-appletvsimulator/Rillwood.app
xcrun simctl launch <udid> app.rillwood.client
```

UDID: `xcrun simctl list devices booted`. Don't screenshot or send input unless the user asks - tell them what to check (focus on open, every direction from the edges, Menu / Back, the main action).

---

## Step 7 - Docs + submit

- `docs/roadmap.md` - tick the TV task with what's left.
- `docs/decisions/tv-code-structure.md` - tick the step if this screen was on its list.
- `CLAUDE.md` §4 - new files in `src/screens/phone/` / `tv/`, new `Tv*` components (`src/components/tv/`).
- Then `/submit-code` → `/create-pull-request`.
