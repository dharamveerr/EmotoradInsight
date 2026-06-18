---
description: Show what is pending to commit/push to GitHub
---

Check what is pending to be pushed to GitHub. Run ONLY read-only git commands (`git status --short`, `git log origin/main..HEAD --oneline`, `git diff --stat`, `git fetch --dry-run` is allowed too). NEVER run `git add`, `git commit`, or `git push`.

Report clearly:
1. **Uncommitted changes** — modified/new files not yet committed (from `git status --short`)
2. **Committed but not pushed** — local commits ahead of origin/main (from `git log origin/main..HEAD --oneline`)
3. If nothing is pending, say "Everything is pushed — GitHub is up to date."

Keep the answer short — a simple list of files and commits.
