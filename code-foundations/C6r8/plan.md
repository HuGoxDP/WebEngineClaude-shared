# Plan: C6r8 createQuad Unity parity
**Created:** 2026-11-25
**Status:** ready
**Complexity:** simple
**Review cadence:** 2
**Check-ins:** quiet
---
## Context
**Problem:** `Mesh.createQuad` has normal +Z and winding culled for a camera at -z, so a flat plane never renders. **Success:** AC-4 of MS-2: four XY vertices centred on origin, every normal (0,0,-1), UV (0,0) at (-w/2,-h/2) and (1,1) at (w/2,h/2), every triangle agreeing with its normals by the PrimitiveWinding rule, front-facing to a camera at negative z looking +z.
## Constraints
- `tests/PrimitiveWinding.test.ts` stays green and is not edited; new test files only (exception: the one stale assertion in RenderTextureFrame, DW-1.3).
- Tier-B coder phases; shared file CHANGELOG only in the integrator phase; no hidden-test content quoted.
- Rendered output changes: CHANGELOG *Changed* entry.
---
## Implementation Phases

### Phase 1: Fix createQuad
**Skills:** none -- one-routine data change
**Model:** sonnet
**Gate:** Standard
**Depends on:** none
**File scope:** WebEngineTS: src/engine/core/graphics/Mesh.ts, tests/QuadUnityParity.test.ts (new), tests/RenderTextureFrame.test.ts (stale quad assertion only)
**AC:** AC-4
**Risk:** flipping normals without indices (or vice versa) fails PrimitiveWinding; recipe/args must not change.

**Goal:** `createQuad` emits normals (0,0,-1) and triangles [0,2,1, 0,3,2], vertices and UV unchanged, doc comment states Unity Quad parity.

**Scope:**
- IN: createQuad body and JSDoc; new test file; update the `[0,0,1]` expectation and comment at RenderTextureFrame.test.ts "a quad is not a screen" to -Z.
- OUT: createPlane and other primitives, backend/culling code, PrimitiveWinding.test.ts.

**Edge cases:** non-square and non-default sizes (w=2,h=1; default args); `clone()` and `fromPrimitive` rebuild keep normals -Z; zero or negative size is unchanged behaviour.

**Done when:**
- [ ] DW-1.1: 4 vertices in XY, z=0, bounds centred on origin, size w x h
- [ ] DW-1.2: every normal equals (0,0,-1)
- [ ] DW-1.3: UV (0,0) at (-w/2,-h/2), (1,1) at (w/2,h/2); RenderTextureFrame assertion updated and file green
- [ ] DW-1.4: every triangle has geometric normal . mean stored normal > 0 and z-component negative (faces a camera at -z); PrimitiveWinding, MeshRecipeStale, SecondUvSet, Serialization green

### Phase 2: Docs and CHANGELOG (integrator)
**Skills:** none -- docs only
**Model:** haiku
**Gate:** Minimal
**Depends on:** Phase 1
**File scope:** WebEngineTS: CHANGELOG.md, .github/docs/Mesh.md
**AC:** AC-4
**Risk:** wording must say output changed (benchmarks re-measure); low.

**Goal:** record the change for consumers.

**Scope:**
- IN: CHANGELOG `[Unreleased]` *Changed* entry (quad now faces -Z, matches Unity Quad, previously culled and never rendered, rendered output of createQuad content changes); Mesh.md note on orientation under CreateQuad.
- OUT: ENGINE-GAPS.md (no gap row), code.

**Edge cases:** keep existing Unreleased entries intact.

**Done when:**
- [ ] DW-2.1: CHANGELOG has a *Changed* entry naming createQuad, -Z normal, measured-number caveat
- [ ] DW-2.2: Mesh.md states XY plane, normal -Z, visible from negative z
---
## Test Coverage
**Level:** Per-phase
## Test Plan
- [ ] tests/QuadUnityParity.test.ts: DW-1.1..1.4 for (1,1), (2,1), default args, after `clone()`
- [ ] Dirty: a deliberately mismatched mesh (normals -Z, old indices) fails the same winding rule, proving the test detects half a fix; sizes 0.001 and 1000 keep winding
- [ ] Regression: PrimitiveWinding, MeshRecipeStale, SecondUvSet, Serialization, RenderTextureFrame
## Notes
- Backend culling in mirrored space is unchanged; AC-4 fixes data only.
