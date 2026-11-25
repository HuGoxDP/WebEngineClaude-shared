# Plan M0.2hr3 — deferred MeshRenderer rebuild
**Status:** ready
**Complexity:** simple
**Review cadence:** 2
**Check-ins:** quiet

## Context
Problem: each Mesh data write rebuilds the GPU geometry synchronously per renderer (5 writes = 5 `Mesh.prototype._syncToThree`). Constraints: existing immediate-sync tests (U-4) stay green and unmodified; `Mesh._syncToThree` stays the single rebuild point; bounds observers keep their immediate path; Application.ts is serial (M0.2hr3 then C6r3). Success: five writes + one flush = 1 rebuild; after flush renderer has final vertex count and bounds; destroyed-while-dirty does not throw; an undrawn mesh is not rebuilt.

### Phase 1: Deferred dirty set in MeshRenderer
**Skills:** cc-defensive-programming
**Model:** sonnet
**Gate:** Standard
**Depends on:** none
**File scope:** WebEngineTS: src/engine/core/rendering/MeshRenderer.ts, src/engine/core/graphics/Mesh.ts
**AC:** AC-5, U-4
**Risk:** normal

**Goal:** A data write marks the drawing renderer dirty in a static `Set<MeshRenderer>`; `static _flushDirty()` rebuilds each once.

**Scope:**
- IN: Mesh distinguishes data-write notification from bounds-only notification (e.g. a second observer channel or a flag argument; bounds path unchanged); `_onMeshEdited` adds to the set; `_flushDirty()` runs `_syncGeometry` per renderer and clears the set; renderer readers of geometry/bounds (and `_syncGeometry` itself) pull-flush the renderer first if it is dirty, which keeps U-4 immediate reads identical; `onDestroy` deletes it from the set; `_flushDirty` skips destroyed renderers.
- OUT: Application.ts call, Mesh rebuild logic, public API (none added; `_flushDirty` is internal).

**Edge cases:** renderer destroyed while dirty; mesh swapped or cleared between write and flush (flush re-reads the filter's effective mesh); renderer disabled; the same renderer marked dirty many times; flush during iteration (copy the set first).

**Done when:**
- [ ] DW-1.1: five data writes on a drawn mesh then `MeshRenderer._flushDirty()` give exactly one `_syncToThree` call.
- [ ] DW-1.2: after the flush the renderer geometry vertex count and bounds equal the final data.
- [ ] DW-1.3: destroy while dirty then flush does not throw; a mesh no renderer draws is never rebuilt.
- [ ] DW-1.4: all existing tests still pass unmodified (U-4).

### Phase 2: Application integrator (serial file)
**Skills:** none -- one-line call
**Model:** haiku
**Gate:** Standard
**Depends on:** Phase 1
**File scope:** WebEngineTS: src/engine/core/Application.ts
**AC:** AC-5
**Risk:** normal

**Goal:** Call `MeshRenderer._flushDirty()` beside `Transform._syncAllDirty()` in `_render` (and `warmupShaders`) before matrices update.

**Scope:**
- IN: the import (if absent) and the call placed immediately after `Transform._syncAllDirty()`.
- OUT: any other edit; C6r3 follows this phase in the same file.

**Edge cases:** no active scene or camera paths unchanged; the call is a no-op with an empty set.

**Done when:**
- [ ] DW-2.1: both `Transform._syncAllDirty()` sites are followed by `MeshRenderer._flushDirty()`.
- [ ] DW-2.2: a frame drawn after writes shows the final data, with no extra rebuild.

### Phase 3: Tests (new files only)
**Skills:** cc-quality-practices
**Model:** sonnet
**Gate:** Standard
**Depends on:** Phase 1
**File scope:** WebEngineTS: tests/MeshRendererDeferredFlush.test.ts
**AC:** AC-5, U-4
**Risk:** normal

**Goal:** Pin the behaviour in one new test file following the `MeshFilterMesh.test.ts` setup pattern.

**Scope:**
- IN: the cases in the Test Plan.
- OUT: editing existing tests.

**Done when:**
- [ ] DW-3.1: the new file passes, and fails against base (5 rebuilds).
- [ ] DW-3.2: the full suite is green.

## Test Coverage
100% of the new branches (dirty set add, flush, destroy removal, pull-flush).

## Test Plan
- Unit: spy `Mesh.prototype._syncToThree`; 5 writes (vertices, normals, uv, triangles, recalculateNormals) + flush = 1 call; bounds and vertex count are final.
- Dirty: destroy renderer while dirty then flush (no throw); mesh with no renderer is not rebuilt; flush with an empty set; mesh swapped before the flush; a write after the flush re-dirties; a bounds-only change stays immediate.
- Regression: MeshFilterMesh and the whole existing suite unchanged.
