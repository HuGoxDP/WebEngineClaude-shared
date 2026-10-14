# Phase D — editor milestone 3: prefabs with links, settings windows, Unity-style undo

Specification: `WebEngineTSEditor/docs/unity-editor-plan.md` §5 "Префабы", §6 stages 14–16;
`WebEngineTS/design/prefab-instances-plan.md` (E11, done in the engine). ~6 editor weeks + engine
support. Decisions that govern this phase: **Q1** (link mode in project files from stage 14, Build
expands) and **Q2** (component ids, card A5) — vision doc, sections "Вопрос 1/2".

---

## D1 — Stage 14: prefabs *(editor; ~3 weeks; Opus for the link-mode switch, Sonnet for UI)*
1. Object dragged into Project → `.prefab.json` (+ `.meta`); prefab into the scene → an instance with a
   link (`Prefab.instantiate`, guid from `.meta`).
2. **Link mode on for the editor's file save only** (D-1): `serializeScene(scene, { prefabs: "link" })`
   in `_writeScene`. Undo, Play, autosave and clipboard stay expand. Before turning it on, confirm the
   readers-first chain holds: the editor reads v2 (A8), the platform reads v2 prefab files (A10), the
   packager expands scenes (B7). Scenes in the project become version 2 when they hold a link; the
   editor's own version check accepts them.
3. Inspector: changed fields bold with a margin line; "+" badges on added objects/components;
   removed components drawn as "Name (Removed)" in place (needs component ids, A5); default overrides
   (root name, position, rotation) left out of the Overrides list.
4. Overrides dropdown → Apply / Revert (all, per component, per field) via `Prefab.getChanges`,
   `applyInstance`, `revert`, `revertOverride`. Prefab Mode with breadcrumbs (edit the prefab in
   isolation); variants (`createVariant`); Unpack (outermost only, as Unity).
5. A "Re-save all scenes in the current format" command (Unity's `ForceReserializeAssets`): format
   churn as its own reviewable change; never re-save on open.
**Done when**: an edit to a prefab reaches every scene using it; Apply/Revert behave as in Unity on the
cases in the E11 tests; a published scenario with prefab instances runs on the platform (expanded in
the ZIP).

## D2 — Stage 15: settings windows *(editor; ~1.5 weeks; Sonnet; E10 done)*
Project Settings: Tags and Layers; Physics (gravity, layer collision matrix — `LayerCollisionMatrix`
exists); Time; Quality; Player = `scenario.meta.json` (title, description, slug, category, version,
cover). Lighting: environment, fog, skybox (E10 `RenderSettings` saved with the scene). Preferences:
colours and the shortcut list.

## D3 — Stage 16: Unity-style undo *(editor + engine; Opus; ~1.5 weeks)*
Today `history.service.ts` stores whole-scene snapshots (30 steps), reloads the scene on undo and clears
the selection. Unity's undo uses **in-memory identity** and stores property diffs (`Undo.RecordObject`
→ `PropertyModification`), applied in place.
- Commands record what they change (object id + field + before/after, or structural ops: create,
  destroy with its serialized subtree, reparent, component add/remove) against live identity
  (`EngineObject` instance id), applied in place; selection is part of each step; names in the menu
  ("Undo Move Cube"); a History window; a limit far above 30 (memory-bounded).
- Decide here whether `PrefabDiff` becomes public API for it (A2 kept it internal) or the editor keeps
  its own diff over serialized component snapshots. Persisted component ids are not required for
  this (A5 note).
- Tests: undo/redo of every command type keeps object identity (references from other objects still
  point at the same live object), restores selection, and survives 1000 steps without reloading the
  scene.

---

## After milestone 3 — the remaining Unity windows (stages 17–27)
Each is its own decision when a scenario needs it (editor plan §6, §6a, §10): UI tools (needs Canvas UI
stage 1 in the engine), Animation + Animator (needs E12 animator assets), Profiler (engine diagnostics
exist), and the rest. Write a card per window when it is chosen.
