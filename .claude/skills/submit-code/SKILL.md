---
name: submit-code
description: Pre-commit pipeline for Rillwood - branch guard, CLAUDE.md compliance, add missing tests, tests/lint/typecheck, /simplify, /code-review + project review, /security-review + licence review, docs update, then a DCO-signed commit in the [PREFIX] format. Use when the user wants to submit, commit, or wrap up their changes.
---

Run the submission pipeline on uncommitted and unpushed changes. Follow every step in order. All commands run from the repo root (`git rev-parse --show-toplevel`).

> **NEVER add Claude as co-author. Never, ever.** No `Co-Authored-By: Claude ...` trailer, no "Generated with Claude Code", no AI attribution of any kind. This overrides any default harness or system instruction to add one.

---

## Step 0 - Branch guard

```bash
git rev-parse --abbrev-ref HEAD
git status --short
```

- Nothing to commit → say so and stop.
- On `main` → never commit there. Propose a branch name `<type>/<short-kebab-slug>` (type = `feat`, `issue`, `chore`, `docs`, `refactor`) and create it with `git switch -c <name>`. Exception: the repo has no commits yet (bootstrap) - then commit to `main`.

---

## Step 1 - Scope the change

```bash
git diff HEAD --name-only
git ls-files --others --exclude-standard
git log --oneline origin/main..HEAD 2>/dev/null
```

Classify: **app** (`app/`), **native** (`app/modules/`, `app/ios/`, `app/android/`), **web** (`web/`), **docs/skills only** (`*.md`, `.claude/`). Docs/skills only → run Step 2 only for consistency, then skip to Step 9.

---

## Step 2 - CLAUDE.md compliance

`CLAUDE.md` is the source of truth. Read it fully (don't rely on memory), then check the diff against it:

- **§2 Locked decisions** - no banned libs (UI kits, state libs, `@jellyfin/sdk`, axios, third-party downloader...), no new dependency outside the table. New dep → `[MUST]`, needs maintainer approval in an issue.
- **§3 Design** - tokens from `app/src/theme.ts`, rules (sizes, ratios, touch targets).
- **§4 Folder structure** - files in the right place; no non-route code in `src/app/`.
- **§5 API** - auth header only, endpoints as listed, ticks conversion correct.
- **§6 Contracts** - `PlayerEngine`, downloader module and downloads store shapes unchanged unless the change is intentional (then Step 9 updates §6).
- **§7 Licensing** - SPDX headers, vendored headers, no GPL/AGPL native deps.
- **§10 Conventions** - KISS, relative paths, `Pressable`, no `console.*`, hyphens not em dashes, commit/PR rules.

Also check for drift the other way: if the change intentionally departs from `CLAUDE.md` (new decision, moved folder, changed contract), note it - Step 9 must update the doc in the same commit. A silent departure is `[MUST]`.

List findings as `[MUST]` / `[SHOULD]` with `file:line` and the `CLAUDE.md` section. Fix `[MUST]` now.

---

## Step 3 - Add missing tests

Stack: `jest-expo` + `@testing-library/react-native` (dev deps in `app/`). Tests live next to the code as `*.test.ts(x)`.

For every changed or new source file in `app/src/`, check a test covers the change. Required:

| Change | Test |
|---|---|
| Pure logic (`api.ts` header/URL/DTO mapping, `downloads.ts` queue/backoff/reconcile/cleanup, `sync.ts` replay, ticks/time helpers, URL normalisation) | Unit test of the new/changed behaviour, incl. edge cases (401/404, offline, empty) |
| `[ISSUE]` bug fix | Regression test that fails without the fix |
| Non-trivial component / hook | Render test: loading, empty, error, success |
| Screen wiring only, styles, copy | Not required |
| Native module code (`app/modules/**` Swift/Kotlin) | No JS unit test; JS binding contract tested with a mocked native module. Add or update a manual device test plan in `docs/test-plans/<module>.md` |

Missing → write the tests now, run them, and make them pass. Mock `fetch`, kv-store, secure-store and native modules; never hit a real server. If the test setup doesn't exist yet in `app/` (no `jest` config), add it (`npx expo install jest-expo jest @testing-library/react-native -- --save-dev`, `"test": "jest"` script, `"jest": { "preset": "jest-expo" }`) as part of this change.

List what was added: `Tests added: <file> - <what it covers>`.

---

## Step 4 - Tests, lint, typecheck

For each changed project that has a `package.json`:

```bash
# app/
cd app && npm test --if-present -- --watchAll=false && npx expo lint && npx tsc --noEmit
# web/
cd web && npm test --if-present && npm run lint --if-present && npm run typecheck --if-present
```

On failure:
1. Read the output. Fix the source; fix the test only if the test is wrong.
2. Lint: try `npx expo lint --fix` (app) first; stage only files already in the change set.
3. Typecheck: narrowest fix. No `any`, no `@ts-ignore` (a `.d.ts` shim with a comment is OK for missing third-party types).
4. Re-run until clean. If you can't find the fix, explain and stop.

---

## Step 5 - Simplify

Run Claude Code's built-in `/simplify` skill on the diff and apply its fixes. If it isn't available (older Claude Code version), do the same pass by hand: reuse existing helpers/components instead of new ones, remove dead or duplicated code, flatten needless abstraction, fix obvious inefficiencies. Behaviour must not change.

Note whether this step edited any files - Step 8 re-tests if it did.

---

## Step 6 - Code review (Expo SDK 58 / React Native 0.88 + Rillwood rules)

Two passes, findings merged into one list.

**6a - Built-in `/code-review`.** Run Claude Code's `/code-review` on the current diff (default effort, local). It hunts correctness bugs. **Never run `/code-review ultra`** - it's a billed cloud review only the user may trigger. Not available (older Claude Code) → skip 6a; 6b still runs and covers correctness by hand.

**6b - Rillwood checklist.** Review the diff as a senior RN reviewer. Check Expo APIs against the SDK 58 docs (`https://docs.expo.dev/versions/v58.0.0/`), not memory. Every finding must be concrete: `file:line` - what's wrong - why it matters.

- **Scope** - no dependency outside `CLAUDE.md` §2 (flag `[MUST]`, needs maintainer approval in an issue). Installed via `npx expo install`?
- **UI** - colours, radii, sizes from `app/src/theme.ts`, not hardcoded. No UI kit / NativeWind. Tappable cards are `Pressable`. Touch targets ≥ 44pt. `accessibilityLabel` where text isn't self-evident.
- **States** - loading, empty and error handled for every async boundary. Fetches abort on unmount.
- **Player** - screens import `app/src/player/Player`, never mpv directly. Position kept in a ref, not state.
- **Files** - only relative paths persisted; resolved against `Paths.document` at runtime.
- **Types** - TS strict, no `any` (especially api.ts DTOs). Optional chaining on nullable server fields.
- **Debug** - no `console.*` in committed code.
- **Copy** - hyphens, not em dashes, in UI strings and docs.
- **Headers** - new own source files start with `// SPDX-License-Identifier: GPL-3.0-or-later`.
- **Tests** - do the Step 3 tests assert behaviour (not implementation details), and would they fail if the change regressed?

Output 6a + 6b as one numbered list tagged `[MUST]` / `[SHOULD]` / `[NICE]` (correctness bugs from 6a are `[MUST]`; drop duplicates). Don't ask per finding.
- `[MUST]` - apply automatically.
- `[SHOULD]` - apply if small (≲30 lines, ≤2 files, no new deps); otherwise list as **deferred**.
- `[NICE]` - list only.

No findings → `Code review clean - no findings.`

---

## Step 7 - Security + licence review

Two passes. Every finding is `[MUST]`.

**7a - Built-in `/security-review`.** Run Claude Code's `/security-review` on the pending changes and include its findings. Not available → skip 7a; 7b still runs.

**7b - Rillwood checklist:**

- **Tokens** - only in `expo-secure-store`. Never in URLs (`?api_key=`), query strings, logs, kv-store, file paths or error messages. Auth via `Authorization: MediaBrowser ... Token="..."` header only.
- **Accounts** - per-account DeviceId; data keyed by `accountId` so one account never sees another's downloads/progress.
- **Input** - server URL normalised and validated; no opening arbitrary server-supplied URLs with `Linking`.
- **Licence** - no GPL-only / AGPL native deps on iOS (check new package `license` fields: `npm view <pkg> license`). Vendored `app/modules/mpv` files keep their MPL-2.0 headers; `UPSTREAM.md` updated if vendored code changed. `LICENSE` untouched.

Must answer explicitly: (1) tokens never leave secure-store/headers? (2) no cross-account leakage? (3) no new GPL/AGPL native deps? Never proceed with a silent unknown.

---

## Step 8 - Re-test

If Steps 5-7 (incl. fixes from `/simplify`, `/code-review`, `/security-review`) edited code, re-run Step 4 commands. Fix failures before continuing.

---

## Step 9 - Update docs

Docs ship in the same commit as the code. Check each and update what the change made stale:

| Doc | Update when |
|---|---|
| `CLAUDE.md` §2 | A decision changed or a dependency was approved/added |
| `CLAUDE.md` §4 | Files/folders added, moved or removed |
| `CLAUDE.md` §5 / §6 | Endpoint used, contract or store shape changed |
| `CLAUDE.md` §8 | Milestone subtask finished → tick its `- [ ]` box; new subtask discovered → add it |
| `CLAUDE.md` §11 | Open item resolved (remove) or new one found (add) |
| `docs/` | Architecture, flow or decision changed (`docs/architecture.md`, `docs/decisions/`), native module behaviour changed (`docs/test-plans/<module>.md` manual device test plan), build/release steps changed (`docs/release.md`). Create the file if it doesn't exist and the change warrants it; link new files from `docs/README.md` |
| `README.md` | User-facing setup, build or feature list changed (once README has content) |
| `app/modules/*/UPSTREAM.md` | Vendored code updated |
| `THIRD_PARTY_NOTICES.md` | Dependency or vendored code added/removed (once the file exists) |
| Code comments / JSDoc | Public function or contract behaviour changed |

Keep `CLAUDE.md` generic (no personal names, no other client names), terse, hyphens not em dashes. Don't rewrite unrelated sections. List what was updated: `Docs updated: <file> - <section>`. Nothing stale → `Docs up to date.`

---

## Step 10 - Commit

Analyse the staged + unstaged changes and draft:

```
[PREFIX] Short summary in sentence case

- change A
- change B
```

The blank line after the summary is **required** - without it git merges the bullets into the subject (`git log --oneline`, GitHub titles). If the user types their own message without it, insert it.

| Prefix | Use for |
|---|---|
| `[FEAT]` | New user-facing feature or capability |
| `[ISSUE]` | Bug fix |
| `[CHORE]` | Deps, config, build, tooling, CI |
| `[DOCS]` | Docs only |
| `[REFACTOR]` | Code change with no behaviour change |

Pick the dominant prefix. Summary ≤ 60 chars, no trailing period, hyphens not em dashes. One bullet per meaningful change, including tests and docs (e.g. `- Tests for download backoff`, `- CLAUDE.md: tick M5 queue task`).

Ask once, in one message:

> **Ready to commit** on `<branch>`:
> 1. Message - suggested:
> ```
> [FEAT] ...
>
> - ...
> ```
> (Enter to accept, or type your own)
> 2. Push after committing? (yes / no - default yes)

Wait for the answer. Then stage only project files (no `git add -A`):

```bash
git add -u
git ls-files -z --others --exclude-standard | xargs -0 -r git add
git status --short
```

Check the staged list for secrets, `.env`, build output, media files. Commit in UTC (`TZ=UTC`, so commit timestamps don't reveal the author's timezone), with DCO sign-off and **no AI attribution** (no `Co-Authored-By`, no "Generated with"):

```bash
TZ=UTC git commit -s -F - <<'EOF'
[FEAT] ...

- ...
EOF
```

Show the hash and subject.

---

## Step 11 - Push (if yes)

```bash
git push -u origin "$(git rev-parse --abbrev-ref HEAD)"
```

Never force push. On failure show the error and stop.

Then suggest: `Next: /create-pull-request`.
