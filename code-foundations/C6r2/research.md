# C6r2 research: `Camera.cullingMask` honoured engine-wide

**One line:** every render of a camera (screen and `targetTexture`) skips the renderers whose
`gameObject.layer` bit is not in that camera's `cullingMask`; lights are never culled; the default mask
changes nothing.
**Date:** 2026-11-26. **Status:** confirmed (Claude architect lane, autonomous; requirements are fixed by
MS-2 spec AC-4, U-13 and the "C6r2" shared decision — no owner question left).
**Base read:** WebEngineTS `origin/ms/1` `cafb5a0` (= MS-2 base; `origin/ms/2` is the same commit today),
three `0.182.0`. **Still open:** nothing blocking; see "Accepted consequences".

## What is required (from the spec, not re-decided here)

- AC-4: in a frame, a renderer whose `1 << gameObject.layer` bit is not in the camera's mask is not drawn
  by that camera, one whose bit is in it is; two cameras with different masks in one frame each draw their
  own set; `cullingMask = 0` draws no renderer; layer 31 works like any other; a change of
  `gameObject.layer` or `cullingMask` between frames shows in the next frame; every light three.js holds
  still reaches each render whatever the mask. "Drawn" = three's rule at the `WebGLRenderer.render(scene,
  camera)` call the backend makes: object and every ancestor `visible`, and
  `object.layers.test(camera.layers)`.
- U-13: default mask (`0xFFFFFFFF`, i.e. `-1` as int32) draws every renderer on layers 0–31, screen and
  target, as on the base.
- Shared decision: no new public API; no setter on `GameObject.layer`; both backend paths; CHANGELOG
  *Changed* (rendered output of content that sets a mask).
- Serial file: `WebGLRenderBackend.ts` C6r9 → C6r2. C6r2 must also wait for C6r3 only if it touches
  `Application.ts` — the chosen design does **not**.
- Gate test guard: no existing test file changes; new test files only.

## Codebase facts (origin/ms/1)

| Fact | Where |
|---|---|
| `Camera._cullingMask = 0xFFFFFFFF`, plain get/set, `@SerializedField`; no reader outside `Camera.ts` | `components/Camera.ts:211, 596-602` |
| `GameObject.layer` is a plain public field (`EngineSettings.Layers.DEFAULT`) | `GameObject.ts:66` |
| Every frame and every `Camera.render()` ends in `WebGLRenderBackend.renderScene(scene, camera, target)` → `_renderToSurface` (viewport, skybox/fog, `PostProcessing._render` or `renderer.render`) or `_renderToTarget` (clear plan, `renderer.render`, state restored in `finally`) | `rendering/WebGLRenderBackend.ts` |
| Drawables owned by `Renderer` subclasses: `MeshRenderer`, `SpriteRenderer`, `LineRenderer`, `InstancedMeshRenderer` (swaps its object at `:330`). All go through `Renderer._setInternalRenderObject(obj)` (adds `obj` as an internal child of the Transform's `Object3D`), detached in `Renderer.onDestroy` | `rendering/Renderer.ts:164-180, 507-520` |
| `ParticleSystem` (not a `Renderer`) owns a `THREE.Points` added in `_buildPoints` and removed in `onDestroy` | `particles/ParticleSystem.ts:298-301, 358` |
| Visibility already used for enable state: `Renderer._syncVisibility` (`obj.visible = isVisible`), `ParticleSystem.onEnable/onDisable`, `Light.onEnable/onDisable`, `GameObject.setActive` (transform `Object3D.visible`), `LODGroup` via `renderer.enabled` | grep `.visible =` |
| No engine code reads or writes three `Layers` anywhere (all objects and cameras sit on three layer 0, mask 1) | grep `layers` in `src` |
| three r182 `projectObject`: `visible === false` returns (subtree skipped); `layers.test(camera.layers)` gates **lights too** (`pushLight` is inside the test); children recurse regardless of the parent's layer test | `node_modules/three/src/renderers/WebGLRenderer.js:1800-1830` |
| three r182 shadow map `renderObject`: `visible === false` returns; `object.layers.test(camera.layers)` uses the **view** camera's layers | `webgl/WebGLShadowMap.js:506-512` |
| Docs already promise the mask: `.github/docs/Camera.md:59` (`cullingMask = 0xffffffff // all`), `.github/docs/Renderer.md:186` ("full invisibility needs a camera with a culling mask"); `CHANGELOG.md:78` lists `cullingMask` as a follow-up row | grep |
| Existing backend tests: pure helpers only (`tests/RenderTargetBackend.test.ts`), fake `RenderBackend`s (`tests/RenderBackend.test.ts`, `tests/CameraTargetTexture.test.ts`); C6r9 adds a fake-`WebGLRenderer` backend test (`tests/WebGLReadPixelsRows.test.ts`) | tests/ |

## Options for how the mask reaches three.js

**A — three `Layers`.** `threeCamera.layers.mask = cullingMask | 0` per render; each render object's
`layers.mask = 1 << layer` synced per frame (no setter allowed on `GameObject.layer`, so a per-frame walk
anyway); lights `layers.enableAll()`. *Breaks AC-4 for lights at `cullingMask = 0`* (three tests lights
against the camera's layers: `-1 & 0 = 0` → no light), touches every object's three state even under the
default mask (U-13 then rests on "same pixels" instead of "same state"), and collides with any consumer
(editor gizmos) that uses three layers on the internal camera.

**B — per-render visibility (chosen).** Just before the backend's `render` call, hide (set
`visible = false`) every tracked render object that is currently visible and whose owner's layer bit is
not in the mask; restore exactly those in a `finally`. Lights, transforms, cameras and any non-renderer
three object are never touched, so lights pass under any mask (three layer 0 vs camera layer mask 1, both
unchanged). Default mask = fast path that touches nothing (U-13 holds by construction). Layer and mask are
read at render time, so a change between frames shows next frame with no setter. Cost: one walk over the
tracked renderers per camera render, **only** when the mask is not full.

## Decisions

- **D1 — mechanism B.** New internal module `src/engine/core/rendering/LayerCulling.ts` (engine-only,
  not exported from `index.ts`): a registry of render-object owners plus
  `_hideOutside(mask): number` (returns a mark into a reused module array of hidden objects) and
  `_restore(mark)`. No three `Layers` writes anywhere.
- **D2 — membership rule:** `(mask & (1 << layer)) !== 0` — exactly the AC formula (JS int32 semantics, so
  `0xFFFFFFFF`, `-1`, `0x80000000` and layer 31 all behave). Fast path: `(mask | 0) === -1` → hide
  nothing, no walk. A non-integer / out-of-range `layer` follows JS shift semantics; not validated (no
  setter allowed; Unity's 0–31 is the documented range).
- **D3 — what is tracked:** every `Renderer` (registered when `_setInternalRenderObject` gets its first
  non-null object, unregistered in `onDestroy`; the current `_internalRenderObject` is read at hide time,
  so `InstancedMeshRenderer`'s swap needs nothing) and every `ParticleSystem` (Unity's
  ParticleSystemRenderer is a renderer; registered in `_buildPoints`, unregistered in `onDestroy`). Only the
  owned leaf object is hidden — never the Transform's `Object3D` — so child GameObjects and a light on the
  same GameObject are unaffected.
- **D4 — where:** `WebGLRenderBackend.renderScene` wraps both paths:
  `const mark = LayerCulling._hideOutside(camera.cullingMask); try { surface | target } finally { LayerCulling._restore(mark); }`.
  Covers `PostProcessing._render` (its passes render inside the window) and both screen and target paths.
  `warmup` is not wrapped (shader warmup must compile everything). `Application.ts` is not touched.
- **D5 — only visible objects are hidden and only those restored**, so enable state, `setActive`,
  `LODGroup` choices made by `renderer.enabled` are preserved bit-for-bit. Nested use is mark-based
  (stack discipline), no per-render allocation.
- **D6 — docs:** `Camera.cullingMask` JSDoc states the rule (renderers only, lights never, default = all);
  `.github/docs/Camera.md` gets one example line; CHANGELOG `[Unreleased]` *Changed* bullet (rendered output
  and draw-call counts of content that sets a mask change; default-mask content measures as before), and
  `cullingMask` is dropped from the "Not in this release" list of the C6 bullet (`CHANGELOG.md:78`, still
  under `[Unreleased]`, so editable).

## Accepted consequences

- A renderer culled by a camera's mask also casts no shadow in that camera's render (it is invisible
  while the shadow maps are drawn). three's own layer rule does the same (shadow pass tests the view
  camera's layers), and Unity's camera culling drops such casters too. Documented in the JSDoc.
- Non-renderer three content (editor helpers, raw `Object3D`s a consumer adds through internals) is never
  culled by the mask. Unity has no such objects; out of scope.
- The editor's Scene view camera keeps the default mask → no change there.

## Tests the plan needs (all new files)

- Fake-`WebGLRenderer` backend test (pattern of C6r9's `WebGLReadPixelsRows.test.ts`:
  `Object.create(WebGLRenderBackend.prototype)` with a recording `_renderer`) whose `render(scene, cam)`
  evaluates three's rule for each tracked object at call time: masked/unmasked, two cameras one frame,
  mask 0, layer 31, layer/mask change between renders, lights always pass, target path same as screen,
  state restored after the call (and after a throw inside `render`).
- Pure `LayerCulling` unit test: fast path touches nothing, already-hidden objects stay hidden and are not
  "restored" to visible, destroyed renderer leaves the registry, `InstancedMeshRenderer`-style swap.
