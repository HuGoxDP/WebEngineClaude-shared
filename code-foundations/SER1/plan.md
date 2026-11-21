# Plan: SER1 — `Behaviour.enabled` survives save, load, Instantiate and prefabs
**Created:** 2026-11-21 (Claude, architect lane)
**Status:** ready
**Complexity:** small (serializer format: Full gate on Phase 2)
**Review cadence:** per phase
**Check-ins:** quiet
---
## Context
`Behaviour.enabled` is never written, so a switched-off component comes back on after save, load,
`Instantiate` and prefab use. The editor's B1 branch adds a component on/off switch that would be
lost on save.

Research, facts and decisions: `code-foundations/SER1/research.md`. **Its D-1 … D-6 are binding.**
Base: WebEngineTS `master` `c4a0119`.

**Success criteria:**
1. A disabled component of every Behaviour kind tested comes back disabled after save → load and after `Instantiate`:
   - a `ScriptableBehaviour` script;
   - `MeshRenderer`;
   - `BoxCollider`;
   - `Light`.
2. At load a disabled script gets `awake` once and `onEnable` never.
3. A prefab whose component is disabled gives disabled instances. An instance that switches it on records one override, which survives a link-mode save and load.
4. Old files without `enabled` load enabled and produce no new prefab overrides.
5. The inspector field list is unchanged (`hideInInspector`). `npm run typecheck`, `npm test` and `npm run build` are green.

## Constraints
- Engine repo only, plus this task's notes. The editor is not changed (D-3).
- **Never weaken a test.** An existing test that compares a whole serialized component may now see `enabled: true`. Update such an expectation only by adding that key, in its own commit, with the reason "SER1: enabled is now serialized (D-1)". Any other failure is a question: park it and write to ATTENTION.
- Hub file touched: none (`Behaviour.ts`, `PrefabOverride.ts`).

## Phases

### Phase 1: `enabled` as a serialized, hidden field
**Skills:** code-foundations:aposd-verifying-correctness
**Model:** sonnet
**Gate:** Standard
**Depends on:** none
**File scope:** WebEngineTS: src/engine/core/Behaviour.ts, tests/BehaviourEnabledSerialization.test.ts

**Goal:** D-1, D-4, D-5.

**Scope:**
- IN:
  - On the existing `enabled` getter in `Behaviour.ts`: `@SerializedField({ type: FieldType.Boolean })` and `@HideInInspector()`.
  - JSDoc: saved with the scene, loaded before `awake`, Unity's `m_Enabled`.
  - New test file.
- OUT: prefab diff (Phase 2).

**Done when:**
- [ ] DW-1.1: `getAllFields(MeshRenderer)` contains `{ name: "enabled", serialize: true, hideInInspector: true }`. `getAllFields(PostEffect subclass)` keeps its own `enabled` without `hideInInspector`.
- [ ] DW-1.2: Save → load (`serializeGameObject` → `deserializeGameObject`) of one GameObject with these components, each with `enabled = false`, gives `enabled === false` for every one of them:
  - a test `ScriptableBehaviour`;
  - `MeshRenderer`;
  - `BoxCollider`;
  - `Light` (any concrete subclass).

  An enabled twin of each stays `true`.
- [ ] DW-1.3: The same through `EngineObject.Instantiate(go)`.
- [ ] DW-1.4: Lifecycle, with a test script counting calls:
  - loaded disabled → `awake` 1, `onEnable` 0;
  - then `enabled = true` → `onEnable` 1;
  - loaded enabled → `awake` 1, `onEnable` 1;
  - loaded disabled under an inactive parent, then the parent activated → `awake` 1, `onEnable` 0.
- [ ] DW-1.5: A hand-written JSON component without `enabled` (an old file) loads with `enabled === true`, and its setter was not called (spy on `_onEnabledChanged` or a counter).
- [ ] DW-1.6: Full `npm test` green. Any expectation updated per Constraints is listed with its file:line in `notes.md`.

### Phase 2: Prefab diff — missing `enabled` means `true`
**Skills:** code-foundations:cc-defensive-programming
**Model:** sonnet
**Gate:** Full
**Depends on:** Phase 1
**File scope:** WebEngineTS: src/engine/core/serialization/PrefabOverride.ts, tests/PrefabEnabledOverride.test.ts

**Goal:** D-2.

**Scope:**
- IN:
  - A private helper in `PrefabDiff`. For a prefab-side component whose type resolves (`TypeRegistry.get`) to a `Behaviour` subclass, it treats a missing `fields.enabled` as `true`.
  - Use it at the field-loop comparison (:1454) and at the added-component match (:568).
  - Unknown types unchanged.
- OUT: no other diff site, and no change to override apply (:534), which is already per field.

**Done when:**
- [ ] DW-2.1: A prefab from `Prefab.fromGameObject` with a disabled `MeshRenderer`. Its instance:
  - comes back disabled;
  - `enabled = true` on the instance → `prefab.getOverrides(instance)` (instance method, `Prefab.ts:377`) holds exactly one override `{ component: "MeshRenderer", field: "enabled", value: true }`;
  - a link-mode save → load keeps it enabled, while the prefab stays disabled.
- [ ] DW-2.2: An "old" prefab tree, with `enabled` removed from every component's `fields` by the test, and an instance built from it and re-snapshotted → `prefab.getOverrides(instance)` contains **no** `enabled` override.
- [ ] DW-2.3: The same old tree with the instance's component disabled → exactly one `enabled: false` override.
- [ ] DW-2.4: The existing prefab test files are green unchanged: `tests/Prefab*.test.ts` and `tests/ModelSubAssets.test.ts`. Then `npm run typecheck`, `npm test` and `npm run build` are green (count before and after in `notes.md`).

### Phase 3: Docs and notes
**Skills:** code-foundations:code-clarity-and-docs
**Model:** haiku
**Gate:** Minimal
**Depends on:** Phase 2
**File scope:** WebEngineTS: CHANGELOG.md; .claude-shared: code-foundations/SER1/notes.md, code-foundations/SER1/report.md

**Goal:** the record matches the code.

**Scope:**
- IN: CHANGELOG *Fixed*. The enabled state of every Behaviour is saved and restored by save/load, Instantiate and prefabs. Old files read as enabled. A loaded disabled script gets `awake` without `onEnable`, as in Unity. Plus notes and report per RULES "Report".
- OUT: ROADMAP (the protocol updates it).

**Done when:**
- [ ] DW-3.1: The CHANGELOG entry names save/load, Instantiate, prefab overrides and the old-file default. `report.md` lists every DW with its evidence.
