# M0.2hr2 research — two stale-renderer holes (destroyed filter, silent bounds)

Date 2026-11-19, W3. Source: ROADMAP row M0.2hr2 (M1, ½ d; Claude review of M0.2h).
Closes limitation #2 of the M0.2h report (`code-foundations/M0.2h/report.md`,
"Known limitations" list: "`removeComponent(filter)` leaves the renderer drawing
the last geometry until the renderer dies; Unity would undraw").
Engine worktree HEAD `b5e9d2c` (merge of M0.2hr1; 3022 tests in 185 files at claim time).
All line numbers below verified against that HEAD.

## Hole 1 — a destroyed MeshFilter keeps being drawn / a replacement is never found

`src/engine/core/rendering/MeshRenderer.ts`:
- `updateMesh()` (:174) caches the sibling filter: the re-find guard at :178 is
  `if (this._meshFilter === null)` — a **destroyed but non-null** reference never
  triggers a re-find. After `filter.destroyImmediate(); go.addComponent(MeshFilter).sharedMesh = sphere`
  the renderer keeps syncing from the dead filter (`_effectiveMesh()` → null) and
  draws 0 vertices for good, even after a manual `updateMesh()`.
- JSDoc :162-173 (`@remarks` :168-172): "Call it manually only after mutating a
  mesh asset outside any filter" — stale after M0.2h observer wiring; needs the
  re-find-on-destroy semantics documented.
- `_syncGeometry()` (:201-226): reads `_meshFilter?._effectiveMesh()` (:204),
  undraws via `_emptyGeometry` + `_localBounds.reset()` on null (:205-211),
  copies `mesh.bounds` into `_localBounds` at :225 — **only on a notify/sync**.
- Observer hook install: `MeshFilter._findRenderer = (filter) => filter.gameObject.getComponent(MeshRenderer)` (:274).

`src/engine/core/rendering/MeshFilter.ts`:
- `onDestroy()` (:145-150): `_destroyInstance()` then `_sharedMesh = null`, then
  `super.onDestroy()` — **no renderer notify**, so nothing undraws at removal.
- `_notifyRenderer()` (:128-130): `MeshFilter._findRenderer?.(this)?.updateMesh()`.

Destroy-sequence analysis (why a notify from `onDestroy` is safe):
- `EngineObject._destroyImmediate()` (`src/engine/core/EngineObject.ts:301-312`):
  `_invokeOnDestroy()` runs in `try`; `_isDestroyed = true` is set in `finally`
  (:308) — **after** `onDestroy`. `exists()` (:230-232) is `!this._isDestroyed`,
  so during `onDestroy` it still returns true.
- `Component._destroyImmediate()` (`src/engine/core/Component.ts:310-317`):
  detaches from the GameObject in `finally` (:315) — **after** `super`, i.e.
  after `onDestroy`. During `onDestroy` the component is still attached.
- Therefore `_notifyRenderer()` inside `MeshFilter.onDestroy` reaches the sibling
  renderer, whose `updateMesh()` still resolves the OLD filter (non-null, and
  `exists()` still true at that instant) — but its meshes were just nulled, so
  `_syncGeometry()` takes the null branch and **undraws**. Correct outcome.
- Later, once destruction completes (`_isDestroyed` true), `updateMesh()` must
  re-find a replacement: guard becomes
  `this._meshFilter === null || !this._meshFilter.exists()`.
- Zero-delay `destroy()` drains in a microtask (EngineObject.ts:407-408) — tests
  that use `destroy()` instead of `destroyImmediate()` need `await Promise.resolve()`
  (same pin as M0.2hr1).

## Hole 2 — bounds changes never reach the renderer

`src/engine/core/graphics/Mesh.ts`:
- `set bounds` (:348-350): stores `_bounds = value`, **no observer notify**.
- `recalculateBounds()` (:564-587): two exits — empty-vertices early return at
  :567, normal `_bounds.setMinMax(min, max)` at :586 — **neither notifies**.
- `_markDirty()` (:213-217): `_needsUpdate = true` + `for (const notify of [...this._observers]) notify()`.
  Every data write goes through it; bounds writes do not.
- `_internalGeometry` getter (:161-167): rebuilds (`_syncToThree()`) **only when
  `_needsUpdate`** — so an observer notify that does NOT set `_needsUpdate`
  triggers a renderer re-sync (which copies `mesh.bounds` at MeshRenderer.ts:225)
  without any geometry rebuild.
- Consequence: `renderer.localBounds` keeps the extents of the last *data* write.
  Measured in review: getter edit ×10 + `recalculateBounds()` → mesh max.x 5,
  renderer 0.5.

Design: extract the observer-notify loop from `_markDirty` into a **notify-only**
private path (no `_needsUpdate = true`). Call it from `set bounds` and from both
`recalculateBounds()` exits. `_markDirty` keeps its dirty flag and reuses the
same loop. No geometry rebuild, no per-frame cost.

## Known limitation (document, don't fix)

`get bounds` (Mesh.ts:343-345) returns the **live** `_bounds` reference; in-place
mutation of the returned object bypasses the setter and notifies nothing.
`recalculateBounds()` or re-assigning `mesh.bounds = ...` is the supported path
(Unity parity: Unity's `Mesh.bounds` is a value-type property; direct field
mutation of a returned struct never propagates either).

## Unity reference behavior

- Destroying/removing a MeshFilter stops the MeshRenderer drawing (no filter,
  no mesh); adding a new filter with a mesh resumes rendering.
  https://docs.unity3d.com/6000.0/Documentation/ScriptReference/MeshFilter.html
- `Mesh.RecalculateBounds()` updates the bounds renderers use for culling;
  assigning `Mesh.bounds` likewise takes effect immediately.
  https://docs.unity3d.com/6000.0/Documentation/ScriptReference/Mesh.RecalculateBounds.html
  https://docs.unity3d.com/6000.0/Documentation/ScriptReference/Mesh-bounds.html

## Test landscape / overlap

- `tests/MeshFilterMesh.test.ts`: 23 tests (18 M0.2h + 5 M0.2hr1). Helpers:
  `CUBE_V = 24` (:22), `track()` (:27), `drawn()` (:39), `geoOf` (:48),
  `posCount` (:49). `Mesh.createSphere()` default segments 32 →
  (32+1)×(16+1) = **561** vertices (Mesh.ts:798-802).
- **No existing test pins the old behavior.** `removeComponent` appears in
  renderer-unrelated tests only (ComponentDestroy.test.ts — no renderer
  assertions; Serialization.test.ts:2328 — UIImage/Button reference nulling).
  Nothing to flip; the 4 new tests are purely additive.
- No in-flight task overlap (checked at claim time; branch
  `M0.2hr2-stale-renderer-holes` claimed, commit f5a0f15). A parallel executor
  writes the Phase-1 tests in the engine worktree — this docs task does not
  touch engine source.
