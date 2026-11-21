# M0.2hr4 — build notes (phases 1–3, W3)

Branch: `M0.2hr4-mesh-alias-instantiate` (base `c4a0119` == origin/master).
Discipline: code + tests only. No builds, no test runs, no typecheck — all
verification below is static trace, grep and git evidence. DW-1.6 / DW-2.6 /
DW-3.8 and the whole gate suite are the verifier's window.

## Commits (engine, pushed to https://github.com/HuGoxDP/WebEngineTS.git)

| Phase | SHA | Subject |
|---|---|---|
| 1 | `a921920` | Stale a mesh recipe on any geometry write and count MeshFilter uses |
| 2 | `15788f5` | Alias sharedMesh to the mesh instance and free it on its last filter use |
| 3 | `8034e67` | Pass meshes by identity through Instantiate and warn when a mesh cannot be saved |
| 3 fix | `e494ea1` | Pin the shared instance's release in the Instantiate lifetime test |

Push evidence: `c4a0119..a921920`, `a921920..15788f5`, `15788f5..8034e67`,
`8034e67..e494ea1`, each → `M0.2hr4-mesh-alias-instantiate`.

## Phase 1 — Mesh.ts (DW-1.1 … DW-1.5)

- `_recipeStale` private flag, set in `_markDirty()` when `_primitive !== null`.
  Every geometry writer goes through `_markDirty` (14 writers pinned via
  `test.each`, incl. `clear` and `recalculateTangents`). Bounds paths
  (`set bounds`, `recalculateBounds`) use `_notifyObservers` only — never stale.
- `primitive` getter returns null when stale; JSDoc updated. Factories set
  `_primitive` after writing geometry, so factory meshes are not stale.
- `clone()` copies `_primitive` AND `_recipeStale` — unedited clone keeps its
  recipe (`:2056` pin green by construction), edited clone stays edited.
- New `@internal` members: `_filterUses`, `_autoDestroy`, `_retainByFilter()`,
  `_releaseByFilter()`. Release at count 0 logs one `console.error`
  (`[Mesh] Release of "<name>" with no filter use — count stays 0`), stays 0,
  returns false. `_releaseByFilter()` true iff count hits 0 AND `_autoDestroy`.
- `subMeshCount` setter does not `_markDirty` — not a DW-1.1 writer, untouched.
- Tests: new `tests/MeshRecipeStale.test.ts`, 30 test cases (14 `test.each`
  writers + 6 `test.each` factories + 2 bounds-path + 4 clone + 4 use-count).
  DW-1.6 = the untouched Serialization pins (`:1976-2074`), all read
  `.primitive` only on unedited meshes.

## Phase 2 — MeshFilter.ts (DW-2.0 … DW-2.6)

DW-2.0 scan: no existing test asserts the old split. Only `_meshInstance` probe
in the whole tree: `tests/Serialization.test.ts:2072` — kept working via the
private getter `this._ownsShared ? this._sharedMesh : null`.

- D-1 one slot: `_sharedMesh` + `_ownsShared`. First `mesh` read clones, sets
  `clone._autoDestroy = true`, stores the clone AS the shared mesh (`_store(c,
  true)`), so renderer/batching/save/Instantiate all see the edit with no change
  of their own. `_effectiveMesh()` returns the slot. JSDoc carries the Unity
  alias quote.
- D-2 `_store(value, owned)`: if value differs, retain new / release old;
  destroy old iff release returned true. Sets slot + owned, notifies once.
  `mesh` self-assign: no-op, ownership stays. `sharedMesh` self-assign while
  owned: disown — clears `_ownsShared` AND `value._autoDestroy` (M0.2hr1
  contract); next `mesh` read clones again. `onDestroy` → `_store(null, false)`
  (its notify covers the undraw). No "create when empty" branch.
- `_destroyInstance` removed; `hasMesh()` simplified to the slot.
- MeshRenderer NOT edited: `_syncGeometry` swaps observers on mesh change and
  reads `_internalGeometry`, so the alias flows through; M0.2hr2 re-find stays.
- StaticBatchingUtility NOT edited (D-5): `combine` reads `filter.sharedMesh`
  (:67), which is now the alias.
- Tests: `tests/MeshFilterMesh.test.ts` 27 → 31 (DW-2.1…2.4, new describe with
  its own `afterEach` restoring mock spies; existing lines unchanged, only `vi`
  added to the vitest import). `tests/StaticBatching.test.ts` +1 (DW-2.5, now 7).
- DW-2.5 failing-first on c4a0119: old getter left `_sharedMesh` = original;
  combine baked the unedited cube → bounds.max.x = 0.5, test demands ≈5 → fails
  by construction. New code: alias = edited instance → combined bounds max x = 5
  (`Mesh.combine` → `_fromThreeGeometry` → `recalculateBounds`, verified).
- All 27 pre-existing MeshFilterMesh tests statically traced green under
  D-1/D-2, incl. the two second-filter tests (:352/:371 old numbering) — disown
  clears `_autoDestroy`, so a disowned mesh is never auto-freed.

## Phase 3 — codec + Instantiate (DW-3.1 … DW-3.7)

- `SerializeContext`/`DeserializeContext`: optional `@internal liveMeshes?: Mesh[]`.
- `FieldType.Mesh` serialize: LiveMesh branch FIRST (before guid/recipe), one
  entry per object (`indexOf` reuse) → `{ $type: "LiveMesh", index }`.
  No-table stale/no-recipe path unchanged (null) + one `console.warn` per mesh
  object via module `WeakSet`, only when `vertexCount > 0`. Exact D-4 text:
  `Mesh "<name>" was edited after it was built, so the scene cannot store it — it is saved empty. Keep the edit in code (rebuild it on Awake) or ship the mesh as an asset.`
- `case "LiveMesh"` deserialize: with table → `table[index] ?? null`; without →
  null + once-per-process warn `a LiveMesh reference outside Instantiate — ignored`
  (module flag).
- `SceneSerializer._cloneGameObject(go)` (`@internal`): local `Mesh[]`,
  `_buildSerializeCtx([go], false, null, { liveMeshes })` → `_serializeGO` →
  `_deserializeTree(json, go.scene, [], null, undefined, live)`. Table threaded
  via optional trailing params on `_buildSerializeCtx` options, `_deserializeTree`,
  `_newContext` — no public signature changed. Prefab paths get no table.
- `GameObject._clone` calls it; the unserializable-types warning and the
  prefab-vs-serializer comment kept verbatim (one sentence added).
- `import type { Mesh }` added to SceneSerializer — type-only, no new cycle.
- Tests: `tests/InstantiateGameObject.test.ts` 11 → 17 (DW-3.1, 3.2 + lifetime
  pin, 3.3, 3.7 ×2). File still imports GameObject WITHOUT Prefab — the new
  imports (MeshRenderer, InstancedMeshRenderer, Mesh, StandardMaterial,
  AssetDatabase) were each checked Prefab-free, hook-side guard intact.
  `tests/Serialization.test.ts` 155 → 158 (DW-3.4, 3.5, 3.6 added AFTER the
  `:2063` pin; `:1976-2074` byte-for-byte unchanged, verified by diff — zero
  removed lines in both test files across all phase-3 commits).
- DW-3.1 failing-first on c4a0119: `_clone` round-tripped through
  serializeGameObject, which wrote the ORIGINAL's `PrimitiveMesh` recipe (the
  instance lived in `_meshInstance`, invisible to the codec); the copy was a
  fresh cube — different object, vertex 0 x = −0.5 vs demanded 5 → fails by
  construction.

### DW-3.2 wording deviation (recorded, not a STOP)

Plan wording "the original instance is untouched" after the copy's own `mesh`
read cannot hold literally under binding D-2: that read releases the shared
instance to 0 uses and (being getter-made, `_autoDestroy`) it is destroyed —
deferred like every destroy. Reading data off it afterwards would race the
destroy microtask. Resolution per D-2 (the binding decision): the survivor test
asserts `m.exists()` + 24 vertices after the original's death (uses 2→1), then
that the copy's read yields a new object carrying the edit (x = 5); a separate
test pins the D-2 end-state explicitly — after the copy takes its own, the
shared instance is freed (`exists()` false after one microtask). No behaviour
guessed; both halves are straight consequences of D-1/D-2/D-3.

### Known benign interactions (static trace)

- `Mesh.destroy()` → `clear()` → `_markDirty` marks a destroyed primitive
  stale — harmless, nothing reads its recipe afterwards.
- Serialization.test.ts `:2024` handmade mesh has 0 vertices → dropped silently,
  no new warn; `:2051` primitive getter test never serializes.
- ValueRoundTrip / SerializationAudioEffects / ModelSubAssets serialize only
  unedited primitives or bound assets → recipe/AssetRef paths unchanged.
- Warn-once flags are module-level (per process). Vitest isolates per file by
  default; within Serialization.test.ts only DW-3.4 exercises the LiveMesh
  flag and DW-3.5 uses a fresh mesh object per test (WeakSet).
- The 11 pre-existing Instantiate tests use mesh-less filters → codec returns
  null before the table branch is observable; no new warns (`"and says nothing
  when it copied everything"` pin safe).

## Verification performed (no builds/tests — coder discipline)

- Static trace of every DW item against the new code, incl. failing-first
  proofs for DW-2.5 and DW-3.1 on c4a0119.
- `git diff` hygiene per phase: scope files only; zero removed lines in edited
  test files; `:1976-2074` pins untouched (sed-verified after edit).
- Grep sweeps: only `_meshInstance` probe is Serialization:2072; no other test
  serializes edited/handmade meshes with geometry; no Prefab import in any new
  InstantiateGameObject.test.ts dependency; `noUnusedLocals` absent from
  tsconfig (private `_meshInstance` getter probed via `as any` is fine).
- Test counts (cases, `test.each` expanded): MeshRecipeStale 30 new;
  MeshFilterMesh 27→31; StaticBatching 6→7; InstantiateGameObject 11→17;
  Serialization 155→158. Suite total: +44 new test cases across 5 files
  (whole-suite before/after count is DW-3.8, verifier).

## STOPs

None. One recorded wording deviation (DW-3.2 above), resolved by the binding
D-2 rather than by guessing.