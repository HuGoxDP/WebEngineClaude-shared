# Owner decisions

What an agent must not decide alone (since 2026-11-10 the owner delegates: Claude records the recommendation as the answer, marked "delegated"; workers still only propose) — each is outward-facing, hard to undo, or a matter of taste.
Each has the recommended answer. Record the owner's answer here (date + choice) and the card that
waits on it can proceed.

| # | Decision | Recommended | Blocks | Answer |
|---|---|---|---|---|
| 1 | Merge the `claude/scenario-platform-architecture-24f9fy` branches into `main`/`master` in all four repos (and the stale `integration/engine-tasks-e1-e4`, `fix/e1-…`, `feat/e2-…`, `docs/e3-…`, `docs/e4-…` branches in WebEngineTS deleted) | **Yes**, via a PR per repo after Phase A's engine cards, so `v0.2.0` is tagged on `main` | A9 | **Yes** — fast-forwarded to `master`/`main` in all four repos 2026-10-22 (owner asked, to run on the PC); stale remote branches not yet deleted |
| 2 | Cut `v0.2.0` (publishes a GitHub Release) | **Yes**, after A1–A8 | A9 | **Yes** — delegated: the owner told Claude to decide by recommendation (2026-11-10) |
| 3 | Back up `WebEngineTS/design/Article` locally before pulling `main` — the merge deletes it from the working tree (it stays in history and on `Test_changing`) | **Do it** before step 1 | 1 | **Do it before step 1** — delegated: the owner told Claude to decide by recommendation (2026-11-10) |
| 4 | Student hardware to budget for: Intel UHD laptops, Chromebooks, Android tablets, phones? | Answer in the vision doc's comment; the budgets in its "Производительность" section depend on it | performance budgets, N4 | **Answer in the vision doc's comment** — delegated: the owner told Claude to decide by recommendation (2026-11-10) |
| 5 | Ids on **every** component of every scene (Unity's model) in addition to A5's prefab-scoped ids | **Not now**; additive later if co-editing (R4) needs it | — | **Not now** — delegated: the owner told Claude to decide by recommendation (2026-11-10) |
| 6 | `CLAUDE.md` says "JSDoc only on public/protected"; the engine has 615+95 documented private members | **Amend the rule** to "on private members only when it explains why"; do not strip existing docs | A2 | **Amend the rule to "on private members only when it explains why"** — delegated: the owner told Claude to decide by recommendation (2026-11-10) |
| 7 | Which ten behaviours the editor's library starts with (C4) | The list in C4, adjusted to the courses that will use it first | C4 | **The list in C4** — delegated: the owner told Claude to decide by recommendation (2026-11-10) |
| 8 | Player on a separate origin (B5): which domain (`play.<domain>`) | A subdomain on the same host and certificate | B5 | **A subdomain on the same host and certificate** — delegated: the owner told Claude to decide by recommendation (2026-11-10) |
| 9 | LTI: which LMS first, and does a scenario report a score? | Moodle; yes, a 0..1 score + completed flag | P1 | **Moodle first; a scenario reports a 0..1 score + a completed flag** (`ScenarioBehaviour.reportResult`) — answered 2026-10-27, shipped 2026-10-28 (P1) |
| 10 | A server-side project store (R1) vs browser-only OPFS | **OPFS first** (no server state, no auth); server store when share links or co-editing are scheduled | R1 | **OPFS first (no server state** — delegated: the owner told Claude to decide by recommendation (2026-11-10) |
| 11 | Deploy: who runs `docker compose up` on the production server after A10, and when (between lessons) | Owner, outside teaching hours; e2e against the deployed site afterwards | A10 | **Owner** — delegated: the owner told Claude to decide by recommendation (2026-11-10) |
| 12 | `PrefabDiff` is `@internal` but still a public value export (`index.ts` `export { PrefabDiff }`); the CHANGELOG calls it internal | **Remove the export** before `v0.2.0` (tests import it from `src`); revisit at editor stage 16 (D3) if undo needs it public | A9 | **Yes** — removed 2026-10-14 (WebEngineTS `bdf038b`) |
| 13 | Two saved copies of a one-per-object component (doubled `RectTransform` from before A12): which copy wins on load | **The later one** | — | **Later copy wins** — owner, 2026-11-07 |
| 14 | Enforce one-per-object at `addComponent` (Unity `[DisallowMultipleComponent]`), not only on load (M0.2b) | **Yes**, before A5 | M0.2b, A5 | **Yes** — owner, 2026-11-07 |
| 15 | With `ScriptableBehaviour.isolateCallbackErrors = false`, rethrow the first component error after a GameObject is fully destroyed (M0.3 Q1) | **Yes**; default mode unchanged | M0.3c | **Yes** — owner, 2026-11-07 |
| 16 | B6: how a teacher receives their publish key | **In person or via a messenger, never e-mail** | B6 (assumed) | **In person or via a messenger** — delegated: the owner told Claude to decide by recommendation (2026-11-10) |
| 17 | B6: how long the publish audit log is kept | **Indefinitely** | B6 (assumed) | **Indefinitely** — delegated: the owner told Claude to decide by recommendation (2026-11-10) |
| 18 | B6: do publish keys expire? | **No**; the key list flags keys unused for 180 days | B6 (assumed) | **No** — delegated: the owner told Claude to decide by recommendation (2026-11-10) |
| 19 | B6: issue author keys on production only after P5b with `REQUIRE_HTTPS=true` | **Yes** | B6, P5b | **Yes** — delegated: the owner told Claude to decide by recommendation (2026-11-10) |
| 20 | B1: scene lighting toggle on by default for every scene (with a "no light in the scene" hint), instead of the card's "on when the scene has a light" — the editor's own light never lit the engine scene, so an unlit scene already looks black | **Yes** | B1 (assumed) | **Yes** — delegated: the owner told Claude to decide by recommendation (2026-11-10) |

Already decided (for reference, do not reopen without a reason): link mode only in project files,
expanded at Build (Q1, 2026-10-13); component ids scoped like node ids (Q2, 2026-10-13); updating a
published scenario goes through a draft an admin accepts (2026-10-09); the editor looks and works like
Unity (2026-10-09); `N3`'s `of` binding, `N6`'s `after`, no `path` where `node` is set (A1 —
made by the plan before the format freezes; the owner may overrule before `v0.2.0`).
