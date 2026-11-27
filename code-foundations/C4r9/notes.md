# C4r9 build notes — edit mode at boot; Play/Stop through the engine's mode switch

- Worktree: `W12/WebEngineTSEditor`, branch `C4r9-edit-mode-play`.
- Base: `origin/ms/2` @ `28203c263c7e0a887ec1609151fa614ba0ceefca` (contains EdE2E + C4r12/C4r13).
- Editor commits: `8a6ef85` (Phase 1, check), `8469211` (Phase 2, src), `3344846` (Phase 3, README).
- Claim: `wk.sh claim W12 C4r9 edit-mode-play` → `CLAIM_EXIT=0`.
- Beats: `thread-slot.sh beat coder-c4r9` → `BEAT_EXIT=0`; `wk.sh beat W12 code-done C4r9` → `BEAT_DONE_EXIT=0`.

## What changed
- NEW `app/e2e/checks/C4r9.mjs`: ten-leg, black-box AC-16 proof using only `../lib/harness.mjs` exports
  (`newPage`, `seed`, `readDisk`, `check`, `runCheck`, `play`, `stop`, `save`, `selectInHierarchy`,
  `editScript`, `noErrors`, `SCENARIO_ENTRY`). Fixture `C4r9Parent` with `Holder` (WakeMarker) and
  `Target`; `WakeMarker.awake` creates `GameObject("Spawned")` and records names on a page global.
- `play-mode.service.ts`: imports `Application`; constructor calls `enterEditMode()`; `play()` snapshots,
  sets `isPlaying`/time, calls `enterPlayMode()` in `try/catch`, `scene.notify()`, then the unchanged
  loop; `stop()` tears down in play in `try`, then `enterEditMode()` + snapshot restore in `finally`.
  Class doc rewritten as the edit/play contract. It is the only `app/src` caller of the mode APIs.
- `script-runtime.service.ts`: constructor runs `inject(PlayModeService);` so edit mode is in force
  before the first `reload()`; `_rebuildScene` documents that rebuilt objects do not wake in edit mode.
- `README.md`: new "Edit mode and Play" paragraph next to the e2e section.
- The `clean:` leg accepts the engine's expected duplicate-registration advisory from a script swap
  (`TypeRegistry.register` logs `console.error` before the editor's `TypeRegistry.replace`), exactly as
  `run.mjs` filters it; every other console line still fails the leg.

## Static verification actually run (no live editor, no Playwright)
| Command (from `app/` unless noted) | Result |
|---|---|
| `node --check e2e/checks/C4r9.mjs` | `NODE_CHECK_EXIT=0` |
| `git diff --name-status <base>` after intent-to-add | exactly `A app/e2e/checks/C4r9.mjs` |
| `npx tsc -p tsconfig.app.json --noEmit` | `TSC_EXIT=0` |
| `npm run build` | `BUILD_EXIT=0`; "Application bundle generation complete. [17.876 seconds]"; warnings: initial bundle 2.03 MB over the 1.00 MB budget, `@babel/standalone` not ESM (both pre-existing) |
| `git grep -n "enterEditMode\|enterPlayMode" -- app/src` | 3 lines, all in `app/src/app/services/play-mode.service.ts` (54, 65, 92) |
| `node --test e2e/lib/checks-runner.test.mjs e2e/lib/harness.test.mjs` | 9 pass, 1 fail, `UNIT_EXIT=1`; see "pre-existing" below |
| `git diff --name-only --diff-filter=MDR origin/ms/2... -- app/e2e app/package.json app/package-lock.json` | empty, `GUARD_EXIT=0` |
| `git diff --quiet origin/ms/2...HEAD -- app/e2e/run.mjs app/e2e/scenariocreator-check.mjs app/package.json app/package-lock.json` | `PROTECTED_EXIT=0` |
| Full scope `git diff --name-status origin/ms/2...HEAD --` | `M README.md`, `A app/e2e/checks/C4r9.mjs`, `M app/src/app/services/play-mode.service.ts`, `M app/src/app/services/script-runtime.service.ts` |

RAM before the build (informational): total 16,122 MB, available 1,937 MB.
Check-runner unit suite wall time: 5.691 s. Production build wall time: 17.876 s.

### Pre-existing unit-test failure (not caused by this task)
`DW-2.1: verbatim helper fidelity against run.mjs` fails with
`AssertionError: Function siblingPage implementation must be verbatim in run.mjs`.
It compares `harness.mjs` function sources against `run.mjs`; both files are frozen and byte-identical
to the base (`GUARD_EXIT=0`, `PROTECTED_EXIT=0`). The failure is present on the base and cannot be
fixed here without editing a protected file. All other 9 unit tests pass.

## Live DWs — DELEGATED TO CLAUDE (hidden-close, inside `editor-e2e.lock`)
This build agent was dispatched with an explicit "do not launch a live editor or Playwright"
constraint. The following gates are therefore **not run here**; they are recorded with the exact
commands and expected outcomes for the hidden-close pass. No PASS is claimed for them.

- **DW-1.2 (red on base)**: serve the Phase-1 tip with `npm start` (`ng serve --port 4200`) inside
  `editor-e2e.lock`; `ONLY=C4r9 E2E_PLAYWRIGHT_DIR=<worktree>/virtual-lab/e2e
  E2E_BROWSER_CHANNEL=chromium node e2e/run-checks.mjs http://localhost:4200/` must exit 1 with
  `FAIL e2e/checks/C4r9.mjs`, and the child output must contain at least one `FAIL  open:` and one
  `FAIL  add:` line (the check emits these at column 0 because `awake` runs on open and on Add
  Component with no edit-mode owner).
- **DW-1.3 (dirty)**: `node e2e/checks/C4r9.mjs http://127.0.0.1:9/` must exit 1 with no surviving
  browser process (compare process lists before/after). `runCheck` closes the browser in `finally`.
- **DW-2.2 (green on tip)**: same lock session, `npm start` on this tip,
  `ONLY=C4r9 node e2e/run-checks.mjs http://localhost:4200/` must exit 0 with
  `PASS e2e/checks/C4r9.mjs`.
- **DW-2.3**: in the same session, `node e2e/run-checks.mjs http://localhost:4200/` (every check on
  the tip, EdE2E smoke included) must exit 0.
- **DW-2.4 (U-7 Play paths)**: serve `ng build --base-href /editor/` at `:8044/editor/`;
  `ONLY="library:" npm run e2e`, `ONLY="component script" npm run e2e`, `ONLY="3d objects" npm run e2e`
  must each print `All checks passed.`
- **DW-2.5 (throwing awake)**: scratch check in `os.tmpdir()`, harness imported by absolute file URL,
  fixture `awake` throws `new Error("boom")`; after `play(page)` the Stop button is enabled and a
  console error contains `[Play] A script threw while waking`; after `stop(page)`,
  `__wetsEngine.Application.isPlaying === false` and Play is enabled. Run with
  `E2E_CHECKS_DIR=<tmp> node e2e/run-checks.mjs http://localhost:4200/`, exit 0.
- **DW-3.1 (U-7 full)**: inside `editor-e2e.lock`, `cd app && npm ci && npx ng build --base-href /editor/`
  served at `:8044/editor/`; `npm run e2e` prints `All checks passed.` (record check/scenario count);
  `npm run e2e:build` exits 0.
- **DW-3.2**: with `npm start` up, `npm run e2e:checks -- http://localhost:4200/` exits 0 with a
  column-0 `PASS e2e/checks/C4r9.mjs`.
- **DW-3.3**: `bash R/.workers/gate.sh <worktree>/WebEngineTSEditor --full` gives PASS.
- **DW-3.4**: `grep -n "Edit mode and Play" README.md` → line 95 on this tip.

## C4r9a follow-up — ROADMAP row text for the lead
While playing, the editor (a) saves the play world (Unity refuses), (b) keeps play mode across a project
or scene open, and Stop then restores the old snapshot over the new scene, and (c) restores undo
snapshots in play mode. Fix lives in `commands.service.ts` / `history.service.ts`: stop first, or
refuse. This is out of AC-16 scope and was not touched by C4r9.
