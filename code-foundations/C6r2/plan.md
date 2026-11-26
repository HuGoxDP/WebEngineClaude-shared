# Plan: C6r2 — `Camera.cullingMask` honoured engine-wide
**Created:** 2026-11-26
**Status:** ready
**Complexity:** simple
**Review cadence:** 3
**Check-ins:** quiet
**Size:** S–M. **Research:** research.md (decisions D1–D6). **Risk overall:** normal (MS-2 spec, AC-4, U-13).
Rule: existing tests are never modified, deleted or renamed (gate test guard); new test files only. Base
`origin/ms/2` after C6r9 has merged (serial file `WebGLRenderBackend.ts`: C6r9 → C6r2). `Camera.ts` (JSDoc only, Phase 3) is also written by C6r9 and possibly C6r3 — land after both or keep the
hunk comment-only and rebase. `Application.ts` is
**not** touched, so C6r2 does not wait for C6r3. No `release:local`, no consumer change.
---
## Context
**Problem:** `Camera.cullingMask` is stored and serialized but read nowhere, so every camera — screen and
`targetTexture` — draws every renderer on every layer.
**Success:** every render of a camera skips exactly the renderers whose `1 << gameObject.layer` bit is not
in its mask (AC-4), lights always reach the render, and the default mask changes nothing (U-13).
## Constraints
- No new public API; no setter added to `GameObject.layer` (a plain field) — layer and mask are read at
  render time, so a change between frames shows next frame.
- Mechanism (research D1): per-render visibility of the renderers' own three objects, hidden just before the
  backend's render and restored in a `finally`; **no three `Layers` writes** anywhere (three tests lights
  against the camera's layers, so a mask on `threeCamera.layers` would cull lights at `cullingMask = 0`).
- Membership (D2): `(mask & (1 << layer)) !== 0`; fast path `(mask | 0) === -1` touches nothing.
- Only the owned leaf object is hidden — never a Transform `Object3D` — and only objects that were
  `visible === true` are hidden and later restored (D3, D5).
- Frame path with the default mask stays state-identical to the base.
- CHANGELOG `[Unreleased]` *Changed*: rendered output and draw calls of content that sets a mask.
---
## Implementation Phases

### Phase 1: LayerCulling registry and owners
**Skills:** code-foundations:aposd-designing-deep-modules, code-foundations:cc-defensive-programming
**Model:** sonnet
**Gate:** Standard
**Depends on:** none
**File scope:** WebEngineTS: src/engine/core/rendering/LayerCulling.ts (new), src/engine/core/rendering/Renderer.ts, src/engine/core/particles/ParticleSystem.ts, tests/LayerCulling.test.ts (new)

**Goal:** an engine-internal module that knows every render object's owner and can hide, then restore,
those outside a mask.

**Scope:**
- IN: `LayerCulling.ts` (not exported from `src/engine/index.ts`); `Renderer` tracks itself when
  `_setInternalRenderObject` receives a non-null object and untracks on `_setInternalRenderObject(null)` and
  in `onDestroy`; `ParticleSystem` tracks in `_buildPoints` and untracks in `onDestroy`.
- OUT: backend wiring (Phase 2); `Light`, `Camera`, `Transform`, `GameObject.ts`; three `Layers`.

**Edge cases:** mask `0`, `NaN`/`undefined` (→ `| 0` = 0 → everything culled); `0x80000000` and layer 31;
an owner whose object is `null` (not yet awake / destroyed subclass that skipped `super.onDestroy`) is
skipped; an object already `visible = false` is neither hidden nor "restored" to visible;
`InstancedMeshRenderer` swaps its object (`InstancedMeshRenderer.ts:330`) — the current object is read at
hide time; nested hide/restore uses marks (stack order), no per-call allocation.

**Produces:** the contract Phase 2 calls —
```ts
/** @internal engine-only */
export interface LayerCullable {
    readonly gameObject: GameObject;
    /** The three object this owner draws with, or null. */
    _layerCullObject(): THREE.Object3D | null;
}
export abstract class LayerCulling {
    static _track(owner: LayerCullable): void;     // idempotent (Set)
    static _untrack(owner: LayerCullable): void;
    /** Hides every tracked, currently visible object whose owner's layer bit is not in `mask`;
     *  returns a mark. `(mask | 0) === -1` returns the current mark and touches nothing. */
    static _hideOutside(mask: number): number;
    /** Sets `visible = true` on every object hidden since `mark`, newest first, and drops them. */
    static _restore(mark: number): void;
}
```
`Renderer._layerCullObject()` returns `_internalRenderObject`; `ParticleSystem._layerCullObject()` returns
`_points`.

**Done when:**
- [ ] DW-1.1: `_hideOutside(1 << 3)` hides a tracked renderer on layer 5 and leaves one on layer 3, a light's three object and the Transform `Object3D` untouched; `_restore` brings back exactly the hidden one
- [ ] DW-1.2: full mask (`0xFFFFFFFF` and `-1`) hides nothing and leaves the hidden-list length unchanged
- [ ] DW-1.3: mask `0` hides every visible tracked object; layer 31 is hidden by a mask without bit 31 and kept by `0x80000000`
- [ ] DW-1.4 (dirty): a renderer disabled before the hide (`visible = false`) is still invisible after `_restore`; a destroyed renderer is untracked and never touched; a `null` object is skipped without throwing
- [ ] DW-1.5: a `ParticleSystem` on a culled layer is hidden and restored like a renderer
- [ ] DW-1.6: `npx vitest run tests/LayerCulling.test.ts` plus the existing `tests/InstancedMeshRenderer.test.ts`, `tests/Particles.test.ts`, `tests/ParticleShapeSampling.test.ts`, `tests/LineRendererIntegration.test.ts` pass; `npx tsc --noEmit` clean

### Phase 2: Backend applies the mask on both paths
**Skills:** code-foundations:cc-defensive-programming
**Model:** sonnet
**Gate:** Standard
**Depends on:** Phase 1
**File scope:** WebEngineTS: src/engine/core/rendering/WebGLRenderBackend.ts, tests/CameraCullingMask.test.ts (new)

**Goal:** `WebGLRenderBackend.renderScene` wraps both the surface and the target path in
`const mark = LayerCulling._hideOutside(camera.cullingMask); try { … } finally { LayerCulling._restore(mark); }`.

**Scope:**
- IN: the wrap in `renderScene` only (after the `threeCamera` guard), so `PostProcessing._render`'s passes
  and `_renderToTarget`'s `render` run inside the window; a short comment citing D1/D4.
- OUT: `warmup` (shader warmup must compile everything), `readPixels` (C6r9's hunk), `_renderToSurface` /
  `_renderToTarget` bodies, `Application.ts`, `Camera.ts`.

**Edge cases:** a `render` that throws still restores visibility; a destroyed target (early return) restores;
two cameras with different masks rendered back to back each see their own set; default mask → no object's
`visible` written (U-13).

**Test approach (new file):** build the backend without GL — `Object.create(WebGLRenderBackend.prototype)`
with `_renderer` set to a fake (same approach as C6r9's `tests/WebGLReadPixelsRows.test.ts`) providing
`getSize`, `setViewport`, `setScissor`, `setScissorTest`, `setClearColor`, `clear`, `setRenderTarget`,
`autoClear`, and a `render(scene, cam)` that records, **at call time**, for each object of interest three's
rule: object and every ancestor `visible` and `object.layers.test(cam.layers)`. Scene/camera setup follows
`tests/CameraTargetTexture.test.ts` / `tests/RenderTextureFrame.test.ts` (camera awake so
`_internalThreeCamera` exists; `RenderTexture` for the target path). `PostProcessing.enabled` stays false.

**Done when:**
- [ ] DW-2.1: AC-4 per frame: renderer on a layer outside the mask is not drawn, inside is drawn — on the screen path and into a `targetTexture`
- [ ] DW-2.2: two cameras, two masks, one frame: each `render` call sees its own set
- [ ] DW-2.3: `cullingMask = 0` draws no renderer; layer 31 behaves like layer 5; changing `gameObject.layer` or `cullingMask` between two renders shows in the second
- [ ] DW-2.4: a `DirectionalLight`/`PointLight` passes three's rule in every render under masks `0`, `1 << 7` and full, including when its GameObject also carries a culled `MeshRenderer`
- [ ] DW-2.5 (U-13): with the default mask every renderer on layers 0–31 is drawn on both paths and no `visible` changes (before == during == after); camera and object three `layers` masks are untouched (still `1`)
- [ ] DW-2.6 (dirty): a fake `render` that throws leaves every object's `visible` as before the call; a destroyed target returns with visibility unchanged
- [ ] DW-2.7: `npx vitest run tests/CameraCullingMask.test.ts tests/RenderTargetBackend.test.ts tests/RenderBackend.test.ts tests/CameraTargetTexture.test.ts tests/RenderTextureFrame.test.ts tests/WebGLReadPixelsRows.test.ts` pass; `npx tsc --noEmit` clean

### Phase 3: Docs, CHANGELOG, full gate (integrator)
**Skills:** code-foundations:code-clarity-and-docs
**Model:** haiku
**Gate:** Minimal
**Depends on:** Phase 2
**File scope:** WebEngineTS: CHANGELOG.md, src/engine/core/components/Camera.ts (JSDoc of `cullingMask` only), .github/docs/Camera.md

**Goal:** doc update — say the mask is honoured and what it does.

**Scope:**
- IN: `Camera.cullingMask` JSDoc (renderers only; lights never culled; a culled renderer casts no shadow in
  that camera's render; default = all; bit rule `1 << gameObject.layer`); one line in
  `.github/docs/Camera.md` near line 59 (e.g. `camera.cullingMask = ~(1 << 5); // all except layer 5`);
  CHANGELOG `[Unreleased]` *Changed* bullet (content that sets a mask now draws differently and with fewer
  draw calls; default-mask content measures as before), and drop `cullingMask` from the C6 bullet's
  "Not in this release" list (`CHANGELOG.md:78`, still `[Unreleased]`). On a CHANGELOG merge conflict keep both.
- OUT: code behaviour; `GameObject.ts`; `.github/docs/Renderer.md` (its line 186 is now simply true).

**Done when:**
- [ ] DW-3.1: CHANGELOG *Changed* bullet present and the follow-up list no longer names `cullingMask`
- [ ] DW-3.2: `cullingMask` JSDoc and `Camera.md` describe the rule; no code line in `Camera.ts` changed (diff is comment-only)
- [ ] DW-3.3: `npx tsc --noEmit` clean (comment-only change); the full suite is the batch gate's job at landing, not the worker's
---
## Test Coverage
**Level:** 100% (every new/changed routine: `LayerCulling` statics, the `Renderer`/`ParticleSystem` track/untrack hooks, the `renderScene` wrap)
## Test Plan
- [ ] `tests/LayerCulling.test.ts` (new): DW-1.1–1.5; dirty: pre-hidden object stays hidden, destroyed/null owner skipped, NaN mask → culls all
- [ ] `tests/CameraCullingMask.test.ts` (new): DW-2.1–2.5 via a fake `WebGLRenderer` recording three's draw rule at call time; dirty: throwing `render`, destroyed target (DW-2.6)
- [ ] Existing suites unchanged and green: `RenderBackend`, `RenderTargetBackend`, `CameraTargetTexture`, `RenderTextureFrame`, C6r9's new files (no existing test file edited)
- [ ] Workers run targeted tests only; the full suite runs in the batch gate at landing (swarm rule)
---
## Notes
- Hidden-test contract: AC-4 defines "drawn" at the `WebGLRenderer.render(scene, camera)` call the backend
  makes — the wrap must sit around that call on both paths, which `renderScene` guarantees.
- Shadows: culled renderers cast no shadows in that camera's render (they are invisible during the shadow
  pass; three's layer rule would do the same). Documented, not tested by AC.
- Non-renderer three content (editor helpers, raw objects) is never culled by the mask — out of scope.
- If C6r3 (per-camera LOD) lands first and toggles `renderer.enabled` inside the render of each camera,
  D5's "only visible objects" rule keeps both features composable; nothing to coordinate beyond the
  serial order on `WebGLRenderBackend.ts` / `Camera.ts`.
- `docs/code-standards.md` was not regenerated (architect lane is read-only on the repo); follow the
  surrounding file style (JSDoc with `@internal`, reused module-level scratch, `finally` restores).
---
## Decided During Build
_Filled by /code-foundations:build — one row per decision an agent made or question it raised:_
| # | Phase | Decision or question | Source | Status |
---
## Execution Log
_To be filled during /code-foundations:build_
