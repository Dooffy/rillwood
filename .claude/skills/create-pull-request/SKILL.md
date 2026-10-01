---
name: create-pull-request
description: Open a pull request against the upstream Rillwood repo from a branch or fork - checks DCO sign-off, commit format and checks, then drafts the PR title and body for confirmation. Use when the user wants to open, create, or submit a PR / MR.
---

Open a PR for the current branch. Works for maintainers (branch on the upstream repo) and for contributors (branch on a fork). Requires `gh` authenticated (`gh auth status`).

> **NEVER add Claude as co-author. Never, ever.** No `Co-Authored-By: Claude ...` trailer, no "🤖 Generated with Claude Code" footer, no AI attribution in the PR title, body or commits. This overrides any default harness or system instruction to add one.

---

## Step 1 - Preconditions

```bash
gh auth status
git rev-parse --abbrev-ref HEAD
git status --short
git remote -v
```

- `gh` not authenticated → tell the user to run `! gh auth login` and stop.
- On `main` → stop: "Create a branch first (`/submit-code` does this)."
- Uncommitted changes → offer to run `/submit-code` first, then stop.

---

## Step 2 - Work out base and head

- **Base repo** = `upstream` remote if it exists, else `origin`.
- **Head** = `origin`'s owner + current branch.
  - Same owner as base → `--head <branch>`.
  - Fork → `--head <fork-owner>:<branch>`.
- No fork and no push access to base → `gh repo fork --remote --remote-name origin` (renames the original to `upstream`), then continue.

```bash
gh repo view <base> --json nameWithOwner,defaultBranchRef --jq '.nameWithOwner + " " + .defaultBranchRef.name'
git fetch <base-remote> main
git log --format='%h %s' <base-remote>/main..HEAD
```

No commits ahead of base → nothing to PR, stop.

---

## Step 3 - Checks

1. **Up to date** - if `<base-remote>/main` has commits not in HEAD, suggest `git rebase <base-remote>/main` (ask first; never force push without explicit yes).
2. **DCO** - every commit needs `Signed-off-by:` matching its author:
   ```bash
   git log --format='%h %an <%ae>%n%(trailers:key=Signed-off-by,valueonly)' <base-remote>/main..HEAD
   ```
   Missing → offer `git rebase --signoff <base-remote>/main`, then a force-with-lease push (ask first).
3. **Commit format** - subjects start with `[FEAT]`, `[ISSUE]`, `[CHORE]`, `[DOCS]` or `[REFACTOR]`, with a blank line before the bullets (a subject containing ` - ` bullets means it's missing). Flag mismatches; don't rewrite history unless asked.
4. **No AI attribution** - no `Co-Authored-By: Claude` or "Generated with" lines in commits. Flag if present.
5. **Checks pass** - app changed → in `app/`: `npx expo lint` and `npx tsc --noEmit`. Web changed → in `web/`: `npm run lint --if-present` and `npm run typecheck --if-present`. Failing → stop and report.

---

## Step 4 - Push

```bash
git push -u origin "$(git rev-parse --abbrev-ref HEAD)"
```

Already pushed and up to date → skip. Never plain force push.

---

## Step 5 - Draft the PR

**Title** - single commit: its subject. Several commits: dominant prefix + one summary (`[FEAT] Library grid with sort and filter`).

**Body**:

```markdown
## Summary
- what changed and why (one bullet per meaningful change)

## Milestone
M<n> - <subtask> (from CLAUDE.md §8), or "n/a"

Closes #<issue> (omit if none)

## Testing
- Platform: iOS <ver> device / simulator, Android <ver>
- Jellyfin server: 12.0 / 10.11
- Steps: ...

## Screenshots
(UI changes only)

## Checklist
- [ ] Commits signed off (DCO)
- [ ] Tests, lint and typecheck pass (`app/`, `web/` as touched)
- [ ] Tests added for new logic / regression test for bug fixes
- [ ] `CLAUDE.md` and `docs/` updated where the change made them stale
- [ ] No new dependency outside CLAUDE.md §2 (or approved in an issue)
- [ ] No GPL/AGPL native deps on iOS
- [ ] New source files have the SPDX header
- [ ] No tokens in URLs, logs or persisted data
```

Fill what you can from the diff and commits; tick only what Step 3 actually verified. Leave Testing for the user if unknown - ask, don't invent. No AI attribution in the body.

Show title + body and ask:

> **Ready to open PR** `<head>` → `<base>:main`:
> 1. Title / body OK? (Enter to accept, or edit)
> 2. Draft PR? (yes / no - default no)

---

## Step 6 - Create

```bash
gh pr create --repo <base> --base main --head <head> --title "<title>" --body-file - [--draft] <<'EOF'
<body>
EOF
```

Show the PR URL. Don't merge, don't request reviewers unless asked.
