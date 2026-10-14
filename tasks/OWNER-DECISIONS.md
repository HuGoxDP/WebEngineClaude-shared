# Owner decisions

What an agent must not decide alone — each is outward-facing, hard to undo, or a matter of taste.
Each has the recommended answer. Record the owner's answer here (date + choice) and the card that
waits on it can proceed.

| # | Decision | Recommended | Blocks | Answer |
|---|---|---|---|---|
| 1 | Merge the `claude/scenario-platform-architecture-24f9fy` branches into `main`/`master` in all four repos (and the stale `integration/engine-tasks-e1-e4`, `fix/e1-…`, `feat/e2-…`, `docs/e3-…`, `docs/e4-…` branches in WebEngineTS deleted) | **Yes**, via a PR per repo after Phase A's engine cards, so `v0.2.0` is tagged on `main` | A9 | |
| 2 | Cut `v0.2.0` (publishes a GitHub Release) | **Yes**, after A1–A8 | A9 | |
| 3 | Back up `WebEngineTS/design/Article` locally before pulling `main` — the merge deletes it from the working tree (it stays in history and on `Test_changing`) | **Do it** before step 1 | 1 | |
| 4 | Student hardware to budget for: Intel UHD laptops, Chromebooks, Android tablets, phones? | Answer in the vision doc's comment; the budgets in its "Производительность" section depend on it | performance budgets, N4 | |
| 5 | Ids on **every** component of every scene (Unity's model) in addition to A5's prefab-scoped ids | **Not now**; additive later if co-editing (R4) needs it | — | |
| 6 | `CLAUDE.md` says "JSDoc only on public/protected"; the engine has 615+95 documented private members | **Amend the rule** to "on private members only when it explains why"; do not strip existing docs | A2 | |
| 7 | Which ten behaviours the editor's library starts with (C4) | The list in C4, adjusted to the courses that will use it first | C4 | |
| 8 | Player on a separate origin (B5): which domain (`play.<domain>`) | A subdomain on the same host and certificate | B5 | |
| 9 | LTI: which LMS first, and does a scenario report a score? | Moodle; yes, a 0..1 score + completed flag | P1 | |
| 10 | A server-side project store (R1) vs browser-only OPFS | **OPFS first** (no server state, no auth); server store when share links or co-editing are scheduled | R1 | |
| 11 | Deploy: who runs `docker compose up` on the production server after A10, and when (between lessons) | Owner, outside teaching hours; e2e against the deployed site afterwards | A10 | |

Already decided (for reference, do not reopen without a reason): link mode only in project files,
expanded at Build (Q1, 2026-10-13); component ids scoped like node ids (Q2, 2026-10-13); updating a
published scenario goes through a draft an admin accepts (2026-10-09); the editor looks and works like
Unity (2026-10-09); `N3`'s `of` binding, `N6`'s `after`, no `path` where `node` is set (A1 —
made by the plan before the format freezes; the owner may overrule before `v0.2.0`).
