# Research: C4r8 — every script of a scenario is available on the platform, as in the editor

One-line: the editor imports every file under `scripts/`, the engine only the entry module and
what it imports, so a component from a script nobody imports (every Library add) works in the
editor and is `MissingComponent` on the platform. Decide one rule; `plan.md` builds it.

**Date:** 2026-11-21 · **Status:** confirmed (decisions delegated to Claude) · **Base:** WebEngineTS
`master` `c4a0119`, WebEngineTSEditor `master` `d404658`, ScenarioCreator `master` `4eaaf2c` ·
**Still open:** nothing blocking.

## 1. Facts
- **Engine load sequence** (`WebEngineTS/src/engine/core/scenario/Scenario.ts`, `run()`):
  1. `_prelinkAllScripts()` (:559, :844) reads **every** `scripts/**` file of the scenario and rewrites their relative imports to Blob URLs (`_scriptBlobUrlMap`);
  2. `_loadEntryPoint()` (:1014-1030) `import()`s **only** `scripts/<manifest.entryPoint>`;
  3. the entry's `_systemInit` (awake);
  4. `_loadEntryScene()` (:614).

  The comment at :572-574 states the contract: "the entry module (and whatever awake imported) has registered the component classes the scene names". Components register at module evaluation, through `@Serializable` and the TypeRegistry. A module nobody imports never registers, and the scene's component becomes `MissingComponent` ("Unknown component type").
- **Other import paths.** `_importScriptModule` (:1096-1112) serves `context.importScript()` on demand. No other script `import()` exists.
- **ScenarioCreator** compiles **every** `scripts/**/*.ts` with `tsc --outDir` into the ZIP (`build-package.mjs:176-209`, :324). Every script is present in the package, just never imported.
- **Content.** The 8 sample scenarios hold 5–8 script files each. No content script has top-level side effects (grep for `Application.|Debug.|console.|SceneManager.|Resources.|setTimeout|window.|document.` at line start found none). Their entries import what they use.
- **Editor** (`WebEngineTSEditor/app/src/app/services/script-runtime.service.ts:143-171, 256-259`) imports every file under `scripts/`. `addLibrary` (`commands.service.ts:202-238`) writes `scripts/library/<Name>.ts`, and nothing imports it. The project template's entry (`project-templates.ts:86-97`) imports nothing.
- **The check that missed it.** `WebEngineTSEditor/app/e2e/scenariocreator-check.mjs:80` counts `objects=2` and passes with the component missing.

## 2. Unity
- Every script in `Assets/` is compiled into the player assembly, so every `MonoBehaviour` class exists at runtime whether or not other code references it.
- A scene or prefab that names a component always finds its class.
- There is no per-scene import list.

## 3. Decisions (binding)
**D-1 — The engine makes every script of the scenario available (Unity parity).**
- In `run()`, right after `_loadEntryPoint()` imports the entry module and **before** `_systemInit`, import every other pre-linked `scripts/**/*.js` module, in sorted path order.
- So components named by the entry scene, by prefabs the entry loads in awake, or by `Resources` all resolve. The editor needs no change: it already imports everything.
- **Rejected: an editor-generated import module.** It works for editor projects only. It leaves VS Code or ScenarioCreator authors with the same trap, and it keeps two rules.

**D-2 — Order and once-only.**
- The entry module is imported first, exactly as now, so its top-level code runs first. Modules already in its graph are cached by the module system and are not run twice.
- The rest follow in sorted path order, which is deterministic.

**D-3 — Failure isolation.**
- A non-entry module that throws while importing is logged once, as `console.error("[Scenario] Script \"<path>\" failed to load: <message>")`, and skipped. Its components become `MissingComponent` as today, and the scenario still runs.
- Before D-1 such a file was never imported, so failing hard would break scenarios that run today.
- The entry module keeps its current hard failure (`Failed to import entry point`).

**D-4 — The editor's ScenarioCreator check fails on a missing component.** `scenariocreator-check.mjs` greps the verify-render output for `Unknown component type` and fails on it. A Library-added component is then proven on the platform side, which is the C4 card's Done-when.

**D-5 — ENGINE-GAPS.** Recorded as G6 (open) in `.claude-shared/ENGINE-GAPS.md` with this file as its detail. It closes when the engine change merges.
