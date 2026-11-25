# Plan: C4r8 (MS-2) — every script of a scenario is available on the platform; the editor check sees a missing component
**Created:** 2026-11-25 (Claude, architect lane, MS-2 re-plan)
**Status:** ready
**Complexity:** medium
**Review cadence:** 1 (deliberate: risk class *format*, and Phase 2's positive leg consumes Phase 1's bundle)
**Check-ins:** quiet
**Supersedes:** `plan.md` for MS-2 (Phase 1 kept as built; Phase 2 moved to a new file; Phase 3 became the integrator phase). `plan.md` stays as the record.
---
## Context
Research: `code-foundations/C4r8/research.md` — D-1…D-3, D-5 binding; § "MS-2 re-plan" adds D-4′, D-6, D-7.
MS-2 spec: `.workers/milestones/MS-2/spec.md` — AC-1, AC-2, AC-10, U-1, U-7; shared decision "C4r8"; risk class *risk (format)*.

**Problem:** the editor imports every `scripts/**` file, the engine only the entry module's import graph, so a component whose script nobody imports (every Library add) is a `MissingComponent` on the platform (ENGINE-GAPS G6). The editor's ScenarioCreator check cannot see it: `verify-render.mjs` drops the page console.

**Success criteria:**
1. AC-1, AC-2: after `Scenario.run()` a scene component from a script nobody imports is its real class, and it is also registered inside the entry's `awake()`. The order is the entry first, then the other scripts in sorted path order, each module evaluated once. A broken non-entry script gives exactly one `console.error` `[Scenario] Script "<path>" failed to load: <message>`, and the scenario still runs.
2. AC-10: `node app/e2e/scenariocreator-components.mjs` captures the page console itself and fails closed. It exits non-zero and names the type when the loaded scene logs `Unknown component type "<T>"`. It exits 0 when every type is registered, which needs an engine with C4r8 (D-6).
3. U-1, U-7: the existing scenario suites are green and unchanged. `app/e2e/run.mjs` and `app/e2e/scenariocreator-check.mjs` are byte-identical to the base.

## Constraints
- **Tests:** new test files only. No existing test file, `e2e/` file or `test*` script is modified (gate test guard). This covers `run.mjs`, `scenariocreator-check.mjs` and `platform-pixels.mjs`.
- **Engine → consumer rule:** an engine change reaches the editor only through `npm run release:local` in WebEngineTS. **MS-2 does not run it** (spec: "No engine delivery inside the milestone"). The editor keeps `app/WebEngineTS-0.1.0.tgz`, and ScenarioCreator keeps its pinned engine. For one verification run, the check's `--engine <file>` reads the Phase 1 build's `dist/WebEngineTS.standalone.js`; nothing is installed or committed. G6 reaches consumers with the next published release (owner) and its consumer row (A10c).
- **Hub files:** `app/package.json` / `app/package-lock.json` are not touched; there is no npm script for the new check. `WebEngineTS/CHANGELOG.md` and `.claude-shared/*` change only in Phase 3.
- Never read or locate hidden acceptance tests. Anything this plan does not answer is a question: park it in ATTENTION, don't guess.

## Chosen Approach
**Land the built engine branch as is, plus a sync. Move the editor tripwire to a new, self-contained console-capture harness.** `609ec32` already implements D-1…D-3 with 4 tests, and its merge onto `ms/1` is clean. The editor half follows OWNER-DECISIONS #28 A1, in a new file because the guard forbids the inline edit. It copies the raw-spawn harness pattern of `app/e2e/platform-pixels.mjs` (D-14 precedent) and reuses `ec4bb7d`'s regex. **Fallback:** if the sync conflicts in `Scenario.ts`, cherry-pick `609ec32` onto a fresh `ms/2` branch and re-run its tests (same diff).

## Rejected Approaches
- **Merge `ec4bb7d`:** it edits the guarded `scenariocreator-check.mjs`, and its grep of verify-render stdout can never fire.
- **B (ScenarioCreator `verify-render.mjs` forwards the console) inside MS-2:** the owner made it a follow-up card (#28). It is cross-repo and not in MS-2's task list.
- **Playwright `page.on('console')`:** it adds a borrowed dependency to a check that needs none. The page-side shim plus a POST matches `platform-pixels.mjs`.
- **Auto-detect the sibling `WebEngineTS/dist` as the default engine:** it silently changes what "the platform" means, and the dist may be stale (D-6).
- **`release:local` to make the wizard leg green:** the spec forbids engine delivery in MS-2.

---
## Implementation Phases

### Phase 1: Engine — land `609ec32` on `ms/2`, pin U-1, re-gate
**Skills:** code-foundations:cc-defensive-programming, code-foundations:aposd-verifying-correctness
**Model:** sonnet
**Gate:** Full
**Risk:** risk
**AC:** AC-1, AC-2, U-1
**Depends on:** none
**File scope:** WebEngineTS: src/engine/core/scenario/Scenario.ts, tests/ScenarioScriptRegistration.test.ts (added by 609ec32), tests/ScenarioScriptRegistrationParity.test.ts (added in this phase)

**Goal:** the branch `C4r8-all-scenario-scripts` (`609ec32`, D-1…D-3) is synced with `origin/ms/2`, gains one new U-1 test file, and passes the full gate on top of `ms/2`.

**Scope:**
- IN:
  - `git merge origin/ms/2` into `C4r8-all-scenario-scripts`. Expected clean: `609ec32` touches only `Scenario.ts` and its new test.
  - Keep `609ec32`'s `Scenario.ts` change unchanged:
    - `_importRemainingScripts()` runs after `_loadEntryPoint()` and before `_systemInit`;
    - it imports every `_scriptBlobUrlMap` key except `scripts/<entryPoint>`, in `.sort()` order;
    - each import has its own try/catch → `console.error` with ``[Scenario] Script "${path}" failed to load: ${message}``.
  - New file `tests/ScenarioScriptRegistrationParity.test.ts`. It uses the same Node seam as `ScenarioScriptRegistration.test.ts` (real ZIP via `loadFromData`; `URL.createObjectURL` → `data:` URL; engine classes through a `globalThis` bridge) and copies the helpers rather than importing the other test. Give every module source a unique tag, because Node caches by URL.
- OUT: `_importScriptModule` (on-demand import), the manifest format, a string overload of `addComponent` ("by type name" means `TypeRegistry.get(name)` → `addComponent(ctor)`, as in DW-1.2 of the existing test), `CHANGELOG.md` (Phase 3).

**Edge cases:**
- A module already in the entry's graph is evaluated once (module cache by URL).
- A non-entry module that imports a broken sibling: both paths are logged once each, in sorted order, and the run still reaches running.
- A broken entry module keeps its hard failure (`ScenarioRunFailure.test.ts` stays green).
- A scenario with only the entry script: the import pass does nothing.

**Produces:** a pushed branch tip whose `npm run build` writes `dist/WebEngineTS.standalone.js`. The contract is behavioural: a scene component whose script nobody imports resolves in that bundle, and DW-2.4's positive leg proves it. Record the absolute path and the tip commit SHA it was built from in `notes.md`, so a stale dist is detectable (D-6). Phase 2 uses the bundle through `--engine`.

**Done when:**
- [ ] DW-1.1: `git -C WebEngineTS merge-base --is-ancestor 609ec32 HEAD && git -C WebEngineTS merge-base --is-ancestor origin/ms/2 HEAD` exits 0. `git diff --name-status origin/ms/2...HEAD` lists exactly `M src/engine/core/scenario/Scenario.ts`, `A tests/ScenarioScriptRegistration.test.ts`, `A tests/ScenarioScriptRegistrationParity.test.ts`.
- [ ] DW-1.2 (AC-1, AC-2): `npx vitest run tests/ScenarioScriptRegistration.test.ts` shows 4/4 passed. Its test cases still carry 609ec32's old names; this plan calls them T-1…T-4:
  - T-1: resolves, not `MissingComponent`;
  - T-2: registered in awake;
  - T-3: entry graph first, then sorted, each once;
  - T-4: exactly one `console.error` naming the path; running; `MissingComponent` for the broken type.
- [ ] DW-1.3 (U-1): in the new file, a scenario whose entry statically imports every other script runs with ESM evaluation order (dependencies first), each module once, and `console.error`/`console.warn` never called. The test passes on the branch tip.
- [ ] DW-1.4 (dirty): in the new file, `scripts/a.js` imports a throwing `scripts/b.js`. Exactly two `console.error` calls follow, `scripts/a.js` then `scripts/b.js`, each matching `^\[Scenario\] Script "<path>" failed to load: `. `scenario.isRunning` is true.
- [ ] DW-1.5: full gate on the tip is green: `npm run typecheck`, `npm test`, `npm run build`. Record the test count before and after in `notes.md`: the base count plus exactly the new tests. `git diff --name-status origin/ms/2...HEAD -- tests/` shows only `A` lines. `ScenarioEntryScene`, `ScenarioManifest`, `ProgressiveLoading`, `ScenarioEngineModuleUrl`, `FormatVersions` and `ScenarioRunFailure` are green unchanged.
- [ ] DW-1.6: `grep -c "failed to load: " dist/WebEngineTS.standalone.js` is ≥ 1. `notes.md` holds the absolute path of that file and `git rev-parse HEAD` of the build, for Phase 2.

### Phase 2: Editor — `scenariocreator-components.mjs` sees a missing component (A1, new file)
**Skills:** code-foundations:cc-defensive-programming, code-foundations:aposd-verifying-correctness
**Model:** sonnet
**Gate:** Standard
**Risk:** normal (test tooling; reviewed with the C4r8 pre-merge review)
**AC:** AC-10, U-7
**Depends on:** Phase 1. Only DW-2.4/DW-2.5's `--engine` leg needs the Phase 1 bundle; the rest can be built in parallel.
**File scope:** WebEngineTSEditor: app/e2e/scenariocreator-components.mjs (new), app/e2e/fixtures/c4r8-unknown-component/** (new), app/e2e/fixtures/c4r8-library-component/** (new)

**Goal:** a self-contained check that builds an editor-exported project with ScenarioCreator, loads its ZIP in a browser page that captures its own console, and fails, naming the type, on `Unknown component type "<T>"`.

**Scope:**
- IN — the CLI contract:
  ```
  node app/e2e/scenariocreator-components.mjs [<project-dir> | --project <dir>] [--engine <standalone.js>]
  ```
  - Defaults:
    - project: `<editor>/.shots/wizard-project` (exported by `npm run e2e`, as for `e2e:build`);
    - engine: `<ScenarioCreator>/node_modules/WebEngineTS/dist/WebEngineTS.standalone.js` (the engine `verify-render.mjs` and `platform-pixels.mjs` use);
    - `CREATOR = resolve(HERE, "../../../ScenarioCreator")`;
    - browser selection copied from `platform-pixels.mjs` (`BROWSER`, `E2E_BROWSER_CHANNEL`, Edge/Chrome paths).
  - Exit codes:
    - **0**: payload received, sentinel captured, scenario loaded with a first frame, and no unknown type;
    - **1**: one or more `Unknown component type "<T>"`. Print `FAIL  Unknown component type: <T1>, <T2>` (deduped; regex reused from `ec4bb7d`: `/Unknown component type "([^"]+)"/g`);
    - **2**: usage error, missing project/`scenario.meta.json`/engine/ScenarioCreator `node_modules`, build failure, page load failure, no payload within 120 s, or the sentinel missing ("no console captured").
  - Flow:
    1. Copy the project to `ScenarioCreator/Scenarios/_EditorCheckComponents`.
    2. Run `build-package.mjs --scenario _EditorCheckComponents` (ZIP only).
    3. Serve the ZIP and the chosen engine (importmap `WebEngineTS` → `/engine.js`) from `server.listen(0)`.
    4. Spawn the browser on swiftshader with a temp profile.
    5. The harness page runs a **classic** inline script first. It wraps `console.warn`/`console.error` and listens to `error`/`unhandledrejection`, pushing text into `captured[]` and still forwarding to the original. Then it emits the sentinel `console.warn("[components-check] console capture live")`.
    6. A module script then `await import("/engine.js")` in a try/catch, so a broken bundle is posted rather than hanging. It runs `new Application(canvas)` → `loadScenarioFromBuffer` → waits for the first frame (60 s, as in `platform-pixels.mjs`) → waits a few frames.
    7. The page POSTs `{ ok, error, captured, engineVersion: BuildInfo?.version }` to `/result`.
    8. Node prints each captured line as `page: <line>`, then the engine version, then the verdict.
    9. A `finally` always runs: kill the browser, close the server, delete the temp profile, and remove `Scenarios/_EditorCheckComponents` plus `ReleaseScenarios/_EditorCheckComponents.{zip,scenario.json}` and any objects that manifest names (cleanup copied from `scenariocreator-check.mjs`).
  - Header comment: what it proves; why it is a new file (test guard, OWNER-DECISIONS #28 A1, `decisions/C4r8-DW-2.2.md`); D-6 (the default engine is the platform's, which lacks C4r8 until the next release, so the wizard project fails naming `Rotator` there; use `--engine` for a build with C4r8); the B follow-up that can retire it.
  - Fixtures, each with `scenario.meta.json`, `scripts/Scenario.ts` (a copy of `SCENARIO_TEMPLATE` from `app/src/app/services/project-templates.ts`) and `assets/scenes/main.scene.json` (camera + one `Holder` object), shaped like an editor export:
    - `c4r8-unknown-component`: `Holder` carries `{ "type": "C4r8.Ghost" }`, declared by no script.
    - `c4r8-library-component`: adds `scripts/library/Rotator.ts`, a copy of `app/src/app/library/Rotator.ts`; `Holder` carries `Rotator`. Nothing imports it, which is the G6 shape.
- OUT:
  - `run.mjs`, `scenariocreator-check.mjs`, `platform-pixels.mjs` (byte-identical, U-7);
  - `app/package.json` (no npm script — EdE2E owns it) and `app/e2e/checks/` (EdE2E's runner; this check needs ScenarioCreator);
  - the manifest/streaming path (equivalence stays `verify-render`'s job; the ZIP is what the platform loads);
  - ScenarioCreator files (read-only; only the temp `_EditorCheckComponents` entries, always removed).

**Edge cases:**
- A bundle that throws on import → exit 2, not a hang.
- A page that never POSTs → exit 2 after the timeout.
- A payload without the sentinel → exit 2 "no console captured" (fail-closed). Make the sentinel check one condition on the single exit-0 path.
- An unknown flag or two project args → exit 2 with usage.
- A Ctrl-C or build failure still cleans the ScenarioCreator tree.
- An unrelated `console.warn` does not fail the check; only the quoted-type pattern does.

**Done when:**
- [ ] DW-2.1 (scope, U-7):
  - `git diff --name-only <base>...HEAD` lists only the new check and the two fixture folders;
  - `git diff --quiet <base> HEAD -- app/e2e/run.mjs app/e2e/scenariocreator-check.mjs app/e2e/platform-pixels.mjs app/package.json app/package-lock.json` exits 0;
  - `node --check app/e2e/scenariocreator-components.mjs` exits 0;
  - the editor gate's typecheck is green.
- [ ] DW-2.2 (AC-10 negative): `node app/e2e/scenariocreator-components.mjs app/e2e/fixtures/c4r8-unknown-component` exits 1. Its output contains `C4r8.Ghost` and a `page: ` line with the sentinel. Same result with `--project app/e2e/fixtures/c4r8-unknown-component`. Afterwards, `git -C <ScenarioCreator> status --porcelain` is empty and `ReleaseScenarios/_EditorCheckComponents.zip` does not exist.
- [ ] DW-2.3 (fail-closed, dirty):
  - `--engine <scratch>/throws.js` (body `throw new Error("bundle")`) → exit 2 within the timeout, with a line naming the failure;
  - `--engine <missing>` → exit 2;
  - `--bogus` → exit 2 with usage;
  - a project dir without `scenario.meta.json` → exit 2 naming the path.
- [ ] DW-2.4 (G6 visible, positive leg):
  - on `app/e2e/fixtures/c4r8-library-component`, the default (ScenarioCreator) engine → exit 1 naming `Rotator`;
  - the same fixture with `--engine <Phase 1 dist/WebEngineTS.standalone.js>` → exit 0 with a PASS line and the Phase 1 `engineVersion`.
- [ ] DW-2.5 (AC-10 wizard leg, U-7; verifier, inside `editor-e2e.lock`):
  - after `npm run e2e` writes `.shots/wizard-project`, `node app/e2e/scenariocreator-components.mjs --engine <Phase 1 bundle>` exits 0;
  - the default-engine run exits 1 naming `Rotator`. This is an **expected deviation from the spec's AC-10 text** (D-6), recorded in `notes.md` as G6 on the platform engine and raised in ATTENTION for the AC-10 amendment (DW-3.4);
  - U-7: `npm run e2e` and `npm run e2e:build` both exit 0 on the branch tip. This phase owns "byte-identical" (DW-2.1) and a passing run on its tip; the milestone-close run re-checks it.

### Phase 3: Integrator — changelog, gap registry, decision addendum, report
**Skills:** code-foundations:code-clarity-and-docs
**Model:** haiku
**Gate:** Minimal
**Risk:** normal
**AC:** — (record for AC-1, AC-2, AC-10)
**Depends on:** Phase 1, Phase 2
**File scope:** WebEngineTS: CHANGELOG.md; .claude-shared: ENGINE-GAPS.md, decisions/C4r8-DW-2.2.md, code-foundations/C4r8/notes.md, code-foundations/C4r8/report.md

**Goal:** the shared record matches the code; only this phase touches shared files.

**Scope:**
- IN:
  - `CHANGELOG.md`: one bullet under `[Unreleased]` → *Changed*. Every scenario script is imported before the entry's `awake()`, the entry first and the rest in sorted path order (Unity parity; the editor already did this). A broken non-entry script is logged as `[Scenario] Script "<path>" failed to load: …` and skipped, and its components stay `MissingComponent`. Note that scenarios shipping an unused broken script now show that `console.error`. On a merge conflict keep every bullet.
  - `ENGINE-GAPS.md`: delete the G6 row from **Open** and add a **Closed** row: `Scenario.run()` imports every pre-linked script before awake; `tests/ScenarioScriptRegistration.test.ts`; it reaches consumers with the next release (A10c).
  - `decisions/C4r8-DW-2.2.md`: an MS-2 addendum (A1 lives in the new `scenariocreator-components.mjs` because of the test guard; D-6 engine selection), skipped if activation already wrote it.
  - `notes.md` / `report.md`: every DW with its evidence; AC-1/AC-2/AC-10 mapping; the Phase 1 bundle path and version used for DW-2.4/2.5.
- Lead or Claude pass, outside the code repos:
  - close DEBT `D-20261122T2328Z-2` (owner confirmed A1 in #28; it landed);
  - set ROADMAP row C4r8 to its MS-2 state;
  - add a follow-up ROADMAP card "B: ScenarioCreator `verify-render.mjs` forwards the page console; then retire `scenariocreator-components.mjs`'s capture" (OWNER-DECISIONS #28);
  - A10c (consumers move to the next release) carries the default-engine wizard leg.
- OUT: code.

**Done when:**
- [ ] DW-3.1: `git -C WebEngineTS diff origin/ms/2 -- CHANGELOG.md` shows one added C4r8 bullet under `[Unreleased]` and no removed line.
- [ ] DW-3.2: `grep -n "^| G6" .claude-shared/ENGINE-GAPS.md` matches nothing in the Open table. A Closed row contains `G6` and `ScenarioScriptRegistration.test.ts`.
- [ ] DW-3.3: `report.md` lists DW-1.1…DW-2.5, each with a command and its result line, plus the addendum in `decisions/C4r8-DW-2.2.md`.
- [ ] DW-3.4 (lead): all four are done:
  - DEBT `D-20261122T2328Z-2` is marked closed;
  - the ROADMAP B follow-up card exists;
  - ATTENTION has the AC-10 amendment request (D-6), or the spec's AC-10 already names the `--engine` invocation;
  - G6's default-engine leg is listed under A10c.

---
## Test Coverage
**Level:** Per-phase. The engine's new routine is covered by the 4 tests `609ec32` landed and the 2 tests this plan adds. The editor check is a black-box CLI with fixture runs; the editor has no gate-run unit tests (MS-2 spec, Oracles).

## Test Plan
- [ ] `tests/ScenarioScriptRegistration.test.ts` 4/4 (AC-1, AC-2) — DW-1.2
- [ ] New `tests/ScenarioScriptRegistrationParity.test.ts`: U-1 parity (DW-1.3) and the dirty test where a broken sibling is imported by a non-entry script (DW-1.4)
- [ ] Engine full suite, typecheck and build, with no existing test touched — DW-1.5
- [ ] Unknown-type fixture → exit 1 naming the type, with cleanup verified — DW-2.2
- [ ] Dirty: throwing bundle, missing bundle, bad flag, missing project → exit 2 — DW-2.3
- [ ] Library fixture: platform engine → exit 1 `Rotator`; Phase 1 bundle → exit 0 — DW-2.4
- [ ] Integration: wizard project from `npm run e2e`, both engines; `e2e:build` unchanged, inside `editor-e2e.lock` — DW-2.5
- [ ] Manual: none

## Assumptions
| Assumption | Confidence | Verify Before Phase | Fallback If Wrong |
|---|---|---|---|
| `origin/ms/2` = `ms/1` tip or master plus non-Scenario changes, so the merge is clean | high (merge-tree vs `ms/1` clean) | 1 | cherry-pick `609ec32` onto a fresh branch from `ms/2` |
| ScenarioCreator builds a 3-file fixture project like an editor export | high (wizard export has the same layout) | 2 | copy the missing file shapes from `.shots/wizard-project` |
| ScenarioCreator's installed engine still logs `Unknown component type "<T>"` via `console.warn` | verified (v0.2.0 bundle and `ms/1` `SceneSerializer.ts:2788`) | 2 | widen the shim to `console.log` too |
| Swiftshader Edge starts headless as in `platform-pixels.mjs` (`c8982eb` flags) | high | 2 | copy that file's current flag list verbatim |

## Decision Log
| Decision | Alternatives Considered | Rationale | Phase |
|---|---|---|---|
| Reuse `609ec32` unchanged + sync | rewrite; rebase | built, gated (189/3088 PASS at `d66f5ad`), clean merge | 1 |
| A1 in new `scenariocreator-components.mjs` | inline in `scenariocreator-check.mjs` (`ec4bb7d`); B now | test guard; owner #28 | 2 |
| Default engine = ScenarioCreator's; `--engine` override | sibling `WebEngineTS/dist`; editor tgz; release:local | platform truth; no delivery in MS-2 (D-6, D-7) | 2 |
| ZIP path only | ZIP + manifest | the platform consumes the ZIP; equivalence is verify-render's | 2 |
| Exit 1 = unknown type, 2 = harness/usage | single non-zero | distinguishes "check found G6" from "check broke" | 2 |
| Shared files in Phase 3 only | per-phase CHANGELOG bullet | plan format rule; spec allows either, conflict keeps both | 3 |

---
## Notes
- **Spec conflict, AC-10 (open question; chosen answer):** "exits 0 on the wizard project, whose every type is registered" cannot hold on ScenarioCreator's engine in MS-2. That engine is `v0.2.0` (`v0.3.0` after A10b), neither contains `609ec32`, and the wizard project carries a Library `Rotator` (run.mjs DW-4.2). **Chosen:** keep the check honest (the default engine fails with `Rotator`) and run the positive leg with `--engine <ms/2 WebEngineTS>/dist/WebEngineTS.standalone.js` after `npm run build` in the ms/2 engine worktree. **Recommend amending AC-10** to name that invocation; the default-engine leg moves to A10c.
- **Project argument (chosen):** accept either a positional `<project-dir>` or `--project <dir>`. The default is `.shots/wizard-project`.
- **Ordering in waves:** Phase 1 is MS-2 wave 1, lane E. Phase 2 can be coded in lane Ed while Phase 1 gates, but DW-2.4/2.5 wait for the Phase 1 bundle. DW-2.5 runs inside `editor-e2e.lock`, after EdLock/EdE2E have released it.
- **Pre-merge:** C4r8 is a risk task, so both branches go through `premerge-queue.md` (≤ 2 rounds). Merge order: engine, then editor, then Phase 3.
- **Reused:**
  - `609ec32`: all of it (`Scenario.ts` + 4 tests); `d66f5ad` is the older sync, superseded by the `ms/2` merge.
  - `ec4bb7d`: not merged; its regex, dedupe and FAIL message are reused in the new file.
  - `platform-pixels.mjs`: harness pattern copied (third copy; the B follow-up retires this one).
---
## Decided During Build
_Filled by /code-foundations:build — one row per decision an agent made or question it raised:_
| # | Phase | Decision or question | Source | Status |
|---|---|---|---|---|
---
## Execution Log
_To be filled during /code-foundations:build_
