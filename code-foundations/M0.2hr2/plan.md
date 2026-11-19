# M0.2hr2 plan — stale-renderer holes: destroyed filter + silent bounds

Branch `M0.2hr2-stale-renderer-holes` (WebEngineTS + .claude-shared). Model: build (sonnet-class), gates review. Research: `research.md`. Closes M0.2h report limitation #2.

## Phase 1 — tests first (RED)
File scope: `tests/MeshFilterMesh.test.ts` (WebEngineTS; existing 23 tests untouched; helpers `drawn()`, `posCount`, `geoOf`, `CUBE_V=24`, `track()`).
Add 4 tests (additive):
1. T1: destroy the MeshFilter (`destroyImmediate()`) → renderer draws 0 vertices (`posCount(renderer) === 0`).
2. T2: after destroy, `go.addComponent(MeshFilter).sharedMesh = Mesh.createSphere()` → drawn vertex count === `sphere.vertexCount` (561 default: 33×17).
3. T3: mutate position x coords ×10 via the live vertices getter, then `mesh.recalculateBounds()` → `renderer.localBounds.max.x === 5` (cube half-extent 0.5 ×10).
4. T4: `mesh.bounds = new Bounds(...)` setter → `renderer.localBounds` reflects the assigned box.
Gate: Standard. DW: the 4 new tests FAIL on pre-fix source (`npx vitest run tests/MeshFilterMesh.test.ts`, capture failing list); existing 23 PASS; `npm run typecheck` 0 errors.
NOTE: a parallel executor writes these tests in the engine worktree — the docs task does not touch engine source or tests.

## Phase 2 — fix + docs
File scope: `src/engine/core/rendering/MeshRenderer.ts`, `src/engine/core/rendering/MeshFilter.ts`, `src/engine/core/graphics/Mesh.ts`, `CHANGELOG.md` (WebEngineTS).
- `MeshRenderer.updateMesh()` (:178): re-find guard → `if (this._meshFilter === null || !this._meshFilter.exists())`.
- `MeshFilter.onDestroy()` (:145-150): `this._notifyRenderer()` after nulling meshes (`_destroyInstance()` + `_sharedMesh = null`), **before** `super.onDestroy()` — during `onDestroy` the filter is still attached and `exists()` true, so the notify re-syncs the OLD filter whose meshes are null → renderer undraws (safe, see research).
- `Mesh.ts`: extract the observer-notify loop from `_markDirty` (:213-217) into a notify-only private path that does **NOT** set `_needsUpdate` (no geometry rebuild — `_internalGeometry` rebuilds only when `_needsUpdate`); call it from `set bounds` (:348) and both `recalculateBounds()` exits (:567 early return, :586 normal). `_markDirty` reuses the loop.
- Rewrite `updateMesh()` JSDoc (:162-173): describe re-find-on-destroy semantics; drop the stale "manual call after shared-mesh edit" remark (observer wiring syncs those).
- Document the known limitation: `mesh.bounds` getter returns a live reference; in-place mutation bypasses the setter — `recalculateBounds()` or re-assign is the supported path (Unity parity). JSDoc + CHANGELOG entry.
Gate: Standard. DW: file tests green (27/27), `npm run typecheck` 0 errors, full `npm test` green (3022 existing + 4 new = 3026, 185 files), `npm run build` ok.

## Phase 3 — report + ROADMAP (Minimal)
File scope: .claude-shared: ROADMAP.md (M0.2hr2 row → ✅ 2026-11-19 W3 + what landed), code-foundations/M0.2hr2/{research,plan,notes,report}.md.
Gate: Minimal. Junk check both repos; push both branches.

## Review + merge
Adversarial review of phases 1-2 (review agent) with **independent RED re-execution**: stash the fix, re-run the 4 new tests, confirm they fail, restore the fix, confirm green. Full Debug gate (typecheck + test + build) on the synced branch.
Merge engine first (WebEngineTS), then .claude-shared, via `wk.sh merge-push` under `merge.lock`; ROADMAP row updated at merge. Post-merge: full gates + `graphify update` in the primary repos; delete both branches + `claims/M0.2hr2`.

## Risks
- Notify during destroy re-syncs the OLD filter (still attached, `exists()` true until `finally`): safe — meshes already nulled → `_syncGeometry` null branch undraws. Replacement found later via `!exists()`.
- Notify-only path must NOT set `_needsUpdate`: setting it would force a needless geometry rebuild on every bounds write.
- Getter in-place mutation remains unsupported (documented, Unity parity) — not fixed in this task.
- Zero-delay `destroy()` drains in a microtask (EngineObject.ts:407-408): tests using it need `await Promise.resolve()`; T1/T2 use `destroyImmediate()` to stay synchronous.
