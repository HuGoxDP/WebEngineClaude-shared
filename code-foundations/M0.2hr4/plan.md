# Plan: M0.2hr4 — an edit made through `MeshFilter.mesh` survives batching, Instantiate and save
**Created:** 2026-11-21 (Claude, architect lane)
**Status:** ready
**Complexity:** moderate (lifecycle + serializer: Full gate on Phase 3, adversarial review in Phase 4)
**Review cadence:** per phase
**Check-ins:** quiet
---
## Context
After M0.2h the renderer draws the per-object copy made by the `mesh` getter, but static batching,
save, prefab snapshots and `Instantiate` read `sharedMesh`, so a getter edit reverts there.

Research, facts with line numbers and every decision: `code-foundations/M0.2hr4/research.md`.
**Read it first. Its Decisions D-1 … D-7 are binding.** Base: WebEngineTS `master` `c4a0119`.

Short version of the decisions:
- **D-1:** `sharedMesh` becomes an alias of the instance after the first getter read (Unity).
- **D-2:** instances made by a getter are freed when no MeshFilter uses them any more (use count).
- **D-3:** `Instantiate` passes meshes by identity through an in-memory table. The table never reaches a file.
- **D-4:** an edited primitive stops claiming its recipe. It saves empty, with one warning.
- **D-5:** batching needs no change.
- **D-6:** the pins are kept.

**Success criteria:**
1. After `const m = filter.mesh; m.vertices = edited;`:
   - `filter.sharedMesh === m`;
   - `StaticBatchingUtility.combine` builds the batch from the edited vertices;
   - `Instantiate` gives a copy that draws the edited vertices and shares `m`;
   - destroying the original leaves the copy drawing.
2. Saving never reads the `mesh` getter (`Serialization.test.ts:2063` unchanged and green). No file or prefab snapshot ever contains `"LiveMesh"`.
3. An edited primitive saves as `null` with one warning per mesh. An unedited primitive, and an unedited clone of one, still save as `PrimitiveMesh`.
4. Every existing test stays green **unchanged**: M0.2h / M0.2hr1 / M0.2hr2 in `tests/MeshFilterMesh.test.ts`, the MeshFilter block in `tests/Serialization.test.ts` :1965-2075, `tests/ModelSubAssets.test.ts`, `tests/StaticBatching.test.ts`, `tests/InstantiateGameObject.test.ts`.
5. `npm run typecheck`, `npm test`, `npm run build` green. CHANGELOG lists the two behaviour changes from D-3 and D-4 under *Changed*.

## Constraints
- **Engine repo only**, plus this task's `.claude-shared/code-foundations/M0.2hr4/` notes. No public API is removed. `primitive` keeps its type and returns `null` when stale.
- New members are `@internal` with a `_` prefix: `_filterUses`, `_autoDestroy`, `_recipeStale`, `_retainByFilter()`, `_releaseByFilter()`, `_ownsShared`, `SceneSerializer._cloneGameObject()`.
- **Never weaken a test.** Checked 2026-11-21: no existing test asserts the old split. `MeshFilterMesh.test.ts:116` and `:332`, and `Serialization.test.ts:2072-2073`, all hold under D-1. If a test still fails for a reason the research does not explain, it is a question: park it and write to ATTENTION. Do not edit the test.
- Hub files touched: `SceneSerializer.ts` and `GameObject.ts` (Phase 3 only, small edits).
- Coders write code and tests. Builds and tests run in the build window, per the lead's protocol.

## Phases

### Phase 1: Mesh — stale recipe and filter use count
**Skills:** code-foundations:cc-defensive-programming
**Model:** sonnet
**Gate:** Standard
**Depends on:** none
**File scope:** WebEngineTS: src/engine/core/graphics/Mesh.ts, tests/MeshRecipeStale.test.ts

**Goal:** a mesh knows when its recipe no longer describes its geometry, and how many MeshFilters use it.

**Scope:**
- IN:
  - `private _recipeStale = false`. `_markDirty()` sets it when `_primitive !== null`.
  - `get primitive()` returns `null` when `_recipeStale`.
  - `clone()` copies `_recipeStale`.
  - `/** @internal */ _filterUses = 0` and `/** @internal */ _autoDestroy = false`.
  - `/** @internal */ _retainByFilter(): void` (`++`).
  - `/** @internal */ _releaseByFilter(): boolean`. It decrements, never below 0 (a release at 0 logs `console.error` once and stays 0). It returns `true` when it reached 0 **and** `_autoDestroy` is set; the caller then destroys the mesh.
  - JSDoc on each member. The JSDoc of `primitive` says it is null once the geometry was written after the factory built it.
- OUT: MeshFilter (Phase 2). The codec (Phase 3). The bounds paths (`set bounds`, `recalculateBounds`) must **not** mark the recipe stale.

**Edge cases:**
- Factories write geometry before `_primitive` is set, so a fresh primitive is never stale.
- `clear()` on a primitive makes it stale.
- A stale clone's own clone stays stale.

**Done when:**
- [ ] DW-1.1: For each writer, a fresh `Mesh.createCube(1)` written once has `primitive === null` (one parameterized test). The writers: `vertices`, `normals`, `tangents`, `uv`, `uv2`, `uv3`, `uv4`, `colors`, `triangles`, `indexFormat`, `setSubMesh`, `recalculateNormals`, `recalculateTangents` (if present), `clear()`.
- [ ] DW-1.2: All six factories (Cube, Sphere, Plane, Cylinder, Capsule, Quad) return a mesh whose `primitive` is non-null and equals `{ kind, args }`. Not stale at birth.
- [ ] DW-1.3: `set bounds` and `recalculateBounds()` on a primitive leave `primitive` non-null.
- [ ] DW-1.4:
  - an unedited cube's `clone().primitive` equals the cube's;
  - an edited cube's `clone().primitive` is `null`;
  - editing a clone does not make the original stale.
- [ ] DW-1.5: Use count:
  - retain ×2 then release → `_filterUses === 1`, returns `false`;
  - release again with `_autoDestroy = true` → returns `true`;
  - with `_autoDestroy = false` → returns `false`;
  - a release at 0 stays 0 and logs one `console.error` (spy).
- [ ] DW-1.6: `tests/Serialization.test.ts` :1976-2056 green unchanged (recipe round-trip, `primitive` null for a built mesh, "a clone keeps the recipe").

### Phase 2: MeshFilter — alias, ownership, use count
**Skills:** code-foundations:aposd-verifying-correctness
**Model:** sonnet
**Gate:** Standard
**Depends on:** Phase 1
**File scope:** WebEngineTS: src/engine/core/rendering/MeshFilter.ts, tests/MeshFilterMesh.test.ts, tests/StaticBatching.test.ts

**Goal:** D-1 and D-2. `sharedMesh` is the instance once the getter ran. Instances live exactly as long as some MeshFilter uses them.

**Scope:**
- IN:
  - **Storage.**
    - One slot, `_sharedMesh`, plus `private _ownsShared = false`.
    - `_meshInstance` becomes a private **getter**: `return this._ownsShared ? this._sharedMesh : null;`. Keep the name: tests probe it.
    - `_effectiveMesh()` returns `_sharedMesh`.
  - **A private `_store(value, owned)` helper.**
    - If `value !== _sharedMesh`: retain the new mesh (if non-null), release the old one, and if the release returns `true`, `old.destroy()`.
    - Then set `_sharedMesh = value` and `_ownsShared = owned`.
    - Then notify the renderer once.
  - **Getter.**
    - Owned → return it.
    - Otherwise, if `_sharedMesh` → `const c = _sharedMesh.clone(); c._autoDestroy = true; _store(c, true); return c;`.
    - Otherwise `null`. The "no mesh: create one" branch is not added; that stays the existing behaviour.
  - **`sharedMesh` setter.**
    - `value === _sharedMesh && _ownsShared` (disown, M0.2hr1) → `_ownsShared = false; value._autoDestroy = false;`. The renderer needs no change.
    - Otherwise → `_store(value, false)`.
  - **`mesh` setter.**
    - `value === _sharedMesh` → no change. This is the self-assign idiom: ownership stays as it is.
    - Otherwise → `_store(value, false)`.
  - **`onDestroy`:** `_store(null, false)` (releases; destroys if it was the last use of an auto instance), then notifies, as today.
  - **JSDoc.**
    - Both properties: replace the M0.2h/M0.2hr1 paragraphs with D-1/D-2 in plain words.
    - Quote Unity's alias sentence.
    - Drop "a copy passed to another filter is still destroyed when its owner swaps" — no longer true.
    - Correct the field comments.
- OUT: the codec and Instantiate (Phase 3). `MeshRenderer` is not edited. It reads `_effectiveMesh()`, and M0.2hr2's re-find logic stays.

**Edge cases:**
- **The same mesh in two filters**, one of which owns it: destroying the owner keeps it (uses 1). Destroying the second then destroys it (uses 0, auto).
- **Disown:** after `filter.sharedMesh = filter.mesh`:
  - the next `filter.mesh` clones again;
  - the disowned mesh is never auto-destroyed, even after the filter swaps it away.
- **Destroy-on-replace stays:** `a.mesh` then `a.sharedMesh = other` → the instance is destroyed.

**Done when:**
- [ ] DW-2.1: `const m = f.mesh` → `f.sharedMesh === m`, `m !== original`, and the original is not destroyed and keeps its vertices.
- [ ] DW-2.2: A second `f.mesh` returns the same object. A `Mesh.prototype.clone` spy is called exactly once.
- [ ] DW-2.3: Two filters share `a.mesh` (`b.sharedMesh = a.mesh`):
  - `a.gameObject.destroyImmediate()` → the instance still `exists()` and `b` still draws 24 vertices;
  - then destroy `b` → the instance no longer `exists()` (after `await Promise.resolve()` if destruction is deferred).
- [ ] DW-2.4: Disown → next read clones (spy count 2). The disowned mesh still `exists()` after the filter swaps to another mesh and after the filter is destroyed.
- [ ] DW-2.5 (`tests/StaticBatching.test.ts`): two cubes with one material.
  - On one, `const m = f.mesh;` with every vertex x scaled ×10.
  - `StaticBatchingUtility.combine([...])` → the combined mesh's bounds reach x = 5 (from the edited one) and not only 0.5.
  - Fails on `c4a0119`.
- [ ] DW-2.6: All tests in `tests/MeshFilterMesh.test.ts` green, unchanged lines. Report the count before and after.

### Phase 3: Serializer — live meshes for Instantiate, honest codec
**Skills:** code-foundations:cc-defensive-programming, code-foundations:aposd-verifying-correctness
**Model:** opus
**Gate:** Full
**Depends on:** Phase 2
**File scope:** WebEngineTS: src/engine/core/serialization/ValueSerializer.ts, src/engine/core/serialization/SceneSerializer.ts, src/engine/core/GameObject.ts, tests/Serialization.test.ts, tests/InstantiateGameObject.test.ts

**Goal:** D-3 and D-4.

**Scope:**
- IN:
  - **The two contexts.** `SerializeContext` and `DeserializeContext` (ValueSerializer.ts :22, :117) get an optional `/** @internal */ liveMeshes?: Mesh[]`.
  - **The `FieldType.Mesh` branch of `serialize`**, before the guid check: if `ctx?.liveMeshes`, push the value (reuse the index if it is already there) and return `{ $type: "LiveMesh", index }`.
  - **`deserialize` gets `case "LiveMesh"`:**
    - with `ctx.liveMeshes` → return `ctx.liveMeshes[index] ?? null`;
    - without → return `null` and `console.warn` once per process: "a LiveMesh reference outside Instantiate — ignored".
  - **The codec's stale/no-recipe case.**
    - When a mesh has no guid and `primitive` is null (which now includes stale recipes) → return `null`. This is unchanged.
    - **Add** one `console.warn` per mesh object (a module-level `WeakSet`), only when the mesh has geometry. It names the mesh and says it was edited or built in code and cannot be stored. Message text per research D-4.
  - **`SceneSerializer._cloneGameObject(go: GameObject): GameObject`** (`/** @internal */`):
    - creates `const live: Mesh[] = []`;
    - runs the same serialize → deserialize as `serializeGameObject` → `deserializeGameObject`, with `liveMeshes: live` in both contexts;
    - thread the table through the existing private context builders; add no public parameter.
  - **`GameObject._clone`** calls `SceneSerializer._cloneGameObject(this)` (same warning and comment above it).
- OUT:
  - Prefab paths (`Prefab.fromGameObject`, overrides, `_instantiatePrefab`) — unchanged, no table.
  - `serializeGameObject` / `serialize` / `deserializeGameObject` signatures — unchanged.
  - Material refs — D-7.

**Edge cases:**
- **One mesh used twice in a tree** (two filters) → one table entry, the same object in both copies.
- **`InstancedMeshRenderer.mesh`** follows the same path.
- **A mesh assigned in the copy goes through the `sharedMesh` setter** (`SceneSerializer._assign` always uses setters). The use count becomes 2 and the copy does not own it.
- **Instantiate of an object whose prefab link is kept** still goes through the same path as today. Only the mesh values change.

**Done when:**
- [ ] DW-3.1: Original with `m = f.mesh` edited (vertex 0 at x = 5) → `Instantiate(original)`:
  - the copy's `sharedMesh` is the same object `m`;
  - the copy's renderer geometry has x = 5 at vertex 0.
  - Fails on `c4a0119`.
- [ ] DW-3.2: Destroy the original after Instantiate → the copy's mesh `exists()` and the copy draws 24 vertices. Then the copy's own `f.mesh` read → a new object; the original instance is untouched.
- [ ] DW-3.3:
  - an unedited `Mesh.createCube()` assigned through `sharedMesh` is shared by the copy (`toBe`);
  - an asset mesh is still `toBe` the AssetDatabase object (`tests/ModelSubAssets.test.ts` green unchanged).
- [ ] DW-3.4: The no-leak checks:
  - `JSON.stringify(SceneSerializer.serializeGameObject(go))` for a `go` holding an edited instance contains no `"LiveMesh"`;
  - the same for `Prefab.fromGameObject(go)`'s snapshot;
  - `deserializeGameObject` of hand-written JSON with `{ $type: "LiveMesh", index: 0 }` → the field is `null`, one warning (spy).
- [ ] DW-3.5: An edited primitive in a filter, saved twice:
  - `fields.sharedMesh` is `null` both times;
  - `console.warn` was called exactly once for that mesh, and the message names it;
  - an unedited clone of a cube still saves as `PrimitiveMesh` (`:2056` green).
- [ ] DW-3.6: New pin next to `:2063`: with `const inst = f.mesh` taken, `serializeGameObject(go)`:
  - does not call `Mesh.prototype.clone` (spy);
  - `(f as any)._meshInstance === inst` afterwards.
  - `:2063` itself unchanged and green.
- [ ] DW-3.7: The same mesh in two filters of one tree → the copy's two filters share one object. `InstancedMeshRenderer.mesh` survives Instantiate by identity (one test each, in `tests/InstantiateGameObject.test.ts`).
- [ ] DW-3.8: `npm run typecheck`, `npm test` (whole suite, count before/after), `npm run build` green.

### Phase 4: Adversarial review
**Skills:** code-foundations:aposd-verifying-correctness
**Model:** opus
**Gate:** Review
**Depends on:** Phase 3
**File scope:** .claude-shared: code-foundations/M0.2hr4/review.md

**Goal:** try to break D-2 and D-3. The reviewer is the `review`/verifier agent, read-only on code.

**Scope:**
- IN: trace and, where possible, prove with throwaway tests outside the repo:
  - double destroy or use-count drift across `destroy` / `destroyImmediate` / scene unload / `Application.dispose()` / `mesh.destroy()` called by user code on a shared instance;
  - a use count left > 0 by a filter that never ran `onDestroy` (scene teardown order);
  - `LiveMesh` reaching any persisted path (grep every `serialize*` entry point);
  - warning spam (once per mesh, also across Instantiate loops);
  - the M0.2hr2 re-find with the alias;
  - the editor reading `sharedMesh` via `getAllFields`.
- OUT: style.

**Done when:**
- [ ] DW-4.1: `review.md` lists each traced path with a verdict. Each confirmed defect has a failing test that the Phase 2/3 code then fixes. Fixes are made in this task, before Report.

### Phase 5: Docs and notes
**Skills:** code-foundations:code-clarity-and-docs
**Model:** haiku
**Gate:** Minimal
**Depends on:** Phase 4
**File scope:** WebEngineTS: CHANGELOG.md, src/engine/core/reflection/Types.ts; .claude-shared: code-foundations/M0.2hr4/notes.md, code-foundations/M0.2hr4/report.md

**Goal:** the record matches the code.

**Scope:**
- IN:
  - **CHANGELOG, *Fixed*:** getter edits survive batching, Instantiate and prefab snapshots.
  - **CHANGELOG, *Changed*:**
    - `sharedMesh` is an alias of the instance after `mesh` is read (Unity);
    - Instantiate shares meshes by identity, including primitives;
    - an edited primitive saves empty with a warning instead of as its unedited recipe;
    - a shared instance is freed only when its last MeshFilter lets go.
  - **`Types.ts` `FieldType.Mesh` doc:** add "a mesh edited after its factory built it has no recipe any more" and "Instantiate passes meshes by identity".
  - **Notes and report** per RULES "Report".
- OUT: ROADMAP. The row is updated by the protocol at Report.

**Done when:**
- [ ] DW-5.1: The CHANGELOG entry names every behaviour change above. `npm run typecheck` green after the doc edit.
- [ ] DW-5.2: `report.md` lists every DW with its evidence and the final test count.
