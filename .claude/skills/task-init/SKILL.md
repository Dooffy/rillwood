---
name: task-init
description: Start a new Rillwood task - takes a short task description, creates a correctly named branch off the latest main, and stores the description for later /submit-code and /create-pull-request. Does not push. Use when the user wants to start, begin, or init a task, feature, fix or PR.
---

Start a task branch. Usage: `/task-init <short description>`, e.g. `/task-init library grid paging and sort`.

> **NEVER add Claude as co-author or any AI attribution** - applies to anything this skill writes.

---

## Step 1 - Description

- No description given → ask for one (one line, what the task does). Don't continue without it.
- Keep it as given; it's stored, not rewritten.

---

## Step 2 - Preconditions

```bash
git rev-parse --abbrev-ref HEAD
git status --short
git fetch origin main
```

- Uncommitted changes → stop and ask: commit them first (`/submit-code`), stash them (`git stash -u`), or carry them onto the new branch. Never discard.
- `fetch` fails (offline) → warn and branch from local `main` instead.

---

## Step 3 - Name the branch

Format: `<type>/<slug>`

| Type | When the description is about |
|---|---|
| `feat` | New feature or capability |
| `issue` | Fixing a bug |
| `chore` | Deps, config, build, tooling, CI |
| `docs` | Docs only |
| `refactor` | Restructuring, no behaviour change |

Slug: 2-5 lowercase words from the description, kebab-case, ASCII only, ≤ 40 chars, no personal names. E.g. `library grid paging and sort` → `feat/library-grid-paging`.

Check it's free:

```bash
git rev-parse --verify --quiet "refs/heads/<branch>" ; git ls-remote --exit-code --heads origin "<branch>"
```

Taken → append `-2` (or ask).

Also look in `docs/roadmap.md` for an unticked milestone task that matches the description; note it (e.g. `M3 - Library grid`) for the summary.

Show the proposed name and type in one line and continue unless the user objects - don't ask a multi-question form.

---

## Step 4 - Create

```bash
git switch -c "<branch>" origin/main      # or main if offline
git config "branch.<branch>.description" "<description>"
```

Do **not** push and do **not** set an upstream - `/submit-code` pushes with `-u` later.

---

## Step 5 - Summary

> **Task started** on `<branch>` (from `origin/main` @ `<short sha>`)
> - Description: <description>
> - Milestone: <M# - task> (or "none matched")
> - Next: make changes → `/submit-code` → `/create-pull-request` → `/merge-pr` (maintainer)
