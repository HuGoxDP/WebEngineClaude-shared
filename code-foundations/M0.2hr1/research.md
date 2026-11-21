# M0.2hr1 research — MeshFilter self-assign destroys the assigned mesh

Date 2026-11-19, W3. Source: ROADMAP row (Claude review of M0.2h). Engine at origin/master 79a6faf (sync checks green: typecheck 0, vitest 3017/3017 in 185 files, build ok).

## Bug (confirmed in source)
`src/engine/core/rendering/MeshFilter.ts` (note: `rendering/`, ROADMAP says `core/`):
- `set sharedMesh` (:38-42) and `set mesh` (:71-77) call `_destroyInstance()` BEFORE storing `value`. When `value === this._meshInstance` (the Unity edit idiom `const m = filter.mesh; m.vertices = v; filter.mesh = m;`, or `filter.sharedMesh = filter.mesh`), `Mesh.destroy()` clears the very mesh being stored.
- `Mesh.destroy()` (Mesh.ts:1356-1360) calls `clear()` which wipes vertices synchronously and `_markDirty()` notifies observers → renderer re-syncs to empty geometry (measured 24 → 0 drawn vertices); `exists()` flips false in a microtask (EngineObject.ts:407-408) — tests need `await Promise.resolve()`.
- Cross-filter hazard: a second filter holding the copy as `_sharedMesh` observes it (`_addObserver`); the owner's swap destroys it under the second filter too.
- Renderer chain: `_notifyRenderer()` → static `_findRenderer` hook → `MeshRenderer.updateMesh()` → `_syncGeometry()` reads `_effectiveMesh()` = `_meshInstance ?? _sharedMesh` (MeshFilter.ts:93-95).

## Unity semantics (web evidence)
- https://docs.unity3d.com/6000.0/Documentation/ScriptReference/MeshFilter-mesh.html — the getter is `Instantiate(sharedMesh)` + `sharedMesh =` store; NO documented destruction on assignment; destroying the instantiated copy is the user's responsibility. So self-assign in Unity is a plain reference store — the guard is Unity-consistent.
- https://docs.unity3d.com/6000.0/Documentation/ScriptReference/MeshFilter-sharedMesh.html — shared mesh is a reference, read-only recommendation.
- The engine's "swap destroys the owned instance" convenience (M0.2h D1/D3) stays, but must not fire when the incoming value IS that instance.

## Constraints to preserve (M0.2h plan D2)
- `sharedMesh` getter returns `_sharedMesh` only — StaticBatching + serialization no-instantiation pin (tests/Serialization.test.ts:2063-2074) depend on it.
- `_effectiveMesh()` unchanged. Existing 18 tests in tests/MeshFilterMesh.test.ts must stay green (swap-destroys-instance tests :253, :266, :284 use DIFFERENT meshes — unaffected by the guard).

## Decisions (recorded)
- D1: `set mesh`: if `value !== null && value === this._meshInstance` → skip destroy, keep `_meshInstance` (getter returns it, no re-clone), `_notifyRenderer()`. Otherwise current behavior.
- D2: `set sharedMesh`: if `value !== null && value === this._meshInstance` → store as `_sharedMesh`, null `_meshInstance` WITHOUT destroy (ownership relinquished; Unity never auto-destroys an assigned mesh), `_notifyRenderer()`. Otherwise current behavior. After this form `filter.mesh` would re-clone on next read (getter semantics unchanged) — tests assert `filter.sharedMesh === inst` for this form, `filter.mesh === inst` for the `mesh =` form.
- D3: JSDoc on both setters documents what a swap still destroys (the owned instance when replaced by a DIFFERENT mesh or null) and the self-assign exception. CHANGELOG.md:89 sentence "Shared meshes are never destroyed by a swap." corrected to state the self-assign case explicitly.
- D4: tests additive in tests/MeshFilterMesh.test.ts (vitest; drawn-vertex helper posCount, CUBE_V=24): both self-assign forms keep 24 drawn vertices; mesh exists() after `await Promise.resolve()`; identity assertions per D2; cross-filter case (second filter's sharedMesh survives owner swap to a different mesh? NO — owner swap to a different mesh still destroys the instance, that is existing pinned behavior :253; the cross-filter case that must now survive is the owner's SELF-assign). Also null-assign still destroys (existing tests pin).
- No serializer/lifecycle/format change → Standard gate (row is a ½ h setter guard + docs + tests).

## In-flight overlap
Only master exists on origin (ls-remote); no in-flight branches touch MeshFilter/MeshRenderer/Mesh.
