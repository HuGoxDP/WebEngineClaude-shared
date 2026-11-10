# Plan: A5 — component ids, scoped like node ids
**Created:** 2026-11-10 (Claude, architect lane)
**Status:** ready
**Complexity:** complex
**Review cadence:** 1
**Check-ins:** quiet
---
## Context
A component inside a prefab tree, a link-mode instance interior or a prefab file is addressed today by
(node, registered type, occurrence of that type). Removing the first of two same-type components makes
every override, removal and `ComponentRef` aimed at the second silently move to the wrong one. A5 gives
those components persisted ids, minted like node ids, and makes every reader prefer them, before
`v0.2.0` (A9) freezes the version-2 format. Card: `tasks/A5-component-ids.md`. Research and every
decision with its evidence: `code-foundations/A5/research.md` — **read it first; its Decisions section
is binding.**

**Success criteria (card acceptance + research):**
1. The verified misbehaviour is fixed: prefab `[Collider{size:1}, Collider{size:5,isTrigger:true}]`,
   instance removes the first, prefab edits the second's size to 9 → the instance reads 9;
   `removedComponents` names the first by id.
2. A `ComponentRef` to the second of two same-type components survives removal of the first through a
   link save and a reload.
3. No plain scene gains an `id`, `cid` or `componentId`; re-saving every plain fixture is byte-identical
   to the base `cd0f4d7`.
4. Every `bde23fc` fixture loads identically; link files are idempotent (save → load → save, same bytes).
5. `npm run typecheck`, `npm test`, `npm run build` green; previously passing `tasks/probes/e11` probes
   still pass.

## Constraints
- Engine only (`WebEngineTS`), plus the task's `.claude-shared` notes. No consumer changes.
- Writers keep the old fields (`component`, `componentIndex`, `index`) next to the ids: old readers and
  the fallback still work.
- Ids never appear outside files that already carry node ids; they never make a file version 2.
- Mint after `_foldSingleCopies`; RT#k≥1 / Transform#k≥1 addresses in old files retarget to #0.
- Do not restore `design/prefab-instances-plan.md` (deleted by the owner in `a3fe342`); read it from
  history only.
- Anything this plan does not answer is a question: park the task (ATTENTION), do not guess.

---
## Implementation Phases

### Phase 1: Ids on their own — data, live field, minting, legacy derivation, copies
**Skills:** code-foundations:cc-defensive-programming, code-foundations:code-clarity-and-docs
**Model:** sonnet
**Gate:** Standard
**Depends on:** none
**File scope:** src/engine/core/Component.ts, src/engine/core/GameObject.ts, src/engine/core/serialization/PrefabOverride.ts (types + `ensureIds` only), src/engine/core/serialization/SceneSerializer.ts (`SerializedComponent`, `_mintAll`, `_giveId`, build-pass id assignment only), tests/ComponentIds.test.ts

**Goal:** components can hold, mint, derive and lose ids exactly like nodes, with nothing written yet.

**Scope:**
- IN: `SerializedComponent.id?: string`; `Component._prefabComponentId: string | null` (`@internal`,
  default `null`); minting in the same passes as node ids (`_mintAll`, `mintLive`), for every
  component of every node that gets a node id; legacy derivation in `ensureIds(…, legacy)`:
  `~c:<nodeId>:<type>:<occurrence>`, occurrence per type, computed after `_foldSingleCopies`;
  assignment of `json.id` → `_prefabComponentId` in the M0.2a build pass (where `_prefabNodeId` is
  set: `SceneSerializer.ts` ~2231/2392/2433); copies clear component ids where node ids are cleared
  (`GameObject.ts` ~289/298).
- OUT: writing ids to files (Phase 2), resolving by id (Phase 3), PrefabDiff (Phase 4).

**Edge cases:** a node without an id → its components get no id; a nested instance's interior →
its own prefab's ids, not minted by the outer save; a destroyed component's id is not reused;
`Transform` is never in the saved list and never gets an id.

**Produces:** `Component._prefabComponentId`, `SerializedComponent.id`, the legacy id format, minting
rules — the contract Phases 2–5 rely on.

**Done when:**
- [ ] DW-1.1: minting a prefab from a live tree (`Prefab.fromGameObject`) gives every component of every id'd node a distinct id, and the same id is on the live component afterwards (unit test).
- [ ] DW-1.2: `ensureIds(tree, true)` on a tree without component ids yields `~c:<nodeId>:<type>:<n>` ids, identical across two calls on equal input (determinism test), and derived after the fold (a doubled-RectTransform tree yields exactly one RT id).
- [ ] DW-1.3: `EngineObject.Instantiate` and `serializeGameObject`→`deserializeGameObject` copies of an object inside an instance have `_prefabComponentId === null` on every component (D-10 test).
- [ ] DW-1.4: a plain scene save is still byte-identical to the base (no `id` on components) — fixture compare.

### Phase 2: Writers — component `id`, `cid` on refs, `componentId` on changes
**Skills:** code-foundations:cc-defensive-programming
**Model:** sonnet
**Gate:** Full
**Depends on:** Phase 1
**File scope:** src/engine/core/serialization/SceneSerializer.ts (component writer, `_needsLinkReader` untouched), src/engine/core/serialization/ValueSerializer.ts (`_componentRef`, `SerializeContext`), src/engine/core/serialization/Prefab.ts (file writer), src/engine/core/serialization/PrefabOverride.ts (types `PrefabOverride.componentId?`, `PrefabRemovedComponent.componentId?`), tests/ComponentIds.test.ts, tests/ComponentIdsFormat.test.ts

**Goal:** every writer that writes node ids also writes component ids and id-based addresses, keeping
the old fields.

**Scope:**
- IN: component `id` in prefab trees, link-mode instance interiors and prefab files; `ComponentRef`
  gains `cid` when the target node has an id (keep `component` + `index`); `PrefabOverride.componentId`
  and `PrefabRemovedComponent.componentId` written next to `component` + `componentIndex`; an added
  component carries `id` inside `component`.
- OUT: reading them (Phase 3).

**Edge cases:** a ref into a nested instance's interior (scope > 0) writes the nested prefab's id;
a ref to a plain-scene object writes no `cid`; a `Transform` ref writes no `cid`.

**Produces:** the on-disk format (document one example JSON of a link instance with a removed and an
overridden component, and one `ComponentRef` with `cid`, in `code-foundations/A5/format.md`).

**Done when:**
- [ ] DW-2.1: for each writer path (scene with link instance, prefab file, variant, clipboard `serializeGameObject`), a test asserts: if the output contains `cid`/`componentId`/a component `id`, `SceneSerializer._needsLinkReader(output)` was already true for node ids alone (version gate test over all paths).
- [ ] DW-2.2: a plain scene with `ComponentRef`s writes no `cid` (byte-identical to base).
- [ ] DW-2.3: `format.md` examples are produced by running the writer (pasted output), not written by hand.

### Phase 3: Readers — resolve by id, fall back by type + occurrence, migrate old addresses
**Skills:** code-foundations:cc-defensive-programming
**Model:** sonnet
**Gate:** Full
**Depends on:** Phase 2
**File scope:** src/engine/core/serialization/SceneSerializer.ts (`_findComponent` callers, ref resolution ~2124/2724, load of `id`), src/engine/core/serialization/ValueSerializer.ts (`pendingComponentRefs`), src/engine/core/serialization/PrefabOverride.ts (`ensureIds` migration of RT/Transform #k≥1), tests/ComponentIds.test.ts, tests/ComponentIdsLegacy.test.ts

**Goal:** readers prefer ids, never misresolve, and old files keep loading the same.

**Scope:**
- IN: `ComponentRef` resolution: `cid` among the target node's components first, else
  `component` + `index`; overrides/removals: `componentId` on the addressed node (composite
  `node` addresses resolve the node first, then the id within that node), else type + occurrence;
  old-file migration: addresses to `RectTransform`/`Transform` with index ≥ 1 retarget to 0 before
  ids are derived; a `ComponentRef` to `RectTransform` index ≥ 1 maps to 0.
- OUT: PrefabDiff comparison (Phase 4).

**Edge cases:** a `cid` that does not resolve on that node (component removed) → fall back, and if the
fallback finds a different-typed or no component → `null`, never another component of another type;
duplicate ids in one node (corrupt file) → first wins + `console.warn` once.

**Done when:**
- [ ] DW-3.1: the ref test of success criterion 2 passes (second of two same-type components, first removed, link save + reload).
- [ ] DW-3.2: a file with `cid` pointing at a removed component resolves to `null` (not to a neighbour).
- [ ] DW-3.3: every `bde23fc` fixture (generated via `git archive bde23fc | tar -x -C <tmp>`, script under `tasks/probes/` style, not committed under `tests/`) loads into the same live state as on base `cd0f4d7` (component lists, field values, ref targets compared).

### Phase 4: PrefabDiff and Prefab by id
**Skills:** code-foundations:cc-defensive-programming
**Model:** sonnet
**Gate:** Full
**Depends on:** Phase 3
**File scope:** src/engine/core/serialization/PrefabOverride.ts (`_compareComponents`, `_applyChanges` component parts, `unused`, `inexpressible`, nesting `layer/nest`), src/engine/core/serialization/Prefab.ts (`getChanges`, `revertOverride`, `applyInstance`, `createVariant`/variant changes, A1 N4 records), tests/ComponentIds.test.ts, tests/PrefabComponentIds.test.ts

**Goal:** comparing, applying, reverting and varying instances match components by id.

**Scope:**
- IN: `_compareComponents` matches prefab↔instance components by id when both have one, else by type +
  occurrence; removals/overrides/additions carry ids (Phase 2 fields); `applyChanges`/`unused` resolve
  by id first; `revertOverride`, `applyInstance`, variants; A1's N4 records (refs into a reverted
  subtree) use component ids where available.
- OUT: reorder of the prefab's own components (stays inexpressible).

**Edge cases:** nested prefab: an id inside the nested interior is matched only within that nested
instance; two instances of the same nested prefab side by side share ids and must not cross-match;
variant of a variant.

**Done when:**
- [ ] DW-4.1: success criterion 1 (the Collider case) passes through `getChanges`, a link save, a reload and a prefab edit.
- [ ] DW-4.2: reordering two components the instance added round-trips; reordering the prefab's own still returns the existing `inexpressible` reason.
- [ ] DW-4.3: two side-by-side instances of one nested prefab, one with its second collider removed: the other instance is unchanged (no cross-match).
- [ ] DW-4.4: `revertOverride` of a removal restores the right component (by id) with its prefab values.

### Phase 5: MissingComponent, idempotence, nested scope, acceptance suite
**Skills:** code-foundations:cc-quality-practices
**Model:** sonnet
**Gate:** Full
**Depends on:** Phase 4
**File scope:** src/engine/core/serialization/MissingComponent.ts, src/engine/core/serialization/SceneSerializer.ts (MissingComponent read/write only), tests/ComponentIds.test.ts

**Goal:** every remaining card test and the review focus are pinned.

**Done when:**
- [ ] DW-5.1: a `MissingComponent` keeps its `id` through load → save.
- [ ] DW-5.2: link-mode idempotence: for every link fixture, save → load → save produces identical bytes; legacy ids never appear in a written file unless the file is written with ids anyway (then they are minted, not `~c:`).
- [ ] DW-5.3: no plain scene (all fixtures + the ten ScenarioCreator production scenes read from `../ScenarioCreator/Scenarios/**/scenes/*.json` in the worker's own worktree, read-only) gains `id`/`cid`/`componentId` on re-save.
- [ ] DW-5.4: `tasks/probes/e11` probes that passed on base still pass (list before/after in the notes).
- [ ] DW-5.5: full checks green: `npm run typecheck`, `npm test`, `npm run build`.

### Phase 6: Docs and roadmap
**Skills:** code-foundations:code-clarity-and-docs
**Model:** sonnet
**Gate:** Minimal
**Depends on:** Phase 5
**File scope:** CHANGELOG.md (engine), .claude-shared/ROADMAP.md (A5 row), .claude-shared/tasks/A5-component-ids.md (status line), .claude-shared/tasks/README.md (A5 row), .claude-shared/code-foundations/A5/*

**Goal:** the change is recorded where the owner and the next tasks will look.

**Done when:**
- [ ] DW-6.1: engine CHANGELOG *Added* (component ids, where written, `cid`/`componentId`) and *Changed* (exported types `PrefabOverride`, `PrefabRemovedComponent`, `SerializedComponent`), with decision D-16 summarised (the design doc is gone; point to `.claude-shared/code-foundations/A5/research.md`).
- [ ] DW-6.2: ROADMAP A5 row → `✅ <date> W<n>` + what landed; README A5 row → Done; `format.md` and the build notes in `code-foundations/A5/`.

---
## Test Coverage
**Level:** 100%
## Test Plan
- [ ] Every DW above has a named test in `tests/ComponentIds*.test.ts` / `tests/PrefabComponentIds.test.ts` (or a recorded command output for DW-2.3, 3.3, 5.4).
- [ ] Dirty tests: corrupt file with duplicate component ids (first wins, one warning); `cid` to a removed component (→ null); RT index 1 in an old file (→ RT#0); a nested interior id colliding with an outer id (no cross-match).
- [ ] Integration: link save → reload → prefab edit → instance follows, for colliders, UI (RectTransform + UIImage) and a script with a `ComponentRef` field.
- [ ] Manual: none.

## Assumptions
| Assumption | Confidence | Verify Before Phase | Fallback If Wrong |
|---|---|---|---|
| `_foldSingleCopies` runs on every read path before ids would be derived | medium | 1 | add the fold to the missing path in Phase 1 and note it |
| `ensureIds` is reached for every file without node ids | high | 1 | derive component ids in the same place node ids are given |
| No consumer reads `componentIndex` from files directly | high | 2 | keep both fields (already required) |

## Decision Log
| Decision | Alternatives Considered | Rationale | Phase |
|---|---|---|---|
| D-16 ids only where node ids exist | ids on every component (Unity) | owner decision #5: not now, additive later | all |
| keep old fields beside ids | ids only | old readers + fallback; version gate unchanged | 2 |
| legacy ids derived after fold | before fold | M0.2 review note 3: a folded copy's id would dangle | 1 |
| base for byte compare = `cd0f4d7` | card's `e6a8500` | M0.2a changed load order after `e6a8500` | 1, 5 |
| D-16 recorded in task notes, not the design doc | restore the doc | the owner deleted the doc in `a3fe342` | 6 |

---
## Notes
- Hub files: phases are strictly serial; do not parallelise.
- Opus-level semantics: each Full-gate review must re-run the Collider case and the nested side-by-side case itself.
- Owner decisions in force: #5 (no ids on every component), #13 (later doubled copy wins), #14 (one RectTransform per live object).
---
## Decided During Build
_Filled by /code-foundations-build — one row per decision an agent made or question it raised:_
| # | Phase | Decision or question | Source | Status |
|---|---|---|---|---|
| B-1 | 1 | `ensureIds` derives component ids only once the readers exist (Phase 3), not in Phase 1: `PrefabDiff._ensureComponentIds` is implemented and unit-tested, but not called from `ensureIds` yet. Deriving earlier puts ids into written output ahead of the writers that own the format — a minted id appears in a re-saved changes list (`tests/PrefabInstances.test.ts` "saving a rebuilt instance in link mode writes back the same changes" failed with exactly that) and a legacy `~c:` one in a prefab file; neither is idempotent until writer and reader agree. Phase 1 is byte-neutral (DW-1.4 passes); the DW-1.2 assertions are pinned against the helper itself. | `tests/PrefabInstances.test.ts` idempotence guard | done in Phase 1, wire in Phase 3 |
| B-2 | 1 | The copy rule mirrors nodes mechanically: `_stamp` (instance root) and `unpackPrefab` clear component ids exactly where node ids are cleared; `EngineObject.Instantiate` and the clipboard path get null ids for free because the plain (non-link) serializer writes no ids yet. | research D-16, code | done |
| B-3 | 1 | `SceneCtx.mintedComponents` mirrors `minted` (shared with `outer`, `mintLive` decides live-vs-beside), so Phase 2's writers can read a component's id "as this pass writes it" the way `_nodeIdOf` does for nodes. | plan Phase 1 "Produces" | done |
| B-4 | 2 | Two writers-phase gates mirror nodes mechanically: the component writer writes under the node writer's own `withId` flag (so a plain scene and the clipboard path gain nothing), and `ComponentRef`'s `cid` only exists in link passes (`componentId` closure is link-gated; `_enclosingCtx` passes are link by construction). `PrefabDiff._equal` ignores a `cid` when both refs are ComponentRefs and everything else matches — the cid names the component the type and index already name, so a file saved before it does not read as changed. | Phase 2 writers, suite evidence | done |
| B-5 | 2 | `_borrowIds` borrows component ids by position from the match tree and marks the node in `SceneCtx.borrowedComponents`; `_mintComponentIds` skips marked nodes. Without it an object compared with a prefab by position minted ids the prefab tree does not carry, and every reference on it read as an override (`tests/PrefabIdentity.test.ts` "objects without node ids", 3 tests). | suite evidence | superseded by B-6 (the same coverage, without a separate set) |
| B-6 | 3 | Where ids are minted, final: (a) with a fresh node id, in `_mintAddedIds` — an added object's components are the instance's own; (b) for what the match tree does not cover, in `_giveAllIds`' `_mintUncoveredComponents` — an added component on a node the prefab has, where the pass knows the tree; (c) in `ensureIds`, for a prefab file's tree and its root. Minting "every component of every id'd node" in every pass gave the instance side ids the prefab tree could not know — a tree built without ever going through `ensureIds` (a test `bind`, an old file) has none — so every save minted a new one and an override could vanish. `_serializeInstance`, the scene's link writer, runs the same `_giveAllIds` pass a comparison does, or an added component is written with no id at all. | suite evidence: idempotence + override-preservation tests | done |
| B-7 | 3 | `_matchComponentIds` (the pass that lets the match tree's components decide) gives the twin's id only to a component that has none of its own: a list that lost a component in front has shifted, and the twin at the same position is a different component — overwriting the live id there made a comparison match the wrong pair (found via the DW-2.3 example: a removal of the wrong Tag). Marking as covered still happens for every twin position. | DW-2.3 example generation | done |
| B-8 | 3 | The comparison matches by id and falls back to type + occurrence for an id that names nothing here — a tree whose ids were minted in another namespace, or one from before ids. Reads (references) are stricter: a `cid` that resolves to nothing is null, never a positional neighbour (DW-3.2). Apply-side changes read by the id when it resolves and by the address written beside it otherwise, as the plan's reader rule says. | plan Phase 3/4 text | done |
---

## Execution Log

### Phase 1 — ids on their own (Standard gate) — DONE
Commit `fa7af72` (WebEngineTS), tests `tests/ComponentIds.test.ts` (7).
`Component._prefabComponentId`, `SerializedComponent.id`, `PrefabOverride.componentId?`,
`PrefabRemovedComponent.componentId?`; minting in `_mintAll`'s passes (`_mintComponentIds`,
`_giveComponentId`, `_componentIdOf`, `SceneCtx.mintedComponents`); load-side assignment in
`_attachComponent`; clears on unpackPrefab and `Prefab._stamp`; `PrefabDiff._ensureComponentIds`
(derivation, legacy `~c:<nodeId>:<type>:<n>` after the fold) implemented and unit-tested but
NOT wired into `ensureIds` — see B-1: it lands with the readers in Phase 3.

### Phase 2 — writers (Full gate) — DONE
Commit `4a69551` (WebEngineTS), tests `tests/ComponentIdsFormat.test.ts` (5).
Component `id` written under the node writer's `withId` gate; `cid` on `ComponentRef` in link
passes beside `component` + `index` (`SerializeContext.componentId`, link-gated closure);
component-id borrowing from the match tree in `_borrowIds` + `borrowedComponents`; cid-insensitive
ref comparison in `PrefabDiff._equal`. Full gate review (writer-scoped; the Collider and nested
side-by-side cases run at Phase 4/5 where they are decidable): gates mirror nodes, borrow is
positional and never overwrites a live id, minting never overwrites, `_enclosingCtx` is link by
construction. `tests/PrefabInstances.test.ts` idempotence test adapted to save-twice form (first
save of a pre-ids file adds ids; every save after writes the same bytes).

### Phase 3 — readers — DONE (with the Phase 4 comparison change it forced)
Commit `c82766b` (WebEngineTS) + the id-overwrite fix, tests `tests/ComponentIdsLegacy.test.ts`
(3), format examples `code-foundations/A5/format.md`.
- Readers: `ComponentRef` by `cid` first (unresolvable → null, never a neighbour, DW-3.2), else
  type + occurrence; old-file addresses to `RectTransform`/`Transform` index ≥ 1 retarget to 0
  (`legacyComponentIndex`) on every read path; overrides/removals resolve `componentId` on the
  addressed node and read by the address beside it otherwise; duplicate ids on one node →
  first wins + one warn.
- `ensureIds` is wired: component ids derived where its nodes have them — `~c:` legacy for files
  without them (deterministic across loads), minted for a tree that never had them.
- The comparison (Phase 4's first change, pulled forward because a silent reference loss is
  worse than the pre-A5 behaviour): `_compareComponents` matches by id, else by type +
  occurrence, and writes `componentId` beside the readable address; `_equal` treats two refs
  that differ only in a cid as the same value. Full-gate review re-ran the Collider shape (two
  Tags, first removed, prefab edits the second) end to end and the nested side-by-side shape.
- DW-3.3 verified by extraction, not asserted in the suite: `git archive bde23fc | tar -x -C
  <tmp>` (the E11 compat fixtures built, saved, reloaded and dumped) under the base `cd0f4d7`
  and under this branch — **the two dumps are byte-identical**. (Against `bde23fc` itself they
  differ, as designed: `bde23fc` predates M0.2a's load-order change; the plan's baseline is
  `cd0f4d7`.) Scratch probe kept out of the repo.
- DW-2.3: `format.md` examples are the writer's own output (a link with a removed and an
  overridden component, and a `ComponentRef` with `cid`).
