# Plan: C4r9 — the editor runs user scripts only in Play (edit mode at boot; Play/Stop through `enterPlayMode`/`enterEditMode`)
**Created:** 2026-11-25 (Claude architect, autonomous run, MS-2 draft)
**Status:** ready
**Complexity:** medium
**Review cadence:** 1 (risk class *serialization*: a wrongly timed `awake` writes into saved scenes; Phase 2 gets its own review before Phase 3 integrates)
**Check-ins:** quiet
---
## Context
Research and decisions R-1…R-7: `code-foundations/C4r9/research.md`.
MS-2 spec (`.workers/milestones/MS-2/spec.md`): AC-16, U-7; shared decisions "Tests", "Editor e2e",
"No engine delivery"; risk table row "When user code runs in the editor" = **risk (serialization)**;
Parallelism wave 2, lane Ed. ROADMAP row C4r9.

**Problem.** Nothing in `app/src` calls `Application.enterEditMode()`, and the engine defaults to play mode.
So user scripts' `awake`/`onEnable` run in the edit world on project open, on Add Component, on every
script-save rebuild (`script-runtime.service.ts:429-437`) and on every undo (`history.service.ts:165`).
A script with `awake(){ new GameObject("Spawned") }` adds a `Spawned` root each time, and the next save
writes it to disk.

**Success criteria** (AC-16, U-7):
1. Add Component, project open, scene save, script save and undo/redo run no user `awake`/`onEnable`. The
   saved scene never gains `Spawned`.
2. Play runs `awake` and `onEnable` once per script instance.
3. Stop returns the engine to edit mode, with the scene as it was before Play.
4. `app/e2e/run.mjs` and `app/e2e/scenariocreator-check.mjs` are byte-identical to the base and green.
   Every `app/e2e/checks/*.mjs` on the tip is green.

## Constraints
- **Test guard.** No existing file under `app/e2e/` is modified, deleted or renamed, and no `test*`,
  `lint` or `typecheck` script changes. The only new test file is `app/e2e/checks/C4r9.mjs`.
  - It imports from `../lib/harness.mjs` (EdE2E) and never edits the harness or the runner.
  - Helpers needed only by this check live inside the check file.
- **Engine consumed as released.** The editor's committed `app/WebEngineTS-0.1.0.tgz`
  (`0.1.0-local.1794476123298`) already has `Application.enterEditMode/enterPlayMode/isPlaying`.
  - No engine change, no `release:local`.
  - No change to `app/package.json` or `app/package-lock.json`.
- **Hub and serial files are not touched.** That means `commands.service.ts` (C4r12 → C4r13),
  `code-editor.service.ts` (C4r18 → C4r7), `history.service.ts` and `scene.service.ts`.
  Code scope is `play-mode.service.ts` and `script-runtime.service.ts` only.
- **Locks and browsers.**
  - Anything that starts `ng serve`, a build server or a browser runs inside `editor-e2e.lock`: take it
    with `bash R/.workers/wk.sh lock editor-e2e W<n> C4r9` (exit 3 = busy, wait and retry) and release
    it with `bash R/.workers/wk.sh unlock editor-e2e W<n>`.
  - Playwright comes from `E2E_PLAYWRIGHT_DIR=<worktree>/virtual-lab/e2e` (after `npm ci` there), with
    `E2E_BROWSER_CHANNEL=chromium`.
- **Merge order.** EdE2E (harness + runner) is merged on `ms/2` before this branch starts. If
  `app/e2e/lib/harness.mjs` is missing on the base, stop and park the problem in ATTENTION.
- **Hidden tests.** Never read, locate or quote hidden acceptance tests. If a question is not answered
  here, park it in ATTENTION; never weaken a check.

## Chosen Approach
**`PlayModeService` owns the engine mode, and Play is an in-place switch.** The flow follows C2 D6:
- The service's constructor enters edit mode.
- `ScriptRuntimeService` injects it, so no user class can be registered before edit mode is in force
  (R-3).
- **Play** = snapshot → `Application.enterPlayMode()` (the engine's wake pass) → refresh the hierarchy →
  loop.
- **Stop** = cancel the loop → tear the play world down while still in play →
  `Application.enterEditMode()` → restore the snapshot (R-2).
- A throwing user callback is logged and never leaves the editor between modes (R-4).

**Fallback:** if the in-place wake misbehaves in the live editor (a script woken twice or not at all),
switch Play to D6's reload model: `serialize` → `clear` → `enterPlayMode()` → `loadFromJSON(snapshot)`
→ re-select the previously selected object by name. Record the reason in notes. U-7's Play scenarios need
that selection.

## Rejected Approaches
- **Reload model on Play (D6's recommendation for C5):** it destroys the selected object, and
  `run.mjs:814-826` plus EdE2E's smoke check read the playing object through the selection-only probe.
  That breaks U-7 (R-1).
- **`Application.enterEditMode()` in `main.ts`:** it creates a second owner of the mode, invisible to the
  service that toggles it.
- **An Angular app initializer:** the app has no `app.config.ts`, so this adds a file for one call.
- **Guarding each call site (open, add, undo, rebuild):** these are four files, three of them serial or
  hub files. The engine gate already covers every path once the mode is right.
- **Stopping Play on project change through an `effect`:** an effect fires after the new scene may
  already have woken, so it is not reliable. Deferred as C4r9a (Notes).

---
## Implementation Phases

### Phase 1: The check — `app/e2e/checks/C4r9.mjs` (red on the base)
**Tier:** B (coder; new test file only)
**Skills:** code-foundations:aposd-verifying-correctness, code-foundations:cc-defensive-programming
**Model:** sonnet
**Gate:** Standard
**AC:** AC-16
**Risk:** normal
**Depends on:** none (external: EdE2E merged on `ms/2`)
**File scope:** WebEngineTSEditor: app/e2e/checks/C4r9.mjs

**Goal:** Write a self-contained check that proves AC-16 end to end, black-box. On the unmodified editor
it must FAIL on the open leg.

**Scope:**
- IN: one `runCheck(async () => { … })` that imports from `../lib/harness.mjs` (`newPage`, `seed`,
  `readDisk`, `check`, `runCheck`, `play`, `stop`, `save`, `selectInHierarchy`, `editScript`,
  `noErrors`, `SCENARIO_ENTRY`). It holds the following.
  - **Fixture** (inline strings): `scripts/components/WakeMarker.ts`.
    - `@Serializable({ typeName: "WakeMarker" })` extends `ScriptableBehaviour`.
    - `awake()`: `const m = (globalThis.__c4r9 ??= { awake: [], enable: [], disable: [] }); m.awake.push(this.gameObject.name); new GameObject("Spawned");`
    - `onEnable()` pushes to `enable`. `onDisable()` pushes to `disable`.
    - `V2` and `V3` versions differ only by a comment, so a script save makes the module fresh and
      triggers the rebuild.
  - **Project** `C4r9Parent`:
    - `scenario.meta.json` and `scripts/Scenario.ts` = `SCENARIO_ENTRY`;
    - `assets/scenes/main.scene.json` with two roots: `Holder` (component `WakeMarker`) and `Target`
      (no components).
  - **Probes** (local helpers in the file):
    - `marks()` = `page.evaluate(() => globalThis.__c4r9 ?? { awake: [], enable: [], disable: [] })`;
    - `spawnedInMemory()` = the number of roots named `Spawned` in
      `globalThis.__wetsEngine.SceneManager.activeScene.getRootGameObjects()`;
    - `treeNames()` = `app-hierarchy li .label` texts;
    - `savedRoots()` = the root names in `readDisk(page, "C4r9Parent", "assets/scenes/main.scene.json")`;
    - `waitRebuild(prevToken)` waits until `globalThis.__wetsEngine.TypeRegistry.get("WakeMarker")`
      is not the constructor stored before the save (stored on `window.__c4r9Prev`), then waits 500 ms
      more.
  - **Legs**, with check names prefixed exactly as below (stable FAIL lines):
    1. `open:` Click Open folder, wait until the hierarchy shows `Holder` and `Target`, and wait 1 s.
       `marks()` is all empty, `spawnedInMemory() === 0`, and the hierarchy has no `Spawned`.
    2. `add:` `selectInHierarchy(page, "Target")`, open `.insp-body .add-comp`, and click the
       `.add-list li` whose trimmed text is exactly `WakeMarker` and that is not `.lib-head`. Wait until
       `.insp-body` shows `WakeMarker`. The marks are still empty and nothing was spawned.
    3. `undo:` `Control+z`, wait 300 ms: the marks are empty and nothing was spawned.
       `Control+y`, wait 300 ms: the same, and `Target` has `WakeMarker` again (inspector after
       re-select).
    4. `save:` `save(page)`. On disk, `savedRoots()` deep-equals `["Holder", "Target"]` and both roots
       hold a `WakeMarker` component. The marks are empty.
    5. `script save:` `editScript(page, "WakeMarker.ts", V2)`, then `waitRebuild`. The marks are empty,
       nothing was spawned, and the hierarchy has no `Spawned`.
    6. `play:` `play(page)` and wait 1.5 s.
       - `marks().awake` sorted deep-equals `["Holder", "Target"]`, and `.enable` the same.
       - `spawnedInMemory() === 2`, and the hierarchy lists `Spawned` (two rows).
       - After 1 s more, the marks have not grown (no double wake).
    7. `stop:` `stop(page)` and wait 500 ms.
       - `marks().awake` and `.enable` are unchanged.
       - `.disable` sorted deep-equals `["Holder", "Target"]`.
       - `spawnedInMemory() === 0`, the hierarchy has no `Spawned`, and the roots are exactly
         `Holder` and `Target`.
       - `globalThis.__wetsEngine.Application.isPlaying === false`.
    8. `after stop:` `editScript(page, "WakeMarker.ts", V3)`, then `waitRebuild`. The marks are
       unchanged and nothing was spawned. Then `save(page)`: `savedRoots()` is still
       `["Holder", "Target"]`.
    9. `replay:` `play(page)`, wait 1.5 s: `marks().awake.length === 4`, with each name exactly twice.
       Then `stop(page)`: `spawnedInMemory() === 0`.
    10. `clean:` `page.nativeDialogs === 0` and `noErrors(page)`.
- OUT:
  - Any `src` change.
  - Edits to `harness.mjs`, the runner or any other `checks/*.mjs`.
  - Fixture files on disk (inline only).
  - Save-while-playing and open-while-playing (C4r9a).

**Edge cases:**
- Every wait has a timeout of 30 s or less, so a hang (e.g. an implementation that loops) ends as a
  runner FAIL, never as a stuck lock.
- A `waitRebuild` that never sees a new constructor fails with the check `script save: rebuild happened`,
  so a silent no-op save cannot pass the leg vacuously.
- `marks()` must read the page global. It must not cache it in the Node process.
- The check must not depend on `.shots` fixtures, on other checks or on run order. It uses its own folder.

**Produces:** `app/e2e/checks/C4r9.mjs`, the AC-16 proof that Phases 2 and 3 run. The contract is
`node e2e/checks/C4r9.mjs <editor-url>`: exit 0 means every leg passed, and each failure prints a
column-0 `FAIL  <leg>: …` line.

**Done when:**
- [ ] DW-1.1: `cd app && node --check e2e/checks/C4r9.mjs` exits 0, and
  `git diff --name-status <base>` lists exactly `A app/e2e/checks/C4r9.mjs`.
- [ ] DW-1.2 (red on the base): inside `editor-e2e.lock`, with `npm start` (`ng serve --port 4200`)
  serving this phase's tip (no `src` change):
  - `ONLY=C4r9 E2E_PLAYWRIGHT_DIR=… E2E_BROWSER_CHANNEL=chromium node e2e/run-checks.mjs http://localhost:4200/`
    exits 1, with `FAIL e2e/checks/C4r9.mjs`;
  - the child output holds at least one `FAIL  open:` line and one `FAIL  add:` line.

  Record the output in notes.
- [ ] DW-1.3 (dirty): `node e2e/checks/C4r9.mjs http://127.0.0.1:9/` exits 1, and no browser process
  outlives it (process list before and after, in notes).

### Phase 2: Edit mode at boot; Play/Stop through the engine's mode switch
**Tier:** B (coder)
**Skills:** code-foundations:cc-defensive-programming, code-foundations:aposd-verifying-correctness, code-foundations:code-clarity-and-docs
**Model:** sonnet
**Gate:** Standard
**AC:** AC-16, U-7
**Risk:** risk (serialization; Claude pre-merge review via `premerge-queue.md`)
**Depends on:** Phase 1
**File scope:** WebEngineTSEditor: app/src/app/services/play-mode.service.ts, app/src/app/services/script-runtime.service.ts

**Goal:** User scripts stay asleep in the editor's edit world and wake exactly once per Play. Stop puts
the engine back in edit mode on the pre-Play scene.

**Scope:**
- IN, `play-mode.service.ts`:
  - **Import:** `Application` from `'WebEngineTS'`.
  - **Constructor:** `Application.enterEditMode();`. The doc comment says this service owns the mode,
    and that the editor is in edit mode from the first moment a script class can exist.
  - **`play()`:** `if (this.isPlaying()) return;`, then:
    1. `this._snapshot = this._scene.serialize();`
    2. `this.isPlaying.set(true)`, then `_lastTime = performance.now()` and `_fixedAccumulator = 0`;
    3. `try { Application.enterPlayMode(); } catch (err) { console.error(`[Play] A script threw while waking: ${String(err)}`); }`;
    4. `this._scene.notify()`, so objects that `awake` created show in the hierarchy;
    5. `runOutsideAngular(loop)`.
  - **`stop()`:** `if (!this.isPlaying()) return;`. Set `isPlaying` to false, cancel the rAF and take
    the snapshot. Then:
    - `try { this._selection.clear(); this._scene.clear(); } catch (err) { console.error(`[Play] A script threw while stopping: ${String(err)}`); }`
    - `finally { Application.enterEditMode(); if (snap) this._scene.loadFromJSON(snap); else this._scene.notify(); }`

    The teardown happens while still in play (D6 order, R-2).
  - **Class doc comment:** rewrite it to describe the edit/play contract (R-1, R-2). The loop body is
    unchanged.
- IN, `script-runtime.service.ts`: the constructor body gains `inject(PlayModeService);`, with a comment.
  The comment says it is the edit-mode guarantee before the first `reload()`, and that it must not be
  removed (R-3). It uses a statement, not a parameter property, so `noUnusedLocals` stays quiet.
  `_rebuildScene`'s comment gains one line: in edit mode the rebuilt objects do not wake.
- OUT:
  - `Application.updateEditMode` (R-6);
  - the reload model (C5);
  - `commands.service.ts`, `history.service.ts`, `scene.service.ts`, `code-editor.service.ts`;
  - save, open or undo while playing (C4r9a);
  - any `app/e2e/` file;
  - the engine.

**Edge cases:**
- **A throwing user callback.** If `awake` throws during the wake pass, the editor is still playing:
  the Stop button is enabled and the loop runs. If `onDisable`/`onDestroy` throws during Stop, the
  editor still ends in edit mode on the snapshot.
- **Re-entrancy.** A second `play()` while playing, or `stop()` while stopped, is a no-op (the
  existing guards; the engine's switches are idempotent too).
- **A script reload during Play** (Code-tab save) still rebuilds in play mode, and Stop restores the
  pre-Play snapshot in edit mode. This is unchanged behaviour.
- **No user scripts.** Play and Stop behave exactly as on the base. Built-ins are not gated (C2 D4).
- **`Time`.** `timeScale` and time reset on each switch (R-5).

**Produces:** the editor behaviour AC-16 describes. A host-level contract for C5 and later rows:
`PlayModeService` is the only caller of `Application.enterEditMode/enterPlayMode` in `app/src`.

**Done when:**
- [ ] DW-2.1: `cd app && npx ng build --base-href /editor/` exits 0 (strict TS through the build).
  `git grep -n "enterEditMode\|enterPlayMode" -- app/src` lists only `play-mode.service.ts`.
- [ ] DW-2.2 (AC-16): inside `editor-e2e.lock`, with `npm start` serving this tip,
  `ONLY=C4r9 node e2e/run-checks.mjs http://localhost:4200/` exits 0 with `PASS e2e/checks/C4r9.mjs`.
  The same check failed in DW-1.2.
- [ ] DW-2.3 (no regression in the other checks): in the same lock session,
  `node e2e/run-checks.mjs http://localhost:4200/` (every check on the tip, EdE2E's smoke check
  included) exits 0.
- [ ] DW-2.4 (U-7 Play paths, targeted): in the same lock session, serve `ng build --base-href /editor/`
  at `:8044/editor/`. Then `ONLY="library:" npm run e2e`, `ONLY="component script" npm run e2e` and
  `ONLY="3d objects" npm run e2e` each print `All checks passed.`
- [ ] DW-2.5 (dirty test, throwing awake): run a scratch check in an `os.tmpdir()` dir, never inside
  `app/`. It imports the harness by absolute file URL, and its script's `awake` does
  `throw new Error("boom")`. After `play(page)`:
  - the Stop button is enabled;
  - one console error contains `[Play] A script threw while waking`.

  After `stop(page)`, `__wetsEngine.Application.isPlaying === false` and the Play button is enabled.
  Run it through `E2E_CHECKS_DIR=<tmp> node e2e/run-checks.mjs http://localhost:4200/`. Each assertion
  is a `check`, and the run exits 0. Record the output in notes.
- [ ] DW-2.6: `git diff --name-status <base>` lists only the two File-scope files plus Phase 1's `A`
  entry, and `git diff --quiet <base> -- app/e2e/run.mjs app/e2e/scenariocreator-check.mjs app/package.json app/package-lock.json`
  exits 0.

### Phase 3: Integrator — full suites, README, notes and report
**Tier:** integrator
**Skills:** code-foundations:code-clarity-and-docs
**Model:** sonnet
**Gate:** Standard
**AC:** AC-16, U-7
**Risk:** normal
**Depends on:** Phase 2
**File scope:** WebEngineTSEditor: README.md; .claude-shared: code-foundations/C4r9/notes.md, code-foundations/C4r9/report.md

**Goal:** Prove the whole tip: U-7 full suites, every check and the gate. Document the user-visible change.

**Scope:**
- IN:
  - **`README.md`** (repo root) gains a short paragraph "Edit mode and Play" next to the existing e2e
    section, covering:
    - scripts do not run while editing;
    - Play wakes them once and Stop restores the scene and edit mode;
    - `@ExecuteAlways` is the opt-in (engine C2);
    - the check lives at `app/e2e/checks/C4r9.mjs`.
  - **`notes.md`:** the DW outputs, wall times and the C4r9a follow-up text, ready for the lead to
    add as a ROADMAP row.
  - **`report.md`:** a one-screen trust report.
- OUT:
  - `CLAUDE.md`, `app/package.json`, the lock, any `src` or `e2e` file;
  - ROADMAP and CHANGELOG, which the lead writes at merge.

**Done when:**
- [ ] DW-3.1 (U-7): inside `editor-e2e.lock`:
  - `cd app && npm ci && npx ng build --base-href /editor/`, served at `:8044/editor/`;
  - `npm run e2e` prints `All checks passed.`, and the check and scenario count goes in notes;
  - `npm run e2e:build` exits 0.
- [ ] DW-3.2: in the same lock session, with `npm start` up, `npm run e2e:checks -- http://localhost:4200/`
  exits 0, and its output has a column-0 `PASS e2e/checks/C4r9.mjs`.
- [ ] DW-3.3: `git diff --quiet <base> -- app/e2e/run.mjs app/e2e/scenariocreator-check.mjs` exits 0.
  `bash R/.workers/gate.sh <worktree>/WebEngineTSEditor --full` gives PASS.
- [ ] DW-3.4: the README paragraph exists (`grep -n "Edit mode and Play" README.md`). `notes.md` holds
  DW-1.2, DW-2.2, DW-2.5 and DW-3.1 outputs and the C4r9a row text. `report.md` exists.

---
## Test Coverage
**Level:** Per-phase. The editor has no unit-test runner the gate can use (spec "Oracles"). AC-16 is
proven by the new black-box check, red on the base (DW-1.2) and green on the tip (DW-2.2). U-7 is proven
by the frozen full suites (DW-3.1).

## Test Plan
- [ ] The check fails on the unmodified editor, on the open and add legs (DW-1.2).
- [ ] Dirty: the check fails closed against a dead URL with no orphaned browser (DW-1.3).
- [ ] The check passes on the tip: open, add, undo/redo, scene save, script save, Play once, Stop
  restores and pairs `onDisable`, edit mode after Stop, a second Play (DW-2.2).
- [ ] Dirty: a throwing `awake` leaves Play usable and Stop returns to edit mode (DW-2.5).
- [ ] Integration: every `checks/*.mjs` green (DW-2.3, DW-3.2). The targeted `run.mjs` Play/library/undo
  scenarios green (DW-2.4).
- [ ] Regression (U-7): the full `npm run e2e` and `npm run e2e:build` green, and `run.mjs` and
  `scenariocreator-check.mjs` byte-identical (DW-3.1, DW-3.3).
- [ ] Gate: `gate.sh --full` PASS (DW-3.3).
- [ ] Manual: none (AC-16 is hidden-close; the Claude pass runs it on request).

`<base>` = `git merge-base HEAD origin/ms/2` in the editor worktree (the milestone fork point the gate
uses).

## Assumptions
| Assumption | Confidence | Verify Before Phase | Fallback If Wrong |
|---|---|---|---|
| The committed tarball's edit-mode gate stops `awake`/`onEnable` of an undecorated script on `addComponent` and on deserialize, and `enterPlayMode` wakes each exactly once | high (tarball `_systemAwake` gate; engine `EditMode*.test.ts`) | Phase 2 (DW-2.2) | Park in ATTENTION as an engine gap. No editor workaround (ECOSYSTEM rule) |
| The inspector's add list offers project script classes by bare class name (`library.service.ts:62-64`, `classNames`) | high | Phase 1 | Select by the list item that is not under `.lib-head`, as written; adjust the selector only, never the assertion |
| `globalThis.__wetsEngine` is the editor's engine namespace in every build (set in the `ScriptRuntimeService` constructor) | high | Phase 1 | Read `Spawned` from the hierarchy and the saved file only |
| No `run.mjs` scenario depends on a script running in edit mode (fixtures use `update`/`start`; `SCENARIO_ENTRY` never runs in the editor) | high | Phase 2 (DW-2.4), Phase 3 (DW-3.1) | Stop and park in ATTENTION. `run.mjs` is frozen, so the conflict goes to the owner |
| Injecting `PlayModeService` into `ScriptRuntimeService` creates no DI cycle | high (dependency lists in research R-3) | Phase 2 | Call `Application.enterEditMode()` directly at the top of `ScriptRuntimeService`'s constructor as well (idempotent) |

## Decision Log
| Decision | Alternatives Considered | Rationale | Phase |
|---|---|---|---|
| In-place switch on Play | D6 reload model | Keeps the selection that U-7's Play scenarios probe; the same callback order (engine test) | 2 |
| Teardown in play, then `enterEditMode`, then restore | `loadFromJSON` alone | Unity/D6 order: every `onDisable`/`onDestroy` runs in play | 2 |
| `PlayModeService` owns the mode; `ScriptRuntimeService` injects it | `main.ts`; an app initializer | One owner; the guarantee is tied to the only place user classes appear | 2 |
| `scene.notify()` after the wake pass | Leave the hierarchy stale in Play | Objects created in `awake` are visible, as in Unity | 2 |
| Save, open or undo while playing deferred (C4r9a) | Guard them now | Needs `commands.service.ts`/`history.service.ts` (serial or hub); not in AC-16 | — |
| One check file with ten legs | One file per leg | One project and one browser; the hidden-close contract is one file per row | 1 |

---
## Notes
- **Dependencies on EdE2E:** the harness exports `runCheck`, `check`, `newPage`, `seed`, `readDisk`,
  `play`, `stop`, `save`, `selectInHierarchy`, `editScript`, `noErrors` and `SCENARIO_ENTRY`, plus the
  runner `e2e/run-checks.mjs` (`ONLY`, `E2E_CHECKS_DIR`). Phase 1 cannot start before EdE2E merges on
  `ms/2`.
- **Coordination:**
  - C4r15 (wave 5, ToggleVisibility in Play) runs on top of this edit/play contract.
  - C4r12/C4r13's `addLibrary` keeps working: the add happens in edit mode, so the script does not wake
    until Play.
  - C5 (non-goal) may move Play to the reload model; this plan's Produces names `PlayModeService` as
    the only mode caller.
- **Follow-up row C4r9a (for the lead to add, text in notes):** while playing, the editor:
  - saves the play world (Unity refuses);
  - keeps play mode across a project or scene open, and Stop then restores the old snapshot over the
    new scene;
  - restores undo snapshots in play mode.

  The fix lives in `commands.service.ts`/`history.service.ts`: stop first, or refuse.
- Plan CHECK was done inline, autonomously (no sub-agent): every phase has Skills, Model, Gate, Depends
  on and File scope; the scopes are disjoint; every DW is executable; each code phase has a dirty test.
- `docs/code-standards.md` was not generated: this run writes only into `code-foundations/C4r9/`.
---
## Decided During Build
_Filled by /code-foundations:build — one row per decision an agent made or question it raised:_
| # | Phase | Decision or question | Source | Status |
---
## Execution Log
_To be filled during /code-foundations:build_
