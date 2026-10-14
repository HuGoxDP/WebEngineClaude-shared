# A5 — Component ids (decision Q2), scoped like node ids

| | |
|---|---|
| Repo / branch | WebEngineTS · `claude/scenario-platform-architecture-24f9fy` |
| Model | **Opus** (touches every part of `PrefabDiff`; same risk profile as E11) |
| Size | 3–5 days |
| Depends on | A1 (format decisions `after` / optional `path`), A3 (D5), A4 (gate) |
| Blocks | A9 (must ship in the same release as the version-2 reader) |

## Why (decided 2026-10-13, vision doc "Вопрос 2")

Today a component is addressed by (node path or node id, registered type name, occurrence index
among components of that type). Remove the first of two same-type components in a prefab and every
override and reference to the second silently moves to the wrong one. Verified misbehaviour: the
prefab has `Collider{size:1}` and `Collider{size:5,isTrigger:true}`; the instance removes the first;
`compareChanges` gives overrides on `componentIndex 0` plus `removedComponents [{componentIndex:1}]`;
after the prefab edits its second collider's size to 9 the instance still reads 5. A component
reorder is "inexpressible" and forces the whole instance out of link mode.

Unity, Cocos Creator and Needle give every component its own id for exactly this reason. **Scope,
as Cocos:** ids only where node ids are written — prefab trees, instance interiors in link mode,
prefab files. A scene with no prefab instance stays byte for byte as it is. Doing it before the
first release that reads version 2 costs nothing; after, it needs a version 3 and a second
readers-first cycle.

## Read first

- `design/prefab-instances-plan.md` — D-5 (why node ids were done before the format froze),
  §2.5 (paths), §6.1 (ids: minting, `ensureIds`, legacy `~` ids, D-10 copies get new ids), §7.
- `src/engine/core/serialization/PrefabOverride.ts` — types `PrefabOverride` (~14),
  `PrefabAddedChild` (~52), `PrefabAddedComponent` (~61), `PrefabRemovedComponent` (~70);
  `mintNodeId` (~290); `ensureIds` (~671); `applyChanges` component parts (~495–510);
  `_compareComponents` (~1228); `inexpressible` (component reorder, ~631); `unused`.
- `src/engine/core/serialization/SceneSerializer.ts` — `SerializedComponent` (~147), `_mintAll`
  (~1052), `_giveId` (~1108), `_findComponent` and its caller (~1679), the component writer.
- `src/engine/core/serialization/ValueSerializer.ts` — `_componentRef` / `componentIndex` (~600),
  `pendingComponentRefs`.
- `src/engine/core/serialization/Prefab.ts` — `getChanges`, `revertOverride`, `applyInstance`,
  `createVariant` / variant changes.
- `src/engine/core/GameObject.ts` — `_prefabNodeId` (~104) and how copies clear it (~264): the live
  pattern to mirror on `Component`.
- `src/engine/core/serialization/MissingComponent.ts` — an unknown component must keep its id.

## Design (implement this; deviations need a reason in the report)

**Data.**
- `SerializedComponent.id?: string` — written only where its node has an `id` (same rule as node
  ids: prefab trees, link-mode instance interiors, prefab files). Never in a plain scene.
- Live: `Component._prefabComponentId: string | null` (`@internal`), the analogue of
  `GameObject._prefabNodeId`; cleared on copy exactly where node ids are (D-10: copies get new ids).
- Ids share the prefab's id namespace with node ids and are minted by `mintNodeId()` in the same
  passes (`_mintAll`, `_serializeForPrefab`'s minting) — minted once, written to the live object,
  never recomputed.
- **Legacy ids** for files without component ids, derived deterministically in `ensureIds`:
  `~c:<nodeId>:<type>:<occurrence>` (cannot collide with minted ids, which never start with `~`).
  A file read with legacy ids and saved writes minted ids only if it was going to write ids anyway;
  until then the legacy ids are in-memory.

**Addressing.**
- `PrefabOverride` gains `componentId?: string`; `PrefabRemovedComponent` gains `componentId?:
  string`; an added component carries its `id` inside `component`. Writers write the id **and** keep
  `component` + `componentIndex` (readable, and the fallback). Readers resolve by `componentId` when
  it resolves on that node, else by type + occurrence.
- `ComponentRef` JSON gains `cid?: string`, written where the target node has an id (inside
  prefab trees and link-mode instances). The reader resolves `cid` among the target node's
  components first, then falls back to `component` + `index`.
- `_compareComponents` matches prefab and instance components **by id** when both have one, else by
  type + occurrence (old files, plain scenes).
- **Reorder:** a reorder of components **the instance added** stays expressible as today (`index`).
  A reorder of the prefab's own components stays inexpressible (Unity forbids it too) — unchanged.
- `_needsLinkReader` / the version-2 marker: a `cid` or `componentId` alone does not need a new
  version — version-1 readers never see them, because they only appear where node ids already make
  the file version 2. Assert this in a test rather than assume it.

## Do (order)

1. Types + live field + minting + legacy derivation (`ensureIds`), with unit tests on ids alone.
2. Writers: prefab trees, link mode, prefab files write `id` on components and `cid` on refs.
3. Readers: `cid` and `componentId` resolution with fallback.
4. `PrefabDiff`: compare/apply/unused by id; `Prefab`: `getChanges`, `revertOverride`,
   `applyInstance`, variants.
5. A1's N4 records (references into a reverted subtree) switch from type + occurrence to component
   ids where available.
6. MissingComponent keeps its id through load/save.

## Tests (`tests/ComponentIds.test.ts`, new; plus existing suites green)

- The Collider case above: after removing the first of two colliders and the prefab editing the
  second, the instance follows the edit; `removedComponents` names the right one (by id).
- A `ComponentRef` to the second of two same-type components survives the removal of the first,
  through a link save and a reload.
- Reordering two components the instance added round-trips; reordering the prefab's own stays
  inexpressible (unchanged behaviour).
- A copy (`EngineObject.Instantiate`, clipboard path `serializeGameObject`/`deserializeGameObject`)
  of an object inside an instance gets new component ids (D-10).
- Legacy: every prefab/scene fixture written at `bde23fc` (generate with a worktree, as the E11
  review did — see `tasks/probes/e11/zzprobe/compatFixtures.ts`) loads identically; re-saving a
  plain scene is byte-identical to `e6a8500`'s output.
- MissingComponent keeps its id.
- A file that contains `cid`/`componentId` is already version 2 for another reason (assert on every
  writer path).

## Acceptance

`npm run typecheck`, `npm test`, `npm run build` green; the verified-misbehaviour test passes;
`tasks/probes/e11` probes that passed before still pass. CHANGELOG *Added*: component ids, where they
are written, `cid`/`componentId`; *Changed*: the exported types. Plan: a new decision D-16 (Q2) with
the reasoning, §7 updated.

## Out of scope

Ids on every component of every scene (Unity's model) — additive later if wanted (owner decision).
Undo using ids (card D3) — undo needs in-memory identity, not persisted ids.

## Commits

One per step above (`feat(serialization): …`), each green.

## Report back

The format as it landed (one example JSON of a link-mode instance with a removed and an overridden
component, and of a `ComponentRef` with `cid`), tests, and the byte-compare result for plain scenes.

## Review focus (Opus reviewer)

Id stability across save → load → save (idempotent bytes in link mode); nested instances (a
component id inside a nested prefab is the nested prefab's, repeated between two instances of it —
resolve within its scope only); variants; `MissingComponent`; that no plain scene gains an `id`.
