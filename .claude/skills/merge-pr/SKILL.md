---
name: merge-pr
description: Maintainer-only - squash-merge a Rillwood PR into main with a private author identity, the [PREFIX] message format and DCO sign-off, then clean up local branches. Use when the maintainer wants to merge, land, or finish a PR.
---

Squash-merge a PR. Usage: `/merge-pr [number]` (default: PR of the current branch). **Maintainers only** - contributors stop at `/create-pull-request`.

> **NEVER add Claude as co-author or any AI attribution** - not in the squash subject, body or trailers.

> **Privacy:** a squash commit is created by GitHub with the merger's **GitHub identity**, not local git config. The author email is always pinned to the noreply address and the profile name must be the handle. Never merge via the web button.

---

## Step 1 - Identify

```bash
gh pr view <n> --json number,title,state,isDraft,baseRefName,headRefName,author,mergeable,mergeStateStatus,reviewDecision,statusCheckRollup,commits,body
```

- Not `OPEN` → stop.
- `isDraft` → stop: "Mark ready for review first."
- Base is not `main` → stop and ask.
- No permission to merge (`gh repo view --json viewerPermission` not `ADMIN`/`MAINTAIN`/`WRITE`) → stop: "Maintainers only."

---

## Step 2 - Ready to merge?

- **Checks** - every entry in `statusCheckRollup` is `SUCCESS` - all CI checks: Lint, Typecheck, Format, Unit tests, Expo doctor, Bundle (iOS + Android), Licences, Commit format + DCO. Failing / pending → stop.
- **Review** - `reviewDecision` is `APPROVED`, or the repo has no required reviewers (solo maintainer: confirm a self-review was done). Unresolved review threads → stop and list them.
- **Up to date** - `mergeStateStatus` `BEHIND` / `DIRTY` → stop: rebase the head branch on `origin/main` locally (`TZ=UTC git rebase ...`), re-run checks, `git push --force-with-lease` **to the head branch only** (ask first), then re-run this skill.

---

## Step 3 - Re-check commits

```bash
gh pr view <n> --json commits --jq '.commits[] | .oid[0:7] + " " + .messageHeadline + " | " + (.authors | map(.email) | join(","))'
```

- Every commit has `Signed-off-by:` (DCO). Missing → stop (contributor fixes with `git rebase --signoff`).
- No `Co-Authored-By: Claude`, "Generated with", or any AI attribution. Present → stop.
- No personal emails or names that aren't the commit author's chosen identity. For maintainer commits: author must be the noreply address.

---

## Step 4 - Privacy guard

```bash
gh api user --jq '.login + " name=" + (.name // "")'
gh api user --jq '.id'
```

- Profile `name` must be empty or equal to the login. Anything else → stop: "Set GitHub Settings → Profile → Name to your handle or clear it - the squash commit uses it as author name."
- Noreply email = `<id>+<login>@users.noreply.github.com`. Always pass it with `--author-email`.

---

## Step 5 - Squash message

Build from the PR (not GitHub's default, which concatenates every commit):

```
[PREFIX] PR title summary (#<n>)

- bullet per meaningful change (from the PR Summary / commit bullets, deduped)

Signed-off-by: <each distinct commit author, from their Signed-off-by lines>
```

- Subject = PR title (already `[PREFIX] ...`) + ` (#<n>)`, ≤ 72 chars, hyphens not em dashes.
- Blank line after the subject (required).
- Keep every contributor's `Signed-off-by:` line so DCO survives the squash. Add `Co-authored-by:` only for other **human** commit authors, using their commit identity.

Show the subject + body and ask once:

> **Ready to squash-merge** #<n> `<head>` → `main` as `<login> <noreply>`:
> ```
> <subject>
>
> <body>
> ```
> Merge? (yes / no)

---

## Step 6 - Merge

```bash
gh pr merge <n> --squash --delete-branch \
  --author-email "<id>+<login>@users.noreply.github.com" \
  --subject "<subject>" \
  --body-file - <<'EOF'
<body>
EOF
```

Never `--merge` or `--rebase` (the repo allows squash only). Never the web button.

---

## Step 7 - Verify and clean up

```bash
gh api repos/{owner}/{repo}/commits/main --jq '.commit.author.name + " <" + .commit.author.email + "> | " + .commit.message'
git switch main && git pull --ff-only
git branch -D <head>          # squash means the branch isn't "merged" by ancestry
git fetch --prune
```

- Author on `main` must be `<login> <noreply>`. Anything else → tell the maintainer immediately (history may need rewriting before the repo is public).
- Branches stacked on the merged one: `TZ=UTC git rebase --onto origin/main <old-head> <stacked-branch>`, then force-with-lease push that branch.

Show: merged commit hash, subject, author.
