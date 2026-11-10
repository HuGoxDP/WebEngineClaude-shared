# Plan: C6 — Engine E8: render a camera into a target (`RenderTexture`)
**Created:** 2026-11-10 (Claude, architect lane)
**Status:** ready
**Complexity:** complex
**Review cadence:** 1
**Check-ins:** quiet
---
## Context
The engine draws exactly one camera, `Camera.main`, to the canvas (`Application.ts:901`). The editor
needs a camera rendered into a target for its Scene view through the engine, camera previews and
asset thumbnails (E8, `unity-editor-plan.md` §3.5/§4); content gets picture-in-picture monitors.
C6 adds Unity's `RenderTexture`, `Camera.targetTexture`, `Camera.render()` and
`Texture2D.readPixels`, engine-typed, without starting render-adapter stage 1 (N4). Card:
`tasks/C-milestone-2.md` § C6. Research and every decision with its evidence:
`code-foundations/C6/research.md` — **read it first; its Decisions D1–D14 are binding.**

**Success criteria:**
1. A camera with `targetTexture` renders into it before the screen camera every frame; a quad with an
   `UnlitMaterial` whose `mainTexture` is that target shows the target camera's view on screen
   (screenshot).
2. A scene with no `RenderTexture` renders byte-identically to base `06aeaf5` (screenshot SHA256 pair
   before/after) and the fake-backend frame sequence is unchanged.
3. `Camera.render()` renders a disabled camera into its target on demand, in play and in C2's edit mode,
   without the loop.
4. `RenderTexture.active` + `Texture2D.readPixels` + `apply()` gives a canvas-backed texture with the
   target's pixels (top row first) that `UIImage` can draw.
5. `MemoryProfiler` reports targets in `estimatedRenderTargetVramBytes` and `renderTextures`, never in
   `liveTextures` / `estimatedTextureVramBytes` / `textureFormats`.
6. No `THREE` type in any public signature; no backend-created resource handle (D1).
7. `npm run typecheck`, `npm test`, `npm run build` green.

## Constraints
- Engine only (`WebEngineTS`) plus this task's `.claude-shared` notes and rows. No consumer changes.
- D1: `RenderTexture` owns its `THREE.WebGLRenderTarget` like `Texture` owns `THREE.Texture`; the only
  seam change is engine-typed (`renderScene(..., target)`, `readPixels`). Never add
  `backend.createTexture/createRenderTarget` or any handle type — that is N4, whole, later.
- The screen path with no target anywhere must not change (no extra clears, viewport or GL calls).
- `Camera.main` keeps its meaning; `CameraClearFlags` handling on the **screen** path is unchanged.
- No `PostProcessing` on target renders (D6).
- `design/render-adapter-plan.md` stays deleted; cite it as `git show a3fe342^:design/render-adapter-plan.md`.
- Scratch (visual-check page, server, PNGs) only under the engine worktree's gitignored
  `shoot.local/` (matched by `*.local`); never committed.
- Anything this plan does not answer is a question: park the task (ATTENTION), do not guess.

---
## Implementation Phases

### Phase 1: `RenderTexture` — the resource on its own
**Skills:** code-foundations:aposd-designing-deep-modules, code-foundations:cc-defensive-programming
**Model:** sonnet
**Gate:** Standard
**Depends on:** none
**File scope:** src/engine/core/graphics/RenderTexture.ts (new), src/engine/index.ts (both export sites: the named exports ~173 and the standalone namespace ~439/608), tests/RenderTexture.test.ts (new)

**Goal:** a Unity-shaped render target object that can be constructed, configured, created, released
and destroyed, with no rendering yet.

**Scope:**
- IN: `enum RenderTextureFormat { ARGB32 = 0, ARGBHalf = 2, Default = 7, DefaultHDR = 9 }`;
  `class RenderTexture extends Texture` with constructor `(width, height, depth = 24, format =
  Default)`; getters/setters `width`, `height`, `depth` (0|16|24|32; other values → nearest allowed +
  warn), `format` (resolved: Default→ARGB32, DefaultHDR→ARGBHalf), `antiAliasing` (1|2|4|8);
  `create(): boolean`, `release()`, `isCreated()`; `static active: RenderTexture | null`;
  `@internal _internalThreeRenderTarget` (built from the descriptor: `type`, `colorSpace` per D7,
  `depthBuffer = depth > 0`, `stencilBuffer = depth >= 24`, `samples = antiAliasing > 1 ?
  antiAliasing : 0`); the target's `.texture` becomes the base `_internalThreeTexture` (dispose the
  base's default `THREE.Texture` first, as `_fromThreeTexture` does); override `_setLinearData` →
  no-op; override `_estimateVramBytes` per D10 (0 when not created); filter/wrap changes on a
  created texture call `release()` (D4); immutable-after-create rule for descriptor setters (D4:
  `console.error` once per property, ignored); constructor `RangeError` for non-finite/< 1, floor
  otherwise; `onDestroy`: release, clear `active` if it is this, then `super.onDestroy()`.
  `@internal _markCreatedByBackend()` (or equivalent) so a render into a not-created texture can mark
  it created (used by Phase 2). JSDoc on every public member: Unity equivalent, colour (D7),
  "not an asset" (D11), "not in Canvas UI" (D9).
- OUT: rendering, readback, camera, profiler.

**Edge cases:** `release()` twice; `create()` after `destroy` (returns false, warns); setters before
`create()` rebuild the three target descriptor without leaking the old one; `active` set to a
destroyed texture → reads back null.

**Produces:** `RenderTexture`, `RenderTextureFormat`, the `_internalThreeRenderTarget` contract.

**Done when:**
- [ ] DW-1.1: unit tests: defaults (`depth 24`, `format ARGB32`, `antiAliasing 1`, `isCreated false`); `DefaultHDR` resolves to `ARGBHalf`; `new RenderTexture(0, 4)` and `(NaN, 4)` throw `RangeError`; `(10.7, 4.2)` → 10×4.
- [ ] DW-1.2: unit test: after `create()`, setting `width` logs one `console.error`, keeps the old width; after `release()` the set succeeds.
- [ ] DW-1.3: unit test: `_internalThreeTexture === _internalThreeRenderTarget.texture`; ARGB32 → `UnsignedByteType` + `SRGBColorSpace`; ARGBHalf → `HalfFloatType` + linear; `antiAliasing 4` → `samples 4`; `depth 0` → no depth buffer; `_setLinearData(true)` leaves `colorSpace` unchanged.
- [ ] DW-1.4: unit test: `_estimateVramBytes` for 256×128 ARGB32 depth 24 = 256·128·4 + 256·128·4; with `antiAliasing 4` adds 256·128·4·4 and the depth term ×4; Trilinear adds ×4/3 on the colour term; 0 when not created.
- [ ] DW-1.5: unit test: `EngineObject.destroy(rt)` while `RenderTexture.active === rt` → `active` null, `isCreated` false; `public` API of the d.ts build contains no `THREE` (grep of `dist/**/*.d.ts` for `RenderTexture` lines, output pasted in build notes).

### Phase 2: The backend seam — render into a target, read it back
**Skills:** code-foundations:cc-defensive-programming, code-foundations:aposd-verifying-correctness
**Model:** sonnet
**Gate:** Full
**Depends on:** Phase 1
**File scope:** src/engine/core/rendering/RenderBackend.ts, src/engine/core/rendering/WebGLRenderBackend.ts, tests/RenderBackend.test.ts (FakeBackend signature only), tests/RenderTargetBackend.test.ts (new)

**Goal:** the frame seam can draw a camera into a `RenderTexture` and read pixels from one, engine-typed.

**Scope:**
- IN: `renderScene(scene, camera, target?: RenderTexture | null)` (JSDoc: target semantics D6);
  `readPixels(target, x, y, width, height, out: Uint8Array): boolean` (false when the backend cannot);
  WebGL implementation of the target branch: clamp size/samples at first allocation (D4, one warn),
  half-float fallback (D7, one warn, `format` reports ARGB32 afterwards), mark created,
  `setRenderTarget(rt)`, viewport/scissor from `camera._internalViewport` in target pixels,
  clear plan by `clearFlags` (D6) using `autoClear` off + explicit `clear(color, depth, stencil)`,
  `RenderSettings._syncToThree` as today, `renderer.render` (never `PostProcessing`), then in
  `finally`: `setRenderTarget(null)`, restore `autoClear`, viewport and scissor test to the canvas
  state. The screen branch (`target == null`) is the existing code, untouched. Pure, exported
  `@internal` helpers so logic is testable without GL: `_targetViewport(rect, w, h)` and
  `_clearPlan(flags) → { color, depth, stencil, skybox }`. `readPixels` WebGL: `readRenderTargetPixels`
  then flip rows to top-left; ARGBHalf → return false (D9). Update `FakeBackend` to the new signature
  (records `target`).
- OUT: who calls it (Phase 3), `Texture2D` (Phase 5).

**Edge cases:** target destroyed between frames (backend gets `null`-checked by caller, but a
destroyed target passed directly → no-op + warn); `viewport` width or height 0 → nothing drawn, no
GL error; target camera without a three camera → return; context lost → return.

**Done when:**
- [ ] DW-2.1: unit tests for `_clearPlan`: SolidColor → color+depth+stencil, Skybox → skybox + depth, Depth → depth only, Nothing → none.
- [ ] DW-2.2: unit tests for `_targetViewport`: full rect on 256×128 → (0,0,256,128) scissor off; rect (0.5,0,0.5,1) → (128,0,128,128) scissor on; zero-size rect → empty.
- [ ] DW-2.3: existing `tests/RenderBackend.test.ts` passes unchanged except the FakeBackend signature; its recorded frames for the no-target path carry `target === null`.
- [ ] DW-2.4: code-review evidence (Full gate): the `target == null` branch of `WebGLRenderBackend.renderScene` is byte-identical to `06aeaf5` (diff pasted); every GL state change in the target branch is restored in `finally`.

### Phase 3: Camera targets in the frame, and `Camera.render()`
**Skills:** code-foundations:cc-defensive-programming, code-foundations:aposd-verifying-correctness
**Model:** sonnet
**Gate:** Full
**Depends on:** Phase 2
**File scope:** src/engine/core/components/Camera.ts, src/engine/core/Application.ts (`_render`, `_resize`, constructor/dispose hook install), tests/CameraTargetTexture.test.ts (new)

**Goal:** cameras with a target render into it before the screen camera; any camera can be rendered
on demand.

**Scope:**
- IN: `Camera.targetTexture` get/set (not `@SerializedField`, D11); getter returns null and warns once
  per camera when the held texture was destroyed (D3); `_surfaceWidth/_surfaceHeight` return the
  target's size when one is set; aspect recomputed on set/clear and, in the target pass, when the
  target's size changed since last time; `Application._resize` keeps calling `_setPixelSize` for all
  cameras (the target overrides it) but sets `aspect` only for cameras without a target;
  `@internal static _screenCamera()` = `Camera.main`'s rule over cameras with no target (D5);
  `Camera.render()` (D12) via `@internal static _renderHook: ((cam: Camera) => void) | null`
  installed in the `Application` constructor, cleared in `dispose()`;
  `Application._render`: sync transforms → target pass over `Camera.allCameras` with a live target
  (ascending depth) → screen camera via `_screenCamera()` → existing no-camera clear. A shared private
  `_renderOne(camera)` does the target/screen dispatch for both the loop and the hook.
  JSDoc: frame order, Unity/URP references, C2 edit-mode note (D13), LOD/cullingMask limits (D6).
- OUT: materials, readback, profiler.

**Edge cases:** main camera itself has a target (renders into it; screen falls to the next untargeted
camera, else the no-camera clear); one target used by two cameras (both render, depth order, second
may clear the first per its flags — Unity behaviour); camera disabled → skipped by the loop but
`render()` works; `render()` with no Application → one warn; camera on an inactive object (never
woke) → `render()` warns once; target set while the camera is inactive then activated.

**Done when:**
- [ ] DW-3.1: fake-backend test: scene with main camera only → frames `[(main, null)]`, identical to the pre-change sequence.
- [ ] DW-3.2: fake-backend test: main + cam A (depth 5, target T1) + cam B (depth −1, target T2) → frames `[(B,T2), (A,T1), (main,null)]` in that order each loop tick.
- [ ] DW-3.3: fake-backend test: main has a target, second untargeted camera exists → frames `[(main,T), (second,null)]`; with no untargeted camera → `[(main,T)]` then the no-camera clear.
- [ ] DW-3.4: test: `cam.targetTexture = new RenderTexture(200, 100)` → `pixelWidth 200`, `pixelHeight 100`, `aspect 2`; window resize to 800×600 leaves them; clearing the target → 800×600 and aspect 4/3; `worldToScreenPoint` of a point on the camera axis → (100, 50).
- [ ] DW-3.5: test: disabled camera with a target, `cam.render()` → exactly one frame `(cam, T)` recorded, outside `_loop`; after `app.dispose()` `render()` warns and records nothing.
- [ ] DW-3.6: test: destroying the target → next loop tick records no frame for that camera, `targetTexture === null`, one warning only over two ticks.

### Phase 4: Sampling a target in materials; what a save writes
**Skills:** code-foundations:cc-defensive-programming
**Model:** sonnet
**Gate:** Standard
**Depends on:** Phase 1
**File scope:** src/engine/core/graphics/UnlitMaterial.ts, src/engine/core/graphics/StandardMaterial.ts (albedo + emission slots only), tests/RenderTextureMaterial.test.ts (new)

**Goal:** a target can be assigned to the colour slots and a scene holding one saves cleanly.

**Scope:**
- IN: widen `UnlitMaterial.mainTexture`, `StandardMaterial.albedoTexture`, `emissionTexture` to
  `Texture2D | RenderTexture | null` (getter and setter); `_setLinearData` call stays (no-op on a
  target, Phase 1); JSDoc: feedback-loop restriction (D8), not tone-mapped (D7).
- OUT: data slots; `UIImage` (stays `Sprite | Texture2D`, D9).

**Edge cases:** destroy the target while a material holds it (material keeps a reference to a
destroyed texture, as with `Texture2D` today — must not throw on the next frame); serialize a scene
whose `MeshRenderer` material slot holds a target.

**Done when:**
- [ ] DW-4.1: unit test: `unlit.mainTexture = rt` → the three material's `map` is `rt._internalThreeRenderTarget.texture`; same for `albedoTexture` and `emissionTexture`.
- [ ] DW-4.2: unit test: saving a scene whose material (inline) holds a `RenderTexture` does not throw, writes no pixel data and no guid for it; the written value for the slot is recorded in the build notes (expected: absent/null, D11); reload gives an untextured material.
- [ ] DW-4.3: `npm run typecheck` shows `image.sprite = rt` is still a type error (a `// @ts-expect-error` line in the test).

### Phase 5: Readback — `RenderTexture.active` + `Texture2D.readPixels`
**Skills:** code-foundations:cc-defensive-programming
**Model:** sonnet
**Gate:** Standard
**Depends on:** Phase 3
**File scope:** src/engine/core/graphics/Texture2D.ts (`readPixels` only), src/engine/core/graphics/RenderTexture.ts (`@internal static _readHook` only), src/engine/core/Application.ts (install/clear `_readHook` beside the camera hook only), tests/RenderTextureReadback.test.ts (new)

**Goal:** a target's pixels can be copied into a canvas-backed `Texture2D` (thumbnails, UI).

**Scope:**
- IN: `Texture2D.readPixels(source: Rect, destX: number, destY: number, recalculateMipMaps = true)`:
  reads from `RenderTexture.active` through `RenderTexture._readHook` (installed by `Application`,
  calls `backend.readPixels`), clips `source` to the target and the destination to this texture, writes
  the bytes into the backing canvas (`putImageData`) and the CPU pixel cache if readable; the caller
  then calls `apply()` (Unity) — `apply` must keep these pixels. No active target, no Application,
  ARGBHalf target, or backend returns false → one warning per cause, texture unchanged.
- OUT: async readback, HDR readback (follow-ups).

**Edge cases:** source partly outside the target; destination partly outside the texture;
`Texture2D` made non-readable by `apply(_, true)`; target never rendered (reads zeros, no throw).

**Done when:**
- [ ] DW-5.1: test with a stub `_readHook` that returns a known 4×2 pattern: `readPixels(new Rect(0,0,4,2),0,0)` then `getPixel` matches the pattern with the top row first.
- [ ] DW-5.2: test: clipping cases (source overhang, destination offset 2,1 on a 4×2 texture) write only the overlap.
- [ ] DW-5.3: test: no `RenderTexture.active` → warn once, pixels unchanged; ARGBHalf active → warn once, unchanged.

### Phase 6: VRAM accounting
**Skills:** code-foundations:cc-defensive-programming
**Model:** sonnet
**Gate:** Standard
**Depends on:** Phase 1
**File scope:** src/engine/core/diagnostics/MemoryProfiler.ts, tests/RenderTextureMemory.test.ts (new)

**Goal:** targets are counted where the report says render targets are, and nowhere else.

**Scope:**
- IN: `_surveyTextures` skips `instanceof RenderTexture`; `_estimateRenderTargetVram` adds
  `_estimateVramBytes()` of every live `RenderTexture` (walk `EngineObject.FindObjectsOfType`) — this
  part needs no GL and is computed even when the composer/shadow parts cannot be; report field
  `renderTextures: number` (live created count) with JSDoc; overlay/`logReport` line
  `Render textures: N (~bytes)`; update the `estimatedRenderTargetVramBytes` doc to name them.
- OUT: changing any other figure.

**Done when:**
- [ ] DW-6.1: test (WebGL-less, via the existing renderer stub pattern in the MemoryProfiler tests — or a direct call of the private estimators through `as any` if no stub exists, noted): two created targets + one not created → `renderTextures 2`, render-target bytes include exactly their two estimates; `liveTextures`/`estimatedTextureVramBytes`/`textureFormats` equal the figures with no targets.
- [ ] DW-6.2: the stage-0 pin still holds: with the fake backend `snapshot().renderer === null` and `logReport()` does not throw (existing test green).

### Phase 7: Visual check and adversarial review
**Skills:** code-foundations:aposd-verifying-correctness, code-foundations:cc-quality-practices
**Model:** sonnet
**Gate:** Full
**Depends on:** Phases 3, 4, 5, 6
**File scope:** shoot.local/** (gitignored scratch, not committed), tests/RenderTextureFrame.test.ts (new, for any bug found)

**Goal:** prove the pixels in a real browser and try to break the frame path.

**Scope:**
- IN: `npm run build`; a scratch page `shoot.local/rt.html` + a tiny static server
  (`shoot.local/serve.mjs`, Node `http` serving the engine repo root) loading
  `dist/WebEngineTS.standalone.js` (global namespace per `src/engine/index.ts`): a red cube and a blue
  sphere; a main camera; a second camera (depth −1, `targetTexture` 256×256, SolidColor green
  background) looking only at the cube from the side; a quad in front of the main camera with
  `UnlitMaterial.mainTexture = rt`. Variants via query string: `?base` (no RT, same scene without the
  quad), `?depthclear` (target camera `clearFlags = Depth` with a sub-rect `viewport`), `?feedback`
  (the target camera also sees the quad), `?readback` (after 60 frames: `readPixels` into a
  `Texture2D`, shown in a `UIImage` corner). `node scripts/shoot.mjs http://localhost:<port>/shoot.local/rt.html?<v> shoot.local/<v>-1.png 6000`, twice per variant.
- Base comparison: `?base` on this branch and on `06aeaf5` (`git archive 06aeaf5 | tar -x -C <tmp>` +
  `npm ci` + `npm run build` there, never a nested worktree) → identical SHA256.
- Adversarial: destroy the target mid-run; resize the window (shoot clip/scale); release + resize +
  create every 30 frames; two cameras into one target; `Camera.render()` from inside `update`.

**Done when:**
- [ ] DW-7.1 (visual, manual): `?` default shot shows the quad textured with the side view of the red cube on green; the main view is otherwise unchanged; console has no errors. PNG paths + description in the build notes.
- [ ] DW-7.2 (visual): SHA256 of `?base` equal across the two runs and equal to the `06aeaf5` build's `?base` (pairs pasted).
- [ ] DW-7.3 (visual): `?depthclear` shows the previous contents outside the sub-rect and no leak of the target's viewport/scissor into the main view (main view identical to default variant outside the quad).
- [ ] DW-7.4: `?feedback` raises no page error and the frame loop keeps running (console WebGL warning recorded, quad missing in the target is acceptable — D8).
- [ ] DW-7.5: `?readback` shows the side view in the UI corner, not upside down.
- [ ] DW-7.6: every adversarial case either passes or yields a fixed bug with its regression test in `tests/RenderTextureFrame.test.ts`; record which headless format path ran (ARGBHalf or fallback).
- [ ] DW-7.7: full checks green on one run: `npm run typecheck`, `npm test`, `npm run build`.

### Phase 8: Docs and roadmap
**Skills:** code-foundations:code-clarity-and-docs
**Model:** sonnet
**Gate:** Minimal
**Depends on:** Phase 7
**File scope:** CHANGELOG.md (engine), .claude-shared/ROADMAP.md (C6 row + follow-up rows), .claude-shared/tasks/C-milestone-2.md (C6 status line), .claude-shared/tasks/E-growth.md (N4 paragraph: one sentence), .claude-shared/PLAN.md (§1.3 / §1.5 E8 status), .claude-shared/code-foundations/C6/*

**Goal:** the change is recorded where the owner, the editor lane and N4 will look.

**Done when:**
- [ ] DW-8.1: engine CHANGELOG *Added*: `RenderTexture`, `RenderTextureFormat`, `Camera.targetTexture`, `Camera.render()`, `Texture2D.readPixels`, `RenderTexture.active`, `MemoryReport.renderer.renderTextures`; *Changed*: `RenderBackend.renderScene` gains `target`, `RenderBackend.readPixels` (a custom backend must implement it), typed material slots widened; note "no measured number changes for content without targets" and the editor options of D14.
- [ ] DW-8.2: ROADMAP C6 → `✅ <date> W<n>` + what landed; new `⬜` follow-up rows from research "Follow-up rows" (each one line, repo E); N4 card gains: "`RenderTexture` (C6) owns a three render target like `Texture` — convert it in stage 1 with the other resources"; PLAN §1.5 moves E8 to implemented.
- [ ] DW-8.3: build notes (decisions taken during build, headless format path, screenshot pairs) in `code-foundations/C6/notes.md`.

---
## Test Coverage
**Level:** 100% of new/changed routines with unit tests; frame-path behaviour by fake-backend tests + screenshots.
## Test Plan
- [ ] Every DW above has a named test in `tests/RenderTexture*.test.ts` / `tests/CameraTargetTexture.test.ts` / `tests/RenderTargetBackend.test.ts`, or a recorded command output / PNG (DW-1.5, 2.4, 7.x).
- [ ] Dirty tests: invalid sizes; descriptor set after create; destroyed target on a camera and in a material; `render()` without Application / on a never-woken camera; readback with no active target, HDR target, clipped rects; feedback loop.
- [ ] Integration: loop tick ordering with three cameras (fake backend); Application dispose then render.
- [ ] Manual/visual: Phase 7 shots via `scripts/shoot.mjs`, double-run SHA256 pairs.

## Assumptions
| Assumption | Confidence | Verify Before Phase | Fallback If Wrong |
|---|---|---|---|
| `THREE.WebGLRenderTarget` constructs in vitest without a GL context | high | 1 | construct lazily on first `_internalThreeRenderTarget` read; keep descriptor fields engine-side |
| three re-initialises a disposed/unknown target lazily on `setRenderTarget` (no `initRenderTarget` needed) | high | 2 | call `initRenderTarget` in the target branch when not created |
| Swapping the base texture handle to the RT's texture through `_setInternalThreeTexture` re-binds referents correctly | high | 1 | swap directly as `_fromThreeTexture` does, then notify |
| Inline material writer drops a texture with no guid (does not embed) | medium | 4 | skip `RenderTexture` explicitly in the writer path that handles textures; note it |
| A static hook on `Camera` is acceptable under C2's edit-mode design (C2 adds no render gate) | high | 3 | re-read merged C2; if a gate exists, `render()` bypasses it (D13) |
| SwiftShader supports at least the ARGB32 path | high | 7 | report in ATTENTION; do not skip DW-7.x |

## Decision Log
| Decision | Alternatives Considered | Rationale | Phase |
|---|---|---|---|
| D1 RT owns a three target; seam gets engine-typed `target` | backend-created handle | a handle is N4 stage 1 in a fragment — two GPU paths (PLAN §1.4) | 1, 2 |
| D5 targets before the screen camera; screen = main rule among untargeted | render all cameras by depth | URP order; untouched pixels for existing content | 3 |
| D6 no PostProcessing on targets | run the global composer per target | composer is screen-bound to one camera, rebuild per switch | 2 |
| D7 ARGB32 = sRGB8_ALPHA8, no tone mapping | tone-map into the target | Unity default; three r182 skips output transform; screen pass tone-maps once | 2 |
| D9 no live RT in Canvas UI; readback route | per-frame readPixels in UIImage | UI is 2D canvas; per-frame GPU→CPU stalls | 5 |
| D10 RT counted as render target, not texture | count in liveTextures | report docs + G2 measurements stay comparable | 6 |
| D11 RT not an asset, targetTexture not serialized | `.renderTexture` asset now | needs asset decoder + refs; no consumer yet | 3, 4 |
| D12 `Camera.render()` via Application-installed hook | Camera imports Application | existing callback pattern (`Texture._onDestroyed`), no cycle | 3 |

---
## Notes
- Hub files: `Application.ts` (Phases 3, 5; also C2), `Camera.ts` (3). Waves: Phase 4 and Phase 6 may
  run beside Phase 2 (disjoint scopes, Standard gates); everything else serial.
- If C2 merges first, sync before Phase 3 and keep its `isPlaying`/edit-mode code intact.
- Each Full-gate review re-runs DW-3.1 (no-target sequence) and the `?base` SHA comparison when available.
---
## Decided During Build
_Filled by /code-foundations-build — one row per decision an agent made or question it raised:_
| # | Phase | Decision or question | Source | Status |
---
## Execution Log
_To be filled during /code-foundations-build_
