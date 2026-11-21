# Research: M0.2hr4 — an edit made through `MeshFilter.mesh` must survive batching, Instantiate and save

One-line: after M0.2h the renderer draws the per-object copy made by the `mesh` getter, but every
other reader still sees the original `sharedMesh`, so the edit reverts when the object is batched,
cloned or saved. This document fixes the facts and makes the decisions; `plan.md` builds them.

**Date:** 2026-11-21 · **Status:** confirmed (decisions delegated to Claude by the owner,
2026-11-10; each is recorded with its evidence) · **Base:** WebEngineTS `master` `c4a0119`
(after M0.2hr1 `b5e9d2c`, M0.2hr2 `07f81d6`, M0.2hr5 `c4a0119`) · **Still open:** nothing that
blocks the build. Two side findings are filed as their own rows (see the end).

## 1. Facts: the engine at `c4a0119`

All paths are relative to `WebEngineTS/`.

### MeshFilter (`src/engine/core/rendering/MeshFilter.ts`)
- Two fields, and no separate ownership flag:
  - `_sharedMesh` (:15-16, "a reference, never copied");
  - `_meshInstance` (:18-19, "made on the first read of `mesh`").
- `sharedMesh` (:37-53) is the **only** `@SerializedField({ type: FieldType.Mesh })` on the class.
  - Setter (M0.2hr1): if `value === _meshInstance`, it stores the value as shared and sets `_meshInstance = null` ("self-assign = disown, keep alive").
  - Otherwise it calls `_destroyInstance()` and then stores the value.
- `mesh` getter (:67-83): returns `_meshInstance` if there is one. Otherwise it clones `_sharedMesh` into `_meshInstance` and notifies the renderer. **`_sharedMesh` keeps pointing at the original.**
- `mesh` setter (:85-96):
  - self-assign keeps the instance;
  - otherwise it destroys the instance and stores the value as `_sharedMesh`, not owned.
- `_effectiveMesh()` (:112-114) is `_meshInstance ?? _sharedMesh`. Its only caller is `MeshRenderer._syncGeometry` (`MeshRenderer.ts:206`).
- `onDestroy` (:145-152, M0.2hr2): destroys the instance, nulls the shared mesh, and notifies the renderer.

### The readers that still see the original
| Reader | Code | What happens to an edit made through the getter |
|---|---|---|
| Static batching | `StaticBatchingUtility.ts:67` `const mesh = filter.sharedMesh;` | The batch is built from the original, and the source renderer is disabled (:113-115). **Measured in the M0.2h review:** drawn x = −5, batch x = −0.5. |
| Save | `SceneSerializer._serializeComponents` (:1832-1833) runs a reflection loop over the `@SerializedField`s. For MeshFilter that is only `sharedMesh`. | The original is written. |
| Instantiate | `GameObject._clone` (`GameObject.ts:1297-1313`) = `deserializeGameObject(serializeGameObject(this))` | The copy holds whatever the codec rebuilds from the original. The copy's `_meshInstance` is always null. **Measured:** clone x = −0.5. |
| Prefab snapshot, overrides | `Prefab.fromGameObject`, `getOverrides`, `applyInstance` all go through the same reflection loop (`SceneSerializer._serializeForPrefab` :477-494) | The edit is invisible. |

### The mesh codec (`src/engine/core/serialization/ValueSerializer.ts:323-336`, read back at :508-532)
- **Asset mesh:** a mesh with an AssetDatabase guid (`AssetDatabase.guidOf`, a WeakMap keyed by object identity) is written as `{ $type: "AssetRef", guid }`. On load it resolves to **the same object**.
- **Primitive:** a mesh with a recipe (`Mesh._primitive`, set by the `create*` factories) is written as `{ $type: "PrimitiveMesh", kind, args }`. On load, `Mesh.fromPrimitive` builds **a new mesh**.
- **Anything else:** written as `null`, which drops it. That is a deliberate contract: "Vertex buffers are never written into a scene: a procedural mesh with neither is dropped, which is visible immediately rather than bloating every save." The `FieldType.Mesh` doc (`src/engine/core/reflection/Types.ts:40-45`) states the same contract.
- **`Mesh.clone()`** (`src/engine/core/graphics/Mesh.ts:1328-1361`) keeps `_primitive` ("A clone of a cube is still a cube"). It loses the guid, because the clone is a new WeakMap key.
- **Edits never clear the recipe.** No code sets `_primitive = null`, and the setters only call `_markDirty()`. An **edited cube is therefore saved as an unedited cube**. A clone of an asset mesh is saved as `null`.
- **Every geometry write goes through `_markDirty()`** (`Mesh.ts:213-216`):
  - `set vertices`, `set normals`, `set tangents`, `set uv`…`uv4`, `set colors`, `set triangles`, `set indexFormat`;
  - `setSubMesh` (:420-432);
  - `recalculateNormals` (:478), the tangent recalculation (:568), `clear()` (:618).
- **Factories set `_primitive` after building the geometry** (e.g. `createCube` :800, `createSphere` :869). A "write while a recipe is set" therefore means exactly "edited after creation".
- **Bounds-only changes** (`set bounds`, `recalculateBounds`) use the notify-only path added by M0.2hr2 and do not call `_markDirty`.

### The pins and tests on this ground
- `tests/Serialization.test.ts:2063-2074`, "saving does not turn a shared mesh into an instance". Saving must never read the `mesh` getter. It checks `(filter as any)._meshInstance` is null. It does **not** cover a filter that already holds an instance.
- Serialization tests :1976-2056 pin the codec:
  - recipe round-trip;
  - the rebuilt mesh is a *new* object (`not.toBe(original)`);
  - each primitive kind;
  - "a mesh with no recipe and no identity is dropped" (:2024);
  - an asset round-trips by id;
  - `primitive` is null for a mesh nothing built (:2051);
  - "a clone keeps the recipe" (:2056).
- `tests/MeshFilterMesh.test.ts`: the M0.2h, M0.2hr1 and M0.2hr2 behaviour. **Nothing covers save, batching or Instantiate.**
- `tests/StaticBatching.test.ts` and `tests/InstantiateGameObject.test.ts` never use the `mesh` getter.
- `tests/ModelSubAssets.test.ts:197` "a copy made through a prefab shares the model's parts" (`meshOf(copy) toBe meshOf(root)`).
- `InstancedMeshRenderer.mesh` (`InstancedMeshRenderer.ts:104-120`) uses the same `FieldType.Mesh` codec.

## 2. Unity, quoted (docs.unity.com, Scripting API, fetched 2026-11-21)

- **`MeshFilter.mesh`** (https://docs.unity.com/en-us/engine/current/script-reference/unityengine/meshfilter/mesh):
  - "If a mesh is assigned to the mesh filter already, then the first query of `mesh` property will create a duplicate of it, and this copy will be returned. Further queries of `mesh` property will return this duplicated mesh instance. **Once `mesh` property is queried, link to the original shared mesh is lost and MeshFilter.sharedMesh property becomes an alias to `mesh`.**"
  - "Consider `mesh` property as a shortcut for the following code: `Mesh mesh = GetComponent<MeshFilter>().sharedMesh; Mesh mesh2 = Instantiate(mesh); GetComponent<MeshFilter>().sharedMesh = mesh2;`"
  - "It is your responsibility to destroy the automatically instantiated mesh when the game object is being destroyed."
- **`MeshFilter.sharedMesh`**: "Returns the shared mesh of the mesh filter. It is recommended to use this function only for reading mesh data and not for writing…"
- **`Renderer.material`**, the same pattern: "If the material is used by any other renderers, this will clone the shared material and start using it from now on… It is your responsibility to destroy the materials when the game object is being destroyed."
- **`Object.Instantiate`**: "When you clone a GameObject or Component, Unity also clones all of its child objects and components, and sets their properties to match the original." The page does not say how a reference to a mesh is copied. It is general Unity behaviour (INFERRED, not quoted) that a clone's MeshFilter references **the same** Mesh object, and that the clone's own `mesh` getter then makes its own copy.

## 3. Decisions (binding for the plan)

**D-1 — Unity parity: `sharedMesh` becomes an alias of the instance.**
- The first read of `mesh` clones `sharedMesh` and **stores the clone as the shared mesh**. From then on `sharedMesh === mesh` (one storage slot, `_sharedMesh`). A per-filter flag `_ownsShared` records that this filter's getter made it.
- Every reader that already uses `sharedMesh` (batching, save, prefab snapshots) now sees the edited mesh, with no change to those readers.
- `_effectiveMesh()` stays as the renderer's entry point and now returns `_sharedMesh`.
- The private `_meshInstance` stays as a **getter**: `_ownsShared ? _sharedMesh : null`. The existing test probes (`Serialization.test.ts:2072`) keep meaning "the instance this filter owns".
- Evidence: the Unity quote in §2 (alias, and the shortcut code).
- Rejected alternative: teach every reader to call `_effectiveMesh()`. That leaves `sharedMesh` lying, which differs from Unity. Every future reader (the editor inspector, which reads `getAllFields`) would have to know the trick.

**D-2 — Lifetime: the engine still frees an instance its getter made, but only once no MeshFilter uses it.**
- Unity leaves this to the user. The engine has auto-destroyed since M0.2h (a recorded deviation against GPU leaks), and that stays. But M0.2hr1 had to document "a copy passed to another filter is still destroyed when its owner swaps", and D-3 makes sharing normal.
- So `Mesh` carries a **filter use count** (`_filterUses`) and a flag `_autoDestroy`. The flag is set only on a mesh made by a MeshFilter getter.
- MeshFilter retains the mesh it stores and releases the one it drops: in both setters, in the getter (the swap from original to copy) and in `onDestroy`. A release that brings an `_autoDestroy` mesh to 0 destroys it.
- Meshes not made by a getter (assets, factory meshes the user assigned) are never destroyed by a filter, as today.
- **Disown stays (M0.2hr1 contract):** `filter.sharedMesh = filter.mesh` sets `_ownsShared = false` **and** clears the mesh's `_autoDestroy`. The user has taken it over, and the engine never destroys it. The next read of `mesh` clones again.
- **`mesh = m` (setter) is unchanged (M0.2h):** it stores the reference, not owned, and the next read clones. This matches Unity's "if a mesh is assigned already, the first query creates a duplicate".

**D-3 — `Instantiate` passes meshes by identity (Unity parity), only on the in-memory clone path.**
- `GameObject._clone` goes through an internal SceneSerializer clone entry point that serializes and deserializes with a **live mesh table**:
  - every `FieldType.Mesh` value is written as `{ $type: "LiveMesh", index }` into that table;
  - on the way back it is read as the very same object.
- The copy's MeshFilter therefore shares the original's mesh. That is the edited instance, an unedited primitive or an asset alike. The setter retains it, so the use count is 2. The copy does not own it (`_ownsShared = false`), so its own `mesh` read makes its own copy.
- Destroying the original then leaves the copy drawing (D-2).
- `InstancedMeshRenderer.mesh` rides the same path.
- `LiveMesh` **never reaches a file or a prefab**:
  - `serializeGameObject`, `serialize` and the prefab snapshot paths have no table, so they never emit it;
  - reading a `LiveMesh` without a table gives `null` plus one warning.
- **Behaviour change (CHANGELOG, Changed):** a copy made by `Instantiate` now shares the original's mesh object, including a primitive one. Today a primitive is rebuilt per copy. This is Unity parity and saves memory.
- Prefab instantiation is unchanged: it reads a persisted snapshot.

**D-4 — An edited primitive no longer saves as its recipe.**
- `Mesh` gets `_recipeStale`, set inside `_markDirty()` when `_primitive !== null`. The public `primitive` getter returns `null` once the recipe is stale, because the recipe no longer builds this geometry.
- `clone()` copies both `_primitive` and `_recipeStale`. "A clone keeps the recipe" (:2056) stays true for an unedited clone.
- Bounds-only changes do not make the recipe stale: they rebuild nothing.
- The codec is then honest: an edited primitive has no guid and no valid recipe, so it is written as `null`, like any other mesh that cannot be stored. It also logs **one warning per mesh**:
  > `Mesh "<name>" was edited after it was built, so the scene cannot store it — it is saved empty. Keep the edit in code (rebuild it on Awake) or ship the mesh as an asset.`
- **No vertex inlining.** The `FieldType.Mesh` contract ("vertex buffers are never written into a scene") stays.
- Unity would inline the mesh into a scene file. This engine deliberately does not: scenario ZIPs stay small, and the editor never edits meshes. Scripts only edit them at runtime, where D-3 covers Instantiate.
- Impact on content: none known. Edit-mode scripts do not run (C2 gate), and no editor command writes mesh data.
- **Behaviour change (CHANGELOG, Changed):** an edited primitive now saves as empty with a warning, where before it was silently reverted.

**D-5 — Static batching needs no code change.** After D-1, `combine` reads `sharedMesh`, which is the edited instance. A test pins it.

**D-6 — The pins.**
- `Serialization.test.ts:2063` stays byte-for-byte (saving never reads the getter).
- New pin: saving a filter that already holds an instance makes no second clone and leaves the owned instance as it is.
- M0.2h, M0.2hr1 and M0.2hr2 tests stay green **unchanged**. A test that genuinely asserts the old split (`sharedMesh` still the original after a getter read) is wrong under D-1. It is changed in its own commit, with the Unity quote as the reason.
- The plan lists any such test before Phase 2 starts (DW-2.0).

**D-7 — Out of scope.**
- `Renderer.material`/`sharedMaterial`: same pattern, separate component.
- The output of `Mesh.combine` saving as `null`: runtime batching is not saved.
- M0.2hr3 (eager rebuild).
- Editor UI.

## 4. Side findings, filed as their own rows (2026-11-21)

- **`Behaviour.enabled` is never serialized.**
  - The serializer has no `enabled` anywhere (`grep -n enabled src/engine/core/serialization/` finds nothing). `Behaviour._enabled` (`Behaviour.ts:33`) has no `@SerializedField`.
  - So a component switched off in a scene or a prefab comes back on after save/load **and after `Instantiate`**. That includes the source renderers that `StaticBatchingUtility.combine` disables.
  - Unity serializes `m_Enabled` per Behaviour.
  - It is a format change, so it is filed as a 🧠 row (SER1).
