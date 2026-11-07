# M0.4 — engine typecheck hooks in workspace-root sessions

Branch `M0.4-typecheck-hooks` (engine `10e1757`, `.claude-shared` this commit). Date: 2026-11-07.

## What is proven, what is inferred

**Proven (simulated with the real scripts, realistic PostToolUse/Stop JSON on stdin):**

With the old scripts and `CLAUDE_PROJECT_DIR` set to the workspace root (i.e. if the hooks *were*
loaded there):

| Edited file | Result |
|---|---|
| `WebEngineTS/src/…` | marker written, Stop runs `npm run typecheck` in `WebEngine/` -> `ENOENT package.json` -> **blocks with a bogus error** |
| `virtual-lab/frontend/src/App.ts` | marker written (`/src/` matches), same bogus block |
| `.code-foundations/worktrees/<ID>/WebEngineTS/src/…` | marker written, same bogus block (and would never check the worktree) |

With `CLAUDE_PROJECT_DIR` = the engine the old scripts worked. So the scripts were written for
sessions launched inside `WebEngineTS/` only. Transcripts: 14 of 14 root sessions; none contains a
PostToolUse/Stop hook event (the root's graphify `PreToolUse:Bash` hook does appear), consistent
with the hooks not being loaded, though a silent success leaves no trace either.

**Inferred (not provable from a transcript):** that Claude Code does not load
`WebEngineTS/.claude/settings.json` in a session launched at the root. This is Claude Code's
documented rule (project settings come from the launch folder), and it matches the missing
events. The owner check below turns it into a proof.

## The fix (engine `.claude/hooks/typecheck-{mark,run}.mjs`)

- `typecheck-mark.mjs`: resolves the edited path against the payload's `cwd`, walks up to the
  nearest ancestor that has `.claude/hooks/typecheck-run.mjs` **and** a `package.json` with a
  `typecheck` script (an engine checkout: main or task worktree). No such ancestor -> records
  nothing (virtual-lab, editor, ScenarioCreator). The path relative to that checkout must be
  `src/**/*.ts(x)|mts|cts`. The checkout is appended (deduplicated) to the per-session marker,
  one checkout per line.
- `typecheck-run.mjs`: reads and removes the marker, honours `stop_hook_active`, runs
  `npm run typecheck` in **each recorded checkout** (not `CLAUDE_PROJECT_DIR`). Failures are
  joined into one `block` reason, each prefixed `In <checkout>:`. A checkout without
  `node_modules` (worktree before `npm ci`) is skipped with a `systemMessage` instead of a bogus
  block.
- `.claude/settings.json` unchanged: sessions launched in `WebEngineTS` keep working (same logic,
  the checkout comes from the file path, which equals the project dir there).
- Subagent edits fire PostToolUse in the same session (marker keyed by `session_id`) and are
  checked at the parent's Stop. Inferred from the brief, not measured.
- Pinned by `tests/ClaudeTypecheckHooks.test.ts` (9 cases: main checkout clean/broken, worktree
  vs main isolation, two checkouts in one turn, another repo ignored, non-src/non-ts ignored,
  missing node_modules, `stop_hook_active`, relative path + cwd).
- Windows pitfall hit while writing it: the `[\\/]` path-separator class lost a backslash on the
  first write and silently matched nothing on Windows paths; the test caught it.

Real-engine simulation (root `CLAUDE_PROJECT_DIR`, absolute script path, worktree edit with a
planted `export const x: number = "a"`): block naming the worktree; after removing it, silent
pass; a `virtual-lab/…/src/App.ts` edit left no marker.

## Root registration (after the merge — the dispatcher applies it)

Machine-local `C:\Users\HuGox\WebstormProjects\WebEngine\.claude\settings.local.json`, existing
`env` and `PreToolUse` kept, two events added. It points at the **main checkout's** scripts, so it
works only after the engine branch is merged into `WebEngineTS/` master.

```json
{
  "env": { "GRAPHIFY_OUT": "C:/Users/HuGox/WebstormProjects/WebEngine/WebEngineTS/graphify-out" },
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash|Grep",
        "hooks": [ { "type": "command", "command": "C:/Users/HuGox/.local/bin/graphify.EXE hook-guard search", "timeout": 10 } ] }
    ],
    "PostToolUse": [
      { "matcher": "Write|Edit",
        "hooks": [ { "type": "command", "command": "node \"C:/Users/HuGox/WebstormProjects/WebEngine/WebEngineTS/.claude/hooks/typecheck-mark.mjs\"", "timeout": 15 } ] }
    ],
    "Stop": [
      { "hooks": [ { "type": "command", "command": "node \"C:/Users/HuGox/WebstormProjects/WebEngine/WebEngineTS/.claude/hooks/typecheck-run.mjs\"", "timeout": 180, "statusMessage": "Typechecking engine src/..." } ] }
    ]
  }
}
```

A session launched inside `WebEngineTS/` does not read the root's settings, so the hooks never
double-fire.

## Manual check (owner)

1. After the merge and the JSON above, start a **new** root session (hooks load at session start).
2. Ask it to add `export const probe: number = "a";` to a file under `WebEngineTS/src/` and end the
   turn. Expected: the Stop hook shows "Typechecking engine src/..." and blocks with the tsc error.
3. Fix it / end the turn again: no block. Edit a file under `virtual-lab/**/src/`: no typecheck.
