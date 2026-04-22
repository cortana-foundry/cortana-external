# cortana-external Agent Notes

Use these rules when working in `cortana-foundry/cortana-external`, especially from the Mac mini over SSH.

## Publish Flow

- Prefer local `git` and local `gh` on the Mac mini for branch creation, push, and PR creation.
- Do not rely on the GitHub connector to create branches or PRs for this repo; it may fail with `403 Resource not accessible by integration`.
- Default to draft PRs unless the user explicitly asks for a ready-for-review PR.

## Remote Shell Safety

- The Mac mini remote shell is `zsh` with `nomatch` enabled.
- Do not send raw `[codex]`-style strings inside double-quoted remote commands.
- For complex remote commands, prefer `ssh <host> "bash -lc '...'"` or write content to a temp file first.
- Do not inline Markdown with backticks into remote shell commands. Use a file and pass `--body-file` to `gh pr create` or `gh pr edit`.

## Git Hygiene

- Check `git status --short --branch` before branching, committing, or pushing.
- Stage only the intended files. Do not sweep up unrelated worktree changes.
- When starting from `main`, use `codex/<description>` branch names unless the user requests otherwise.

## Repo-Specific Defaults

- Base branch is `main`.
- The reliable PR path for this repo is: local commit, `git push -u origin <branch>`, then `gh pr create`.
- If a PR body needs code spans or markdown, write it to a temp `.md` file first and then pass `--body-file`.
