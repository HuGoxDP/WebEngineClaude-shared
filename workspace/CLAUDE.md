# WebEngine workspace

The folder that holds every repository of the WebEngineTS ecosystem. It is **not** a git
repository itself; each subfolder is its own repo with its own `CLAUDE.md`. Copied here by
`.claude-shared/workspace/clone-all.*` — edit the original in `.claude-shared`, not this copy.

@.claude-shared/ECOSYSTEM.md
@.claude-shared/ENGINE-GAPS.md

| Folder | Repo | Default branch |
|---|---|---|
| `WebEngineTS/` | engine + docs | `master` |
| `ScenarioCreator/` | scenario content + ZIP builder | `master` |
| `WebEngineTSEditor/` | editor (`app/` Angular) | `master` |
| `testv/virtual-lab/` | student platform | `main` |
| `.claude-shared/` | shared plan, task cards, gap registry | `main` |

Rules when working from this root:

- Before editing a repo, read **that repo's** `CLAUDE.md`; its rules apply to its files.
- Commit **per repository** (`git -C <folder> ...`); one change that spans repos is one commit in
  each, engine first.
- An engine change reaches the consumers only through `npm run release:local` in `WebEngineTS/`.
- Plans and task cards: `.claude-shared/PLAN.md`, `.claude-shared/tasks/`.
- **Engine code graph** (only if `WebEngineTS/graphify-out/graph.json` exists): before grepping or reading engine code, run
  `graphify query "…"` / `graphify explain "File.ts::Symbol"`; without `GRAPHIFY_OUT` set, add `--graph WebEngineTS/graphify-out/graph.json`.
  Output paths are relative to `WebEngineTS/`. The graph reflects the last commit: read files in `git -C WebEngineTS status` directly.
  Never run `graphify update`/`extract` from this root or a worktree; rebuild only on request, `cd WebEngineTS && graphify update .`.
  Recipes: `WebEngineTS/CLAUDE.md` § Knowledge graph (graphify).
