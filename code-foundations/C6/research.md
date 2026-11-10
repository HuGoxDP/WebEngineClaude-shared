# C6 — Engine E8: render a camera into a target (`RenderTexture`): research (Claude, 2026-11-10)

**Status:** confirmed by Claude (architect lane); the plan beside it (`plan.md`) is `ready`.
**Base:** WebEngineTS `master` `06aeaf5` (three `0.182.0`). Since `dbd43d6` only `Component.ts`,
`EngineObject.ts`, `GameObject.ts` changed; every render-path citation below was re-read on `06aeaf5`.
Card: `tasks/C-milestone-2.md` § C6. Context: `PLAN.md` §1.3 (RenderTexture), §1.4 (adapter staging),
`WebEngineTSEditor/docs/unity-editor-plan.md` §3.5 and §4 (E8), the Scene/Game parity tables
("Видны частицы, линии, UI, туман, skybox", "Превью выбранной камеры в углу" → 13 / E8).

## What C6 must achieve

A camera can render into an engine-owned target instead of the screen, Unity-shaped
(`RenderTexture`, `Camera.targetTexture`, `Camera.render()`), engine types only in every public
signature. The target can be sampled by a 3D material and read back to the CPU (thumbnails,
previews). It must fit the render-adapter staging: **no second way to reach the GPU**.

## Facts checked against the code (06aeaf5)

| Fact | Where |
|---|---|
| The frame seam is engine-typed: `renderScene(scene, camera)`, no target parameter | `rendering/RenderBackend.ts:137` |
| The WebGL backend renders the camera viewport rect with scissor, syncs skybox/fog per camera, then either `PostProcessing._render` or `renderer.render` — always to the canvas | `rendering/WebGLRenderBackend.ts:116-151` |
| **Only one camera is ever drawn:** `Application._render` renders `Camera.main` (or clears to `_noCameraColor`) | `Application.ts:901-930` |
| `depth`, `cullingMask`, `CameraClearFlags.Depth/Nothing` are stored and serialized but not honoured anywhere (no reader outside `Camera.ts`) | `components/Camera.ts:173-185`, grep |
| `Camera.main`: first active tagged `MainCamera`, else first active camera (engine fallback; Unity returns null) | `Camera.ts:94-108` |
| Camera pixel size comes from `_setPixelSize(w,h)` set by `Application._resize` for every camera; `_surfaceWidth/_surfaceHeight` fall back to the window; aspect = pixel rect | `Camera.ts:~370`, `~820-853`; `Application.ts:959-976` |
| Three camera is created in `onAwake` and attached as an internal child of the Transform | `Camera.ts:~200` |
| `Texture` owns a `THREE.Texture` (`_internalThreeTexture`), referents (materials) re-bind on swap; `_syncFilterMode/_syncWrapMode` set `needsUpdate` | `graphics/Texture.ts:142-209, 503-518` |
| `_setLinearData` mutates `colorSpace` (called by `StandardMaterial.albedoTexture` etc.) | `Texture.ts:282`, `StandardMaterial.ts:90` |
| `Material.mainTexture` / `setTexture` take `Texture`; `UnlitMaterial.mainTexture`, `StandardMaterial.albedoTexture/...` are typed `Texture2D` | `Material.ts:176,370`; `UnlitMaterial.ts:72`; `StandardMaterial.ts:85` |
| `Texture2D` is canvas-backed (`HTMLCanvasElement` + upload on `apply`) | `Texture2D.ts:~290-310, 480` |
| Canvas UI is drawn with 2D canvases composited over the WebGL canvas; `UIImage` warns that GPU-only (KTX2) textures cannot be drawn | `ui/Canvas.ts:15-45,166`; `ui/UIImage.ts:124-130` |
| `PostProcessing` is global, one `EffectComposer` bound to one renderer/scene/camera, rebuilt when the camera changes, ending in `OutputPass` to the screen | `postprocessing/PostProcessing.ts:86-115,138-176` |
| `MemoryProfiler._surveyTextures` walks every live `Texture` (would include a `RenderTexture` subclass); `estimatedRenderTargetVramBytes` = shadow maps + composer buffers; documented as "excludes render targets" | `diagnostics/MemoryProfiler.ts:651-756`, report docs `:35-120` |
| A material texture with no guid and no file is inlined or dropped by the writer (no RT asset type exists) | `serialization/ValueSerializer.ts:250-340` |
| **three r182:** rendering into a non-XR render target applies **no tone mapping** and outputs **linear** (`outputColorSpace = LinearSRGB`) | `three/src/renderers/webgl/WebGLPrograms.js:166-176, 202` |
| **three r182:** render-target textures are never re-uploaded (`isRenderTargetTexture === false` guard), so texture parameters set after allocation do not reach the GPU | `WebGLTextures.js:518, 551, 570` |
| three r182 has `setRenderTarget`, `readRenderTargetPixels(Async)`, `initRenderTarget`; requests `EXT_color_buffer_float` / `_half_float` at start | `WebGLRenderer.js:2796, 2977, 3059, 3436`; `WebGLExtensions.js:33-36` |
| Fake backend in tests records `renderScene(scene, camera)` frames | `tests/RenderBackend.test.ts:19-58` |
| `design/render-adapter-plan.md` was **deleted** by the owner in `a3fe342`; read it as `git show a3fe342^:design/render-adapter-plan.md`. Do not restore it | engine history |
| Visual checks: `scripts/shoot.mjs <url> <out.png> [waitMs]` (local Edge via virtual-lab's Playwright, SwiftShader GL) | `scripts/shoot.mjs` |
| Editor today: Scene view is the editor's own `THREE.WebGLRenderer` drawing `SceneManager.activeScene._internalThreeScene` | `WebEngineTSEditor/app/src/app/viewport.service.ts:24-120` |

## External behaviour (checked 2026-11-10)

- **Unity `RenderTexture`** (Scripting API): constructed with width, height, depth, format; `Create()`
  allocates, `IsCreated()`, `Release()` frees GPU memory (not GC'd — must be released/destroyed);
  created implicitly on first use; contents can be lost (`IsCreated` false again); `width`/`height`/
  `format`/`antiAliasing`/`depth` cannot change on a created texture ("not supported", error, ignored) —
  resize = release → set → create. `RenderTexture.active` is the source of `Texture2D.ReadPixels`.
  Releasing a texture still set as `Camera.targetTexture` logs a warning and clears the camera's target.
- **Unity `Camera.targetTexture`**: the camera renders into the whole texture instead of the screen;
  `pixelWidth/Height` and aspect follow the texture; `Camera.Render()` renders on demand (disabled
  camera + `Render()` is the thumbnail/preview pattern).
- **URP order:** "all Cameras that render to Render Textures run their render loops before all
  Cameras that render to the screen" (URP manual, *Render a camera's output to a Render Texture*).
- **Unity colour:** default RT `ARGB32` is stored sRGB in a linear project; `DefaultHDR` = `ARGBHalf`.
  Tone mapping is post-processing on the camera that has it, not a property of the target.
- **three.js:** a render target skips the output transform (tone mapping + sRGB) — confirmed by the
  maintainers (forum "Different color output when rendering to WebGLRenderTarget"; issue #29429, an
  opt-in output transform was proposed and not added). An `SRGBColorSpace` + `UnsignedByteType` target
  is allocated `SRGB8_ALPHA8`: hardware encodes on write, decodes on sample. `samples > 0` gives a
  multisampled renderbuffer resolved into the texture (WebGL2).
- **Editors:** Unity's Scene view renders its own camera into a target and composites gizmos; on the
  web, one WebGL context draws one canvas — showing more than one view needs either one canvas with
  per-view viewport/scissor, or a GPU→CPU copy (readPixels / `drawImage` of the GL canvas in the
  same task, as `Application.captureFrame` does).

Sources: [Unity RenderTexture](https://docs.unity3d.com/ScriptReference/RenderTexture.html),
[URP: render to a Render Texture](https://docs.unity3d.com/6000.0/Documentation/Manual/urp/rendering-to-a-render-texture.html),
[Unity forum: releasing RT set as targetTexture](https://discussions.unity.com/t/releasing-render-texture-that-is-set-as-camera-targettexture/626672),
[three.js RenderTarget](https://threejs.org/docs/pages/RenderTarget.html),
[three.js #29429](https://github.com/mrdoob/three.js/issues/29429),
[three.js forum: colour output in a render target](https://discourse.threejs.org/t/different-color-output-when-rendering-to-webglrendertarget/57494/7).

## Decisions

- **D1 — Adapter fit: follow today's resource pattern, extend only the frame seam.** `RenderTexture
  extends Texture` and owns a `THREE.WebGLRenderTarget` internally (`@internal
  _internalThreeRenderTarget`), exactly as `Texture` owns a `THREE.Texture` and `Cubemap` a
  `CubeTexture`; its colour texture *is* its `_internalThreeTexture`, so materials bind it through the
  one existing path. The seam gains an engine-typed target: `renderScene(scene, camera, target:
  RenderTexture | null = null)` and `readPixels(target, x, y, w, h, out: Uint8Array)`. A
  backend-created handle (`backend.createRenderTarget`) is **rejected**: it is adapter stage 1 in a
  fragment — two ways to reach the GPU, the thing `PLAN.md` §1.4 forbids. When N4 (stage 1) lands,
  `RenderTexture` converts together with `Texture` as one more resource; the docs phase records that
  on the N4 card. *Evidence:* adapter plan §3–4 (history), `RenderBackend.ts:81-84` (frame-level seam).
- **D2 — Public API (Unity names, engine types):** `RenderTexture(width, height, depth = 24, format =
  RenderTextureFormat.Default)`; `width`, `height`, `depth` (0 | 16 | 24 | 32), `format`,
  `antiAliasing` (1 | 2 | 4 | 8), inherited `filterMode`/`wrapMode`; `create(): boolean`,
  `release()`, `isCreated()`; `static active: RenderTexture | null`. `RenderTextureFormat` keeps
  Unity's numeric values for the subset supported: `ARGB32 = 0`, `ARGBHalf = 2`, `Default = 7`
  (→ ARGB32), `DefaultHDR = 9` (→ ARGBHalf). `Camera.targetTexture: RenderTexture | null`,
  `Camera.render()`. `Texture2D.readPixels(source: Rect, destX, destY)` reads from
  `RenderTexture.active` (Unity shape), then `apply()` as usual. Not in C6: `GetTemporary`/pooling,
  `AsyncGPUReadback`, cube/3D/array targets, `Depth` format, `Graphics.Blit`, `RawImage`.
- **D3 — Lifetime.** GPU allocation is lazy: `create()` marks it wanted and the backend initialises it
  at first render/readback (three allocates on first `setRenderTarget`); a render into a not-created
  texture creates it (Unity). `release()` disposes the three target (`dispose()`) and sets
  `isCreated() === false`; the object stays usable. `EngineObject.destroy(rt)` = release + base
  `onDestroy`. A camera whose target is released keeps it (re-created on next render); a camera whose
  target is **destroyed** drops it (`targetTexture` → null, one `console.warn` per camera) and renders
  nothing that frame. `Application.dispose()` takes the context with it; three re-initialises targets
  lazily on a new renderer, so no engine bookkeeping is needed (pinned by an assumption, not code).
- **D4 — Resize / immutable descriptor.** `width`, `height`, `depth`, `format`, `antiAliasing` set on a
  **created** texture: `console.error` once per property, value ignored (Unity). Resize = `release()`,
  set, `create()` (or just use). Constructor: non-finite or < 1 width/height → throw `RangeError`
  (a programming error); non-integers are floored. Oversize is clamped by the WebGL backend to
  `min(MAX_TEXTURE_SIZE, MAX_RENDERBUFFER_SIZE)` at allocation with one warning; samples clamped to
  `MAX_SAMPLES`. `filterMode`/`wrapMode` changed on a created texture are applied by releasing the GPU
  target (contents lost, re-created on next use) because three never re-uploads RT parameters
  (`WebGLTextures.js:518`); documented as a difference from Unity.
- **D5 — Frame order.** In `Application._render`, after the transform sync: (1) every camera from
  `Camera.allCameras` (active+enabled, ascending `depth`, ties in creation order) whose
  `targetTexture` exists renders into it; (2) the **screen camera** — `Camera.main`'s rule applied to
  cameras without a target (internal `Camera._screenCamera()`) — renders to the canvas exactly as
  today; (3) `Canvas._renderAll()` as today. With no target anywhere, `_screenCamera() === Camera.main`,
  so existing content renders byte-identically. `Camera.main` keeps Unity's meaning (it may have a
  target). Multi-camera **screen** stacking (depth + Depth/Nothing clear to screen) stays out:
  it changes pixels of existing multi-camera content → follow-up row.
- **D6 — Target render semantics (WebGL backend).** Into a target: whole texture, the camera's
  `viewport` rect applied in the texture's pixels (Unity applies `rect` to targets too); clear by
  `clearFlags` — SolidColor: colour+depth to `backgroundColor`; Skybox: skybox/fog via
  `RenderSettings._syncToThree` as today; Depth: depth only; Nothing: no clear (screen path keeps its
  full clear, unchanged). **No global `PostProcessing`** for target renders (it is a screen pipeline
  bound to one camera; alternating cameras would rebuild it each frame); per-camera post is a
  follow-up. Restore `setRenderTarget(null)` and the canvas viewport afterwards. Fog and shadows apply.
  `cullingMask` is unimplemented engine-wide — targets see everything (follow-up). LOD stays selected
  by `Camera.main` (`LODGroup._updateAll`) — targets see main's LOD (follow-up; Unity selects per camera).
- **D7 — Colour.** ARGB32 → `UnsignedByteType` + `SRGBColorSpace` (`SRGB8_ALPHA8`): linear output is
  hardware-encoded, sampling decodes — Unity's default in a linear project. ARGBHalf →
  `HalfFloatType`, `LinearSRGBColorSpace`; if neither `EXT_color_buffer_float` nor
  `EXT_color_buffer_half_float` is present → ARGB32 with one warning, and `format` then reports
  `ARGB32` (what was allocated). Targets are **not tone-mapped** (three r182; Unity too without post on
  that camera): a target shown on an unlit quad is tone-mapped once by the screen pass, which is the
  correct "monitor" result; a read-back thumbnail is sRGB but un-tone-mapped (documented).
  `RenderTexture._setLinearData` is a no-op (storage format fixed at allocation).
- **D8 — Sampling in materials.** `Material.mainTexture` / `setTexture` already accept `Texture`.
  Widen the typed slots that should take it — `UnlitMaterial.mainTexture`,
  `StandardMaterial.albedoTexture`, `StandardMaterial.emissionTexture` — to
  `Texture2D | RenderTexture | null` (getters too; both have `width`/`height`). Data slots
  (normal/metallic/occlusion/height) stay `Texture2D`. **Feedback loop** (a camera rendering into the
  texture a visible material samples) is a WebGL error and the draw is dropped; C6 documents it and
  pins "does not throw" in the visual check; a guard is a follow-up.
- **D9 — Canvas UI.** Not live in C6: the UI is 2D-canvas drawing and a target lives only on the GPU
  (same constraint as KTX2 in `UIImage`). `UIImage.sprite` stays `Sprite | Texture2D` (the type system
  rejects a `RenderTexture`). The supported route is explicit: `RenderTexture.active = rt;
  tex.readPixels(new Rect(0, 0, w, h), 0, 0); tex.apply(); image.sprite = tex;` — a synchronous GPU→CPU
  copy, fine for thumbnails and occasional previews, not per frame. `readPixels` supports ARGB32 only
  (bytes are the stored sRGB values, flipped to top-left rows); on ARGBHalf it warns once and
  leaves the texture unchanged. Live UI display = a WebGL-drawn UI or `RawImage` → follow-up, after
  Canvas UI stage work (deferred in `PLAN.md`).
- **D10 — VRAM accounting.** `RenderTexture._estimateVramBytes()` (pure, no GL):
  colour `w·h·bpp` (4 ARGB32, 8 ARGBHalf) ×4/3 if mipmapped, plus, when `antiAliasing > 1`, a
  multisampled colour renderbuffer `w·h·bpp·samples`, plus depth `w·h·(depth 16 → 2, 24/32 → 4)`
  (× samples when multisampled); 0 when not created. `MemoryProfiler._surveyTextures` **skips**
  `RenderTexture` (its documented set excludes render targets — keeps `liveTextures`,
  `estimatedTextureVramBytes`, `textureFormats` unchanged for every existing measurement, G2
  included); `_estimateRenderTargetVram` adds every live, created `RenderTexture`; the report gains
  additive `renderTextures: number` (live created count). With a non-WebGL backend `renderer` stays
  `null` (stage-0 pin unchanged).
- **D11 — Serialization.** A `RenderTexture` is **not an asset** in C6 and `Camera.targetTexture` is
  **not** a `@SerializedField`: targets are runtime objects that scripts and the editor create. A
  material slot holding one is written like any texture with no guid and no file (verify what the
  writer emits; must not throw or embed pixels). A `.renderTexture` asset (Unity has one) needs an
  asset decoder and a camera field reference → follow-up row after E5-style assets are in use.
- **D12 — `Camera.render()`.** Renders this camera now, even if disabled (Unity's preview pattern),
  into its target or, with none, to the canvas through the screen path. It needs the backend without
  `Camera` importing `Application` (which imports `Camera`): `Application` installs an `@internal`
  static hook `Camera._renderHook` at construction and clears it in `dispose()` — the callback pattern
  already used by `Texture._onDestroyed`. No Application → `render()` warns once and returns. A camera
  that never woke (no three camera) → warns once, returns. It flushes dirty transforms and world
  matrices first, as `_render` does.
- **D13 — C2 compatibility (edit mode).** C2's plan makes `Camera` a built-in that wakes in edit mode
  and leaves rendering to the editor (`Application.updateEditMode` does not render). `Camera.render()`
  does not consult `Application.isPlaying` and does not need the loop, so the editor can draw its
  Scene camera, a camera preview or a thumbnail in edit mode. The target pass lives in `_render` (the
  loop) only. Both C2 and C6 edit `Application.ts` (hub): whichever merges second syncs first.
- **D14 — Editor guidance (not engine work).** For a live Scene view, `camera.render()` to the canvas
  path (tone-mapped, post-processed like the Game view) is the cheap route; a target + `readPixels` is
  for previews and thumbnails at low rates. Which the editor uses is C5's spike decision; C6 records
  the options in the CHANGELOG entry.

## Owner questions

None. Every open point is Unity-defined, engine-internal, or recorded as a follow-up row.

## Follow-up rows (added by the docs phase as `⬜`)

Screen camera stacking (depth, Depth/Nothing clear to screen); `cullingMask` honoured; per-camera
LOD selection; per-camera post-processing for targets; `RenderTexture` asset + serialized
`Camera.targetTexture`; live RT in Canvas UI (`RawImage`); `AsyncGPUReadback` / HDR readback;
feedback-loop guard; `GetTemporary` pool.

## Risks

- **Frame-path regressions**: `_render` and the WebGL backend are on every frame of every scenario.
  Mitigation: the no-target path must stay identical (fake-backend call sequence test + screenshot
  double-run of an existing scene before/after), Full gates.
- **GL state leaks** after a target render (viewport, scissor, render target, autoClear flags) would
  corrupt the screen frame. Mitigation: restore in `finally`; visual check with a target camera that
  has a sub-rect and Depth clear.
- **Hub files**: `Application.ts` (also C2), `Camera.ts`. Phases touching them run in order.
- **Headless WebGL** (SwiftShader) may lack float colour buffers → the ARGBHalf fallback path is what
  the visual check sees; record which.
