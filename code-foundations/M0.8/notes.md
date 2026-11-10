# M0.8 — guard review: is the graphify PreToolUse nudge useful?

Branch `M0.8-graphify-guard-review`, `.claude-shared` only (the reviewed hook lives in the
machine-local root `settings.local.json`, which is not in any repo). Date: 2026-11-10. W1.

**Verdict: useful — keep the nudge exactly as configured, no settings change.**

## What is under review

Root `C:\Users\HuGox\WebstormProjects\WebEngine\.claude\settings.local.json` (registered with
M0.4, `code-foundations/M0.4/notes.md`):

- `env.GRAPHIFY_OUT` → the engine main checkout's `WebEngineTS/graphify-out`
- `PreToolUse`, matcher `Bash|Grep` → `C:/Users/HuGox/.local/bin/graphify.EXE hook-guard search`,
  timeout 10 s. It is the only nudge; the other two hooks (typecheck mark/run) are M0.4's, already
  reviewed there.

## Measured (real `graphify.EXE`, this machine, 2026-11-10, `GRAPHIFY_OUT` set, payloads on stdin)

| Input | Result |
|---|---|
| `Grep` tool, pattern inside the engine (`path: "src"`) | Nudge: `additionalContext` naming the graph, why graphify beats grepping, `Start with: graphify explain "SceneSerializer"`, **and the hits the graph already has** (e.g. `SceneSerializer → src/engine/core/serialization/SceneSerializer.ts L313`) |
| `Bash`, `grep -rn "SceneSerializer" src/` | Same nudge, same graph hits (the guard parses the search pattern out of the command) |
| `Bash`, `rg --files \| rg transform` | Generic nudge without node hits (pipe defeats symbol extraction) — still the reminder, no wrong answer |
| `Bash`, `ls -la src/` | Silent, exit 0 |
| `Bash`, `git grep -n transform` | Silent, exit 0 |
| `Bash`, `sed -n 1,50p README.md` | Silent, exit 0 |
| `Bash`, `find . -name "*.ts"` | Silent, exit 0 |
| `Bash`, `npm run build`, `git diff --stat` | Silent, exit 0 |
| `Grep` tool, path `.claude-shared` or `virtual-lab` | Silent, exit 0 — outside the graph's coverage it stays out of the way |
| `Read` tool | Silent (not on its matcher) |

Every case exits **0** (advisory `additionalContext` only): the nudge can never block or break a
tool call; its cost is a few context tokens, and it answers instantly (far inside the 10 s timeout).

## Proven vs inferred

**Proven.** The hook loads and runs in root sessions: M0.4 sampled 14 of 14 root-session
transcripts and found the graphify `PreToolUse:Bash` event; the table above reproduces its live
output. The graph it points at is alive: probes return node hits, and `WebEngineTS/graphify-out`
rebuilds itself on commit/merge/checkout through the engine's git hooks (fresh rebuild 2026-11-10).

**Inferred, not measurable here.** The behavioural half — *that* agents reach for graphify because
of the nudge. The rule it reinforces ("Graphify before grep") already binds every session through
`AGENTS.md`, so the nudge reinforces an existing mandate rather than carrying it; no counterfactual
measurement exists.

## Why it stays

1. **Precision.** Fires on search-shaped inputs (Grep tool, `grep`/`rg` commands) *inside the
   engine*, silent on every other command shape and outside the graph's coverage.
2. **It pre-digests the answer.** The nudge arrives with the graph's hits and the exact next
   command, so the cheapest move is to take it instead of grepping.
3. **Cannot hurt.** Advisory only (exit 0), instant, no false-positive blocking ever observed.
4. **Cheap to keep.** One line in a machine-local settings file; removing it would only lose a
   guard rail that costs nothing.

## Follow-ups noted (no new rows)

- `M6.1` (graph for virtual-lab) is the case where the same guard could extend to the platform
  repo; until then its silence on non-engine paths is correct behaviour, not a gap.
- No tuning applied: the matcher, timeout and env are all as-measured-correct.
