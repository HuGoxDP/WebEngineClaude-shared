# Research: C4r9 — the editor runs user scripts only in Play (edit mode at boot, Play/Stop through the engine's mode switch)

**One line:** the editor never calls `Application.enterEditMode()`, so user scripts wake in the edit world on
open, add, save-rebuild and undo; C4r9 puts the editor in edit mode before any script class can exist and
routes Play/Stop through `Application.enterPlayMode()` / `enterEditMode()`.

**Date:** 2026-11-25 (Claude architect, autonomous run — decisions taken by recommendation)
**Status:** confirmed (autonomous grill below; no owner questions)
**Still open:** nothing that blocks the plan. Follow-ups recorded in § Out of scope (save / open while playing).

Inputs read: ROADMAP row C4r9; MS-2 draft spec (AC-16, U-7, risk table "risk (serialization)", shared
decisions "Tests" and "Editor e2e", Parallelism wave 2); C2 research D1–D8 (D6 = transitions); EdE2E plan
(harness exports, runner, lock rule); editor `CLAUDE.md`; editor code at `origin/master` (`a1f8619`);
the editor's committed engine tarball `app/WebEngineTS-0.1.0.tgz` (`0.1.0-local.1794476123298`); engine
tests on `origin/ms/1`. Graphify queried first on both graphs (editor 1290 nodes, engine 12213 nodes).

---

## Problem (verified 2026-11-25)

| Fact | Evidence |
|---|---|
| Nothing in the editor calls the mode API | `git grep enterEditMode\|enterPlayMode\|updateEditMode origin/master -- app/src` → 0 hits |
| The engine defaults to play mode | C2 D1 (`_editMode = false`); tarball `Application.enterEditMode` flips `_setEditMode(true)` only when called |
| The committed tarball already has the API | `package/dist/WebEngineTS.d.ts`: `static enterEditMode()`, `static enterPlayMode()`, `static updateEditMode(dt)`, `static get isPlaying()`; ESM impl at `WebEngineTS.esm.js:51711-51760` — enterPlayMode flips, `Time._reset()`, `_wakeForPlay()` per loaded scene |
| User code runs on project open | `commands.service.ts` `_settle()` → `reloadScripts()` → `ScriptRuntimeService._reloadPass` → `_rebuildScene()` (`script-runtime.service.ts:429-437`) → `SceneService.loadFromJSON` → `deserializeScene` wakes scripts (play mode) |
| … on every script save | `code-editor.service.ts` `save()` → `_reload()` → same rebuild |
| … on Add Component | `commands.service.ts` `addComponent` / `addLibrary` → `go.addComponent(ctor)` → `awake`/`onEnable` in play mode |
| … on undo/redo | `history.service.ts:165` `_applySnapshot` → `loadFromJSON` |
| Play/Stop today | `play-mode.service.ts`: Play = `serialize()` snapshot + own rAF loop (`Time._update`, `_fixedUpdate`, `Physics._step`, `_update`, `Animation._updateAll`, `_lateUpdate`); Stop = cancel loop, `selection.clear()`, `loadFromJSON(snapshot)` |

Failure: `awake(){ new GameObject("Spawned") }` adds a `Spawned` root per open / save / undo, and the next
scene save writes it to disk. An endless loop in `awake` hangs every open of the project.

## What must be true (AC-16, U-7)

- AC-16: a script whose `awake` creates `new GameObject("Spawned")` and whose `onEnable` sets a marker does
  not run on Add Component, project open, save, undo; the saved scene never gains `Spawned`; Play runs
  `awake` and `onEnable` once; Stop returns to edit mode with the scene as before Play. Oracle:
  hidden-close (black-box Playwright against `ng serve`, inside `editor-e2e.lock`).
- U-7: `app/e2e/run.mjs` and `app/e2e/scenariocreator-check.mjs` byte-identical and green on the tip.
- Spec "Tests": new tests only, in `app/e2e/checks/C4r9.mjs` via EdE2E's `app/e2e/lib/harness.mjs`.
- Spec "No engine delivery": consume the committed tarball as is — it already has everything needed.

## Decisions

**R-1 — In-place switch, not the reload model.** Play = snapshot → `Application.enterPlayMode()` (the
engine's wake pass wakes every pending script in load order) → start the loop. C2 D6 recommends the reload
model for C5, but:
- `run.mjs:814-826` (library Rotator scenario) and EdE2E's smoke check read the playing object through
  `__wetsProbe.transformOf`, which reads **selected** objects only; a reload on Play would destroy the
  selected object and both would time out (U-7 break).
- D6 states the in-place switch gives the same callback order as a reload (engine test
  `EditModeTransitions.test.ts` "switching in place gives the same log as loading the same scene in play").
- The only behavioural difference is for `@ExecuteAlways` scripts (keep edit state); the editor has none.
C5 (Play view, MS-2 non-goal) may move to the reload model later; noted for it.

**R-2 — Stop order is D6's: tear down in play, then enter edit mode, then restore.** Stop = cancel loop →
`selection.clear()` → `scene.clear()` (destroyImmediate while still in play, so every `onEnable` gets its
`onDisable`, every `awake` its `onDestroy`) → `Application.enterEditMode()` → `loadFromJSON(snapshot)`
(deserialized in edit mode: nothing wakes). Calling `loadFromJSON` alone (clear inside it) would clear
after the flip — still balanced by the pairing rule, but not Unity's order; rejected.

**R-3 — One owner of the mode: `PlayModeService`.** Its constructor calls `Application.enterEditMode()`.
`ScriptRuntimeService` injects `PlayModeService` so the edit mode is in force before its first `reload()` —
the invariant is "no user class can be registered before the editor is in edit mode", because a user class
exists only after a `ScriptRuntimeService` reload. Alternatives: `main.ts` before `bootstrapApplication`
(second owner of the mode, invisible to the service that toggles it); an app initializer (the app has no
`app.config.ts`; adds a file for one line). No DI cycle: `PlayModeService` → `SceneService`,
`SelectionService`; `ScriptRuntimeService` → `ProjectService`, `ConsoleService`, `SelectionService`,
`SceneService`, now `PlayModeService`.

**R-4 — A throwing user callback never strands the editor between modes.**
- Play: `enterPlayMode()` has flipped the flag before the wake pass runs user `awake`; a throw there must
  still leave `isPlaying()` true and the loop running (so Stop is available), with one
  `console.error('[Play] …')`. Unity logs and keeps playing.
- Stop: a throw from `onDisable`/`onDestroy` during `scene.clear()` is logged; `enterEditMode()` and the
  snapshot restore run in `finally`.

**R-5 — `Time` is the engine's.** `enterPlayMode()`/`enterEditMode()` reset the clock (`Time._reset()`:
time 0, `timeScale` 1); the loop's own `_lastTime` and `_fixedAccumulator` reset on Play. A play-time
`timeScale` no longer survives Stop (Unity parity; related to G5).

**R-6 — `updateEditMode()` is not called.** No editor feature needs an edit frame today (no opted-in
scripts; the viewport renders built-ins itself). Calling it is C5's choice.

**R-7 — The check (`app/e2e/checks/C4r9.mjs`) observes through the page, black-box.**
- The fixture script records into a page global: `globalThis.__c4r9 = { awake: [], enable: [] }`, pushing
  `this.gameObject.name`; `awake` also does `new GameObject("Spawned")`. Blob modules share the page realm.
- In-memory "Spawned" count through `globalThis.__wetsEngine` (the runtime publishes it for the shim —
  `script-runtime.service.ts` constructor), hierarchy text, and the saved file via `readDisk`.
- Legs in one `runCheck`, one project: open (scene has `Holder` with the script) → Add Component on
  `Target` from the inspector's Scripts list (not the Library) → undo, redo → scene save (`Ctrl+S`, disk
  has no `Spawned`, has both components) → script save through the Code tab (`editScript`, rebuild) → Play
  (exactly `["Holder","Target"]` woke and enabled, once each, stable after a further wait; two `Spawned`
  in memory) → Stop (no `Spawned` in memory, hierarchy or disk after a save; `Application.isPlaying` false)
  → one more edit leg after Stop (script save again: counters unchanged) → second Play (each woke once more:
  fresh instances from the snapshot) → Stop.
- Red first: run against the unmodified build, it must FAIL on the open leg (proves it checks).

## Out of scope (recorded follow-ups, not built)

| Item | Why not here | Suggested row |
|---|---|---|
| Saving the scene while playing writes the play world (Unity refuses) | the save command lives in `commands.service.ts`, a serial file of C4r12 → C4r13; AC-16 lists edit-mode events only | C4r9a |
| Opening a project / scene while playing keeps play mode and Stop then restores the old project's snapshot over the new scene (pre-existing) | same file; an `effect` on `ProjectService.projectId` in `PlayModeService` would fire after the new scene may already have woken — not reliable | C4r9a |
| Undo while playing wakes the restored copy (play mode) | pre-existing, same class as above; history is not play-aware | C4r9a |
| Reload model on Play (D6 recommendation) | breaks U-7 probe flows (R-1) | C5 |

## Grill (autonomous)

1. *Does the edit-mode gate stop `awake` on `addComponent` for an undecorated script?* — Yes: tarball
   `_systemAwake` returns when `!this._lifecycleAllowed()` and does not mark itself woken, so the later wake
   pass owes it exactly one `awake` (engine `EditMode*.test.ts`, C2 D4/D7).
2. *Can anything register a user class before `PlayModeService` exists?* — No: only `ScriptRuntimeService`
   imports user modules (`_reloadPass`); it injects `PlayModeService` (R-3). Library classes go through the
   same reload (`addLibrary` → `reloadScripts`).
3. *Will existing `run.mjs` scenarios break?* — No script fixture or library behaviour has an edit-time
   effect: `ROTATOR` uses `update`, `SCENARIO_ENTRY` is a `ScenarioBehaviour` never run in the editor,
   library `PlayAnimation`/`QuizQuestion` use `start` (play only). The Play scenarios keep the selection
   (R-1). Proven by DW: full `npm run e2e` green on the tip.
4. *Does a reload during Play still work?* — Unchanged: in play mode the rebuild wakes the new copy; Stop
   restores the pre-play snapshot in edit mode.
5. *Is `Application.isPlaying` (static) read anywhere in the editor or library?* — `git grep` → 0 hits; its
   meaning change is harmless.
