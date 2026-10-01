#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Checks commits in RANGE against CLAUDE.md §10: [PREFIX] subject, blank line before body,
# DCO sign-off, no AI attribution.
set -euo pipefail

range="${1:?usage: check-commits.sh <base>..<head>}"
fail=0

shas=$(git rev-list --no-merges "$range") || { echo "::error::cannot resolve commit range $range"; exit 1; }

for sha in $shas; do
  subject=$(git log -1 --format=%s "$sha")
  body=$(git log -1 --format=%B "$sha")
  line2=$(printf '%s\n' "$body" | sed -n '2p')
  short=${sha:0:7}

  if ! [[ "$subject" =~ ^\[(FEAT|ISSUE|CHORE|DOCS|REFACTOR)\]\ .+ ]]; then
    echo "::error::$short subject must start with [FEAT|ISSUE|CHORE|DOCS|REFACTOR]: $subject"; fail=1
  fi
  if [[ -n "$line2" ]]; then
    echo "::error::$short needs a blank line after the subject"; fail=1
  fi
  if ! grep -qE '^Signed-off-by: .+ <.+>$' <<<"$body"; then
    echo "::error::$short is missing a DCO Signed-off-by line (git commit -s)"; fail=1
  fi
  if grep -qiE 'co-authored-by:.*(claude|anthropic)|generated with .*claude|noreply@anthropic\.com' <<<"$body"; then
    echo "::error::$short contains AI attribution"; fail=1
  fi
done

[[ $fail -eq 0 ]] && echo "Commit checks OK for $range"
exit $fail
