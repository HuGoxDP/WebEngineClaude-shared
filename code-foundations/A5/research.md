# A5 — Component ids: research (Claude, 2026-11-10)

**Status:** confirmed by Claude (architect lane); the plan beside it (`plan.md`) is `ready`.
**Base:** WebEngineTS `master` `cd0f4d7` (after M0.2a–e, M0.3a–e, B0). Card: `tasks/A5-component-ids.md`.

## What A5 must achieve

A component inside a prefab tree, a link-mode instance interior or a prefab file gets its own
persisted id, so overrides, removals and `ComponentRef`s keep pointing at the right component when an
earlier component of the same type is removed or the list is reordered. Plain scenes stay byte for
byte unchanged. This must land before `v0.2.0` (A9) freezes the version-2 format.

## Facts checked against the code (cd0f4d7)

| Fact | Where |
|---|---|
| `SerializedComponent` is `{ type, fields }` — no id | `SceneSerializer.ts:182` |
| Overrides address components by `component` + `componentIndex` (per type) | `PrefabOverride.ts:14` (`PrefabOverride`) |
| Added components carry an **absolute** `index`; removed ones `component` + `componentIndex` | `PrefabOverride.ts:86`, `:95` |
| Node ids: `mintNodeId()` random+counter, legacy `~<path>` from `ensureIds(…, legacy)` | `PrefabOverride.ts:315`, `:741` |
| Instance↔prefab component matching is type + occurrence | `PrefabDiff._compareComponents`, `PrefabOverride.ts:1309` |
| `ComponentRef` JSON = `{ $type, path, scope?, component, index }` | `ValueSerializer._componentRef`, `ValueSerializer.ts:598` |
| Ref resolution = `_findComponent(go, type, index)` | `SceneSerializer.ts:2124`, `:2814` |
| Node-id minting in a save: `_mintAll` / `_giveId` / `ctx.minted` / `mintLive` | `SceneSerializer.ts:368`, `:421`, `:1443` |
| Copies clear node ids (D-10) | `GameObject.ts:289`, `:298` |
| Version-2 marker detection | `SceneSerializer._needsLinkReader`, `:734` |
| Doubled-copy fold on read | `SceneSerializer._foldSingleCopies`, `:2520` (A12/M0.2) |
| `MissingComponent` keeps `type` + raw `fields` | `MissingComponent.ts` |

## Changes since the card was written (they shape the plan)

1. **M0.2b (807f6a1):** a live object never holds `RectTransform #k≥1` (or a second `Transform`):
   `addComponent` returns the held one. So ids minted from live objects never address such a copy.
   Only files from older engines can, which is the M0.2 review's "notes for A5" 1–3:
   - an added `RectTransform` on a node whose prefab already has one, and any change addressed to
     `RectTransform #k≥1`, belong to RT#0;
   - a `ComponentRef` to `RectTransform` with `index ≥ 1` maps to index 0;
   - **mint ids after the fold**, never before (a folded copy's id would dangle).
2. **M0.2a (17c408a):** a load builds the whole tree (components attached, fields written, refs
   resolved) before any `awake`. Component ids must be assigned to live components in that build
   pass, together with `_prefabNodeId`, not in the wake pass.
3. **M0.2c/M0.2e:** objects destroyed during a load and reparenting are handled; no impact on ids
   beyond "a destroyed component's id is gone with it".
4. **The design doc the card cites is gone.** `design/prefab-instances-plan.md` was deleted by the
   owner in `a3fe342` ("remove unused and outdated documentation"). Read it from history
   (`git show a3fe342^:design/prefab-instances-plan.md`) for D-5, D-10, §2.5, §6.1, §7. **Do not
   restore it.** Decision D-16 below is recorded here and summarised in the engine CHANGELOG instead.

## Decisions (made here; the card left them open or they follow from the changes above)

- **D-16 (Q2, 2026-10-13, as implemented):** component ids exist exactly where node ids are written
  (prefab trees, link-mode instance interiors, prefab files); never in a plain scene. Same id
  namespace and minting function as node ids (`mintNodeId()`); minted once, written to the live
  component (`Component._prefabComponentId`), never recomputed. Copies (`EngineObject.Instantiate`,
  `serializeGameObject`/`deserializeGameObject`) get new ids, mirroring D-10 for nodes.
- **Legacy ids:** `~c:<nodeId>:<type>:<occurrence>`, derived in `ensureIds` for files without component
  ids, **after** `_foldSingleCopies`. In-memory only until the file is written with ids anyway.
  Occurrence is per type, counted after the fold.
- **Addressing, writers:** write `componentId` (overrides, removals), `id` inside the added
  component's `component`, and `cid` on `ComponentRef` **in addition to** the existing
  `component` + `componentIndex` / `index` (readable fallback). **Readers:** resolve by id when it
  resolves on that node (within the node's own prefab scope), else by type + occurrence.
- **RT#k≥1 migration** (old files only): an override or removal addressed to `RectTransform`
  (or `Transform`) with index ≥ 1 is retargeted to index 0 before ids are derived; an added
  `RectTransform` on a node whose prefab already has one is dropped by the fold (existing A12
  behaviour) and gets no id.
- **Nested prefabs:** a component id inside a nested instance belongs to the nested prefab and may
  repeat between two instances of it. Composite node addresses (`"outer/inner"`) already scope
  nodes; a `componentId` is always resolved on the node that the (possibly composite) `node`
  address found — never globally.
- **Reorder:** reorder of components the instance added stays expressible (absolute `index`);
  reorder of the prefab's own components stays inexpressible (`PrefabDiff.inexpressible`) —
  unchanged, Unity forbids it too.
- **Version gate:** `cid`/`componentId`/component `id` never make a file version 2 by themselves; they
  only appear where node ids already do. Asserted by a test over every writer path, not assumed.
- **MissingComponent:** keeps its saved `id` through load → save (it is part of the raw record).
- **Plain-scene bytes:** re-saving any plain scene fixture is byte-identical to the output of
  `cd0f4d7` (the base). The card's `e6a8500` reference is older than M0.2a's load order and is not
  used.
- **Old fixtures:** generate from `bde23fc` with `git archive bde23fc | tar -x -C <tmp>` (not a git
  worktree — workers must not create nested worktrees), as the E11 review did with
  `tasks/probes/e11/zzprobe/compatFixtures.ts`.

## Risks

- **Semantic, not typing:** E11 (same area) had 20 review findings and 3 regressions from their fixes.
  Every phase that touches `SceneSerializer`/`PrefabOverride` therefore has a Full gate with an
  adversarial review, and the plan's DW items are behaviour checks, not "code exists".
- **Idempotent bytes in link mode:** save → load → save must not change a link file. A legacy id that
  leaks into a write, or a minted id recomputed on load, breaks it. Pinned in Phase 5.
- **Hub files:** `SceneSerializer.ts`, `PrefabOverride.ts`, `Prefab.ts` are touched by most phases,
  so the phases run strictly in order.
