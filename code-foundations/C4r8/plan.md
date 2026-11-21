# Plan: C4r8 — every script of a scenario is available on the platform
**Created:** 2026-11-21 (Claude, architect lane)
**Status:** ready
**Complexity:** small (engine load path: Full gate on Phase 1)
**Review cadence:** per phase
**Check-ins:** quiet
---
## Context
Research and binding decisions D-1 … D-5: `code-foundations/C4r8/research.md`. Today the engine imports only the entry module's graph. The decision is that it imports every script of the scenario before the entry's awake, as Unity compiles every script. The editor already imports every script.

**Success criteria:**
1. A scene component whose script nobody imports resolves on the platform, not as `MissingComponent`.
2. A broken non-entry script is logged once by path; the scenario still runs.
3. The editor's ScenarioCreator check fails when the built scene has an `Unknown component type`, and passes with a Library-added Rotator.
4. All existing Scenario tests are green unchanged. `npm run typecheck`, `npm test` and `npm run build` are green in the engine.

## Constraints
- Engine first, then `npm run release:local`, then the editor check (RULES merge order).
- **Never weaken a test.** Anything the plan does not answer is a question: park it and write to ATTENTION.

## Phases

### Phase 1: Engine — import every script before awake
**Skills:** code-foundations:cc-defensive-programming
**Model:** sonnet
**Gate:** Full
**Depends on:** none
**File scope:** WebEngineTS: src/engine/core/scenario/Scenario.ts, tests/ScenarioScriptRegistration.test.ts

**Goal:** research D-1, D-2, D-3.

**Scope:**
- IN:
  - A private `_importRemainingScripts()`. After `_loadEntryPoint()` and before `_systemInit`, it imports every `_scriptBlobUrlMap` entry except the entry path, in sorted key order. Each import has its own try/catch that logs `[Scenario] Script "<path>" failed to load: <message>` with `console.error`.
  - Update the comment at :572-574 to the new contract.
  - JSDoc on `run()` that names the Unity parity.
- OUT: `_importScriptModule` (on-demand import) is unchanged. No manifest field.

**Done when:**
- [ ] DW-1.1: A fixture scenario, built the same way as `tests/ScenarioEntryScene.test.ts`, has:
  - an entry that imports nothing;
  - `scripts/library/Spin.js` declaring `@Serializable` `Spin`;
  - an `entryScene` naming `Spin` on an object.

  After `run()` the object's component is a `Spin`, not a `MissingComponent`. This fails on `c4a0119`.
- [ ] DW-1.2: A prefab or `addComponent` by type name inside the entry's awake also finds `Spin`, which shows it is registered before awake.
- [ ] DW-1.3: Order. Modules that push their path to a global array at top level give `[entry, then the rest sorted]`. A module already imported by the entry appears once.
- [ ] DW-1.4: A non-entry module that throws at top level:
  - gives one `console.error` naming its path (spy);
  - the scenario reaches `Running`;
  - a scene component of that script is `MissingComponent`.
- [ ] DW-1.5: `tests/ScenarioEntryScene.test.ts`, `ScenarioManifest`, `ProgressiveLoading`, `ScenarioEngineModuleUrl` and `FormatVersions` are green unchanged. `npm run typecheck`, `npm test` and `npm run build` are green (count before/after in notes).

### Phase 2: Editor — the platform check sees missing components
**Skills:** code-foundations:aposd-verifying-correctness
**Model:** sonnet
**Gate:** Standard
**Depends on:** Phase 1 merged and `npm run release:local` done
**File scope:** WebEngineTSEditor: app/e2e/scenariocreator-check.mjs

**Goal:** research D-4.

**Scope:**
- IN:
  - `scenariocreator-check.mjs` fails, with a message naming the type, when the verify-render output contains `Unknown component type`.
  - The existing Library flow (a Rotator added through the Library, project built by ScenarioCreator) passes on the new engine.
- OUT: editor script loading is unchanged.

**Done when:**
- [ ] DW-2.1: On the released new engine, the check passes for a project with a Library-added Rotator, and its output shows the Rotator component.
- [ ] DW-2.2: With a deliberately broken type name injected into the fixture scene, the check exits non-zero and names the type.
- [ ] DW-2.3: The editor's e2e runs green inside `editor-e2e.lock`.

### Phase 3: Docs, gap, notes
**Skills:** code-foundations:code-clarity-and-docs
**Model:** haiku
**Gate:** Minimal
**Depends on:** Phase 2
**File scope:** WebEngineTS: CHANGELOG.md; .claude-shared: ENGINE-GAPS.md, code-foundations/C4r8/notes.md, code-foundations/C4r8/report.md

**Goal:** the record matches the code.

**Scope:**
- IN:
  - Engine CHANGELOG *Changed*: every script of a scenario is imported before the entry's awake; a broken non-entry script is logged and skipped. This is Unity parity, and the editor already behaved this way.
  - ENGINE-GAPS: G6 moves to Closed, naming the pinning test.
  - Notes and report.
- OUT: ROADMAP (protocol).

**Done when:**
- [ ] DW-3.1: The CHANGELOG entry and the G6 Closed row exist. `report.md` lists every DW with its evidence.
