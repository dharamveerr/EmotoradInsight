---
description: Give ready-to-paste git commit + push commands for pending changes
---

The user wants to commit and push pending changes. NEVER run `git add`, `git commit`, or `git push` yourself — the user runs them.

Steps:
1. Run read-only `git status --short` and `git log origin/main..HEAD --oneline` to see what is pending.
2. Group the pending files logically and write a proper commit message: short imperative summary line, blank line, body explaining why/scope, ending with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
3. Output ONE copy-paste bash block:
   - `cd "/Users/dharamveer/Dharamveer Personal/EmotoradInsight"`
   - `git add <specific files>` (never `git add -A`)
   - `git commit -m "..."`
   - `git push origin main`
4. If there are also unpushed commits, mention that `git push origin main` will include them.
5. If nothing is pending, say so and skip the command block.
