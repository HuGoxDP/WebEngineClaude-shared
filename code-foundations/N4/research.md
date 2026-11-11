# N4 — Render adapter stage 1 (resource handles) → WebGPU: research (Claude, 2026-11-11)

**Status:** confirmed by Claude (architect lane); the plan beside it (`plan.md`) is `ready`.
**Base:** WebEngineTS `master` `a020db6` (after A5, A7, E-G2a). No engine branch is in flight
(`git branch -r`: only `origin/master` and the merged `E-G2a-…`).
**Card:** `tasks/E-growth.md` § N4. `PLAN.md` §1.4. ROADMAP rows N4 (M6, `🧠`) and C6 (`📐`).
**Staging doc:** `design/render-adapter-plan.md` was deleted by the owner in `a3fe342`; read it with
`git -C WebEngineTS show a3fe342^:design/render-adapter-plan.md`. **Do not restore it.** Its stage
definitions are summarised under "The staging doc" below, and this file replaces it for N4.

## What N4 must achieve

The card: "`design/render-adapter-plan.md` stage 1 (resource handles) done whole, never in fragments.
Then `WebGPURenderer` …; pin three's version …; WebGL2 stays the default until WebGPU covers the
students' devices." `PLAN.md` §1.4: "each stage must leave exactly one way to reach the GPU, or the
`instanceof THREE.Mesh` checks the engine relies on start failing for whichever objects took the new
path."

This research covers **stage 1 only**: textures, meshes and materials reach the GPU only through
handles created by the render-backend layer; nothing above that layer creates, mutates or names a
Three.js texture, geometry or material. WebGPU itself is a later task, gated by the go/no-go criteria
at the end of this file.

## The staging doc (deleted, from history)

- **Stage 0, done 2026-09-03.** The frame seam `RenderBackend` is engine-typed (`setSize`,
  `setClearColor`, `clear`, `renderScene(Scene, Camera)`, `warmup`, `dispose`, `stats`, `api`,
  `pixelRatio`, `exposure`, `shadowsEnabled`). `Application.backendFactory` swaps it.
  `tests/RenderBackend.test.ts` drives a fake backend. `MemoryProfiler` under the fake backend reports
  `renderer: null` and does not throw.
- **Stage 1, resource handles.** "Give `Texture`, `Mesh` and `Material` an opaque, backend-created
  handle instead of a public-by-convention Three.js object. The engine classes stay the source of
  truth … `_internalThreeTexture` and friends become `backend.createTexture(descriptor)`. The backend
  keeps the Three.js object; nothing above it names one."
- **Stage 2:** `Transform._object3D` becomes an engine node type. This is the riskiest stage.
- **Stage 3:** components (`components/`, `rendering/`, `animation/`, `particles/`) stop importing
  `three`. Physics is a separate concern.
- **Stage 4:** a second backend (WebGPU) "with none of the above changed".
- §3 "Why this cannot be done incrementally-in-place": with two ways to reach the GPU, every new
  feature has to pick one, and the `instanceof` checks silently stop matching.

## Facts checked against the code (`a020db6`)

| Fact | Where |
|---|---|
| 39 of the files under `src/engine` import `three`: 9 in `graphics/`, 8 in `components/`, 5 in `physics/`, 5 in `rendering/`, 3 in `postprocessing/`, 2 in `animation/`, plus `Application`, `RenderSettings`, `Scene`, `Transform`, `MemoryProfiler`, `ParticleSystem`, `ScenarioAssets` | `grep -rl "from 'three"` |
| `RenderBackend` is engine-typed. `WebGLRenderBackend` (184 lines) owns `THREE.WebGLRenderer`, sRGB output, ACES tone mapping, `PCFSoftShadowMap`, the viewport rect, the post-processing branch and warmup | `rendering/RenderBackend.ts`, `rendering/WebGLRenderBackend.ts` |
| `_internalThreeRenderer` (`@internal`, not on the interface) is read by `Application` (texture-upload probe ~`:558`, `captureFrame` `:315`, getter `:687`), `MemoryProfiler` `:778` and `Texture2D._ensureKTX2Loader` `:195` | as listed |
| **Texture.** `Texture` builds `new THREE.Texture()` in its constructor (`Texture.ts:173`). It exposes `_internalThreeTexture` (`:190`) and `_setInternalThreeTexture` (`:204`, a swap that notifies referents), plus `_fromThreeTexture` (`:328`). It writes three fields directly: `setOffset`/`setTiling` (`:415`, `:429`), `_syncFilterMode`/`_syncWrapMode`, `_setLinearData` (`:282`), `flipVertically`. `Texture.load` uses `THREE.TextureLoader` (`:447`) | `graphics/Texture.ts` |
| `Texture2D` (954 lines) creates `CanvasTexture` and `THREE.Texture`, runs a `KTX2Loader` singleton whose `detectSupport` takes the renderer through `globalThis.__webengine_application__` (`:187-205`), and has `_wrapThreeTexture`, `_adoptThreeTexture` (in-place re-decode, `:883`), `_threeTextureForUpload` (`:583`) and pixel readback from `threeTex.image` (`:614`, `:628`) | `graphics/Texture2D.ts` |
| `Cubemap` builds `THREE.CubeTexture`s and clones a source texture for the equirectangular path (`:286-288`). Its `_internalThreeTexture` is `CubeTexture \| Texture` (`:455`) | `graphics/Cubemap.ts` |
| `TextureRelease` types its probe as `(texture: THREE.Texture) => boolean`. `Application` builds the probe from `renderer.properties.get(tex).__webglTexture` | `graphics/TextureRelease.ts:23`, `Application.ts:552-566` |
| Code outside `graphics/` that reads `_internalThreeTexture`: `Resources.ts:712`, `SpriteRenderer` (6×), `ParticleSystem:217`, `UIImage` (`.version` `:301`/`:557`, `.image` `:604`), `RenderSettings` (skybox/environment `:246-272`), `MemoryProfiler` (dedupe key `:743`, `:750`), `StandardMaterial:207` | grep |
| **Mesh.** `Mesh` owns `_threeGeometry` (`Mesh.ts:195`) and rebuilds it in `_syncToThree` when `_needsUpdate` is set: attributes `position`, `normal`, `tangent`, `uv`, `uv1`, `color`, index, bounds (`:583-665`). `_internalGeometry` syncs on access (`:161`). `_fromThreeGeometry` (`:1340`) is used by `ScenarioAssets:538` and `Mesh.combine` (`:1513`, through three's merge) | `graphics/Mesh.ts` |
| Code outside `graphics/` that reads `_internalGeometry`: `MeshRenderer:193` and `InstancedMeshRenderer:115`/`:296` | grep |
| **Material.** `Material` owns `_threeMatHandle` (`Material.ts:58`) and creates it in `_createThreeMaterial` (`:692`, Standard/Basic/Lambert/Phong) and `_createShaderMaterial` (`:736`, GLSL from `Shader._source`). It syncs colour/float/texture/uniform (`:558-790`) and copies render state on a shader swap (`_copyRenderState` `:641`). `StandardMaterial` and `UnlitMaterial` write `_threeMatHandle` directly (10 uses) | `graphics/Material.ts`, `StandardMaterial.ts`, `UnlitMaterial.ts` |
| Code outside `graphics/` that reads `_internalThreeMaterial`: `Renderer._syncMaterialToThree`/`_syncMaterialsToThree` (the `instanceof THREE.Mesh` checks, `Renderer.ts:460`, `:484`), `MeshRenderer`, `InstancedMeshRenderer`, `LineRenderer:815` | grep |
| Fallback materials are bare three objects: `Renderer._errorMaterial` (`:645`), `MeshRenderer._defaultMaterial` (`:225`), and a default in `InstancedMeshRenderer` | as listed |
| Components that own their own three render objects (scene graph plus their private geometry and materials): `SpriteRenderer` (`THREE.Sprite`, `SpriteMaterial`), `LineRenderer` (geometry + `MeshBasicMaterial` + `THREE.Mesh`), `ParticleSystem` (GLSL `ShaderMaterial` + `Points`), and the collider raycast proxies (`BoxCollider`/`SphereCollider`/`CapsuleCollider`) | grep `new THREE.` |
| GLB import: `ScenarioAssets` uses `GLTFLoader`, then converts. Geometry is copied into engine arrays (`_fromThreeGeometry`), textures are wrapped live (`_fromThreeTexture`), materials are converted to `StandardMaterial` | `scenario/ScenarioAssets.ts:5`, `:525-600` |
| Post-processing (`PostProcessing`, `BloomEffect`, `VignetteEffect`) is three `EffectComposer` code that takes a `THREE.WebGLRenderer` | `postprocessing/*` |
| `three` is a peer dependency `>=0.160.0`; installed `0.182.0`; `@types/three ^0.182.0`. Standalone bundles three; esm/cjs keep it external | `package.json:39`, `:58` |
| 16 test files white-box these internals: `CubemapFromTexture`, `CustomShader`, `DiagnosticsPolicy`, `LineRendererIntegration`, `MaterialAlpha`, `MaterialShaderSwap`, `MaxSizeScope`, `RenderSettingsSerialization`, `ResourceReload`, `SecondUvSet`, `Serialization`, `TextureColorSpace`, `TextureOrientation`, `TextureReleaseDeferral`, `TextureSwap`, `UI` | grep of `tests/` |
| The isolation rule: no `THREE.*` in any public signature; Three.js only in private/`@internal` code | `WebEngineTS/CLAUDE.md` § Three.js Isolation |
| `scripts/shoot.mjs` drives local Edge through Playwright (borrowed from `virtual-lab/e2e`) with SwiftShader flags and saves a PNG. C6 used it as `node scripts/shoot.mjs <url> <png> 6000`, double-run SHA256 | `scripts/shoot.mjs`, `code-foundations/C6/plan.md` Phase 7 |
| `design/coordinate-check/` (the visual harness N6 waits for) no longer exists | `ls design` |
| **Production content uses none of** `Shader.create`, `PostProcessing`, `BloomEffect`, `VignetteEffect`, `ParticleSystem` or `.ktx2` | grep of `ScenarioCreator/Scenarios/**/*.{ts,json}`: no hits |

`graphify god-nodes` puts none of the resource classes among the top ten (GameObject, Vector3,
SerializedField, …). `graphify affected Texture.ts` (depth 2) reaches `Material`, `Cubemap`,
`Texture2D`, `ShaderSource`, `UIImage`, `MemoryProfiler`, `Renderer`, `StaticBatchingUtility`,
`AssetFiles`, `index.ts`, and the tests `TextureSwap`, `AssetCacheSharing`, `SourceVramParity`,
`ResourceReload`, `CustomShader`, `FormatVersions`, `SharedConstantLeak`, `Serialization`,
`MaterialShaderSwap`, `SceneManagement`. Hub files touched: `Application.ts` (one probe) and none of
the worker hub list (`SceneSerializer`, `GameObject`, `Scene`, `Transform`, `PlayerHost`).

## Planned work N4 must stay compatible with

- **C6** (`code-foundations/C6/plan.md`, `📐`). `RenderTexture extends Texture` owns a
  `THREE.WebGLRenderTarget` (D1: "a handle is N4 stage 1 in a fragment — two GPU paths"). It adds
  `renderScene(scene, camera, target?)` and `readPixels(...)` to `RenderBackend`, engine-typed. Its
  Phase 8 adds a line to this card: "convert `RenderTexture` in stage 1 with the other resources". So
  N4 converts `RenderTexture` too: `createRenderTarget` lives in the factory, and the WebGL target
  branch unwraps it. C6's engine-typed seam methods stay as they are.
- **C2** (`code-foundations/C2/plan.md`, `📐`). Edit mode: `_PlayMode.ts`, `ScriptableBehaviour`,
  `GameObject`, `Application` static API, `enterPlayMode`, `updateEditMode`. It does not touch
  resources. It shares `Application.ts` with N4's one probe change, so merge order matters only for
  conflicts.

## How three's WebGPU path differs (web research, 2026-11)

- **Status.** three is at r187 (2026-10-30). r186 is `three@0.186.0` (2026-09-08). WebGPURenderer
  ships from `three/webgpu` (no build config since r171) and falls back to WebGL 2 by itself. Release
  churn is concentrated there: r187 changed about 80% of its core lines on the WebGPU/TSL side (PMREM
  rebuilt on cube render targets, `CubeUVReflectionMapping` removed, viewport semantics under a bound
  target changed). r183 renamed `PostProcessing` to `RenderPipeline` and stopped
  `WebGLCubeRenderTarget` working with WebGPURenderer (use `CubeRenderTarget`). r186 removed
  `PCFSoftShadowMap` for WebGPURenderer. Some sources still call it experimental. The card's "pin
  three's version (its WebGPU API breaks almost every release)" holds.
- **Initialisation is async.** Call `await renderer.init()` before any render or compute outside
  `setAnimationLoop`. r186 throws "render() called before the backend is initialized".
  `renderAsync`/`computeAsync` are deprecated since r181.
- **Materials.** Built-in materials (`MeshStandardMaterial`, `MeshBasicMaterial`, …) are mapped to
  node materials automatically. **`ShaderMaterial`, `RawShaderMaterial` and `onBeforeCompile` are not
  supported on either of its backends**: they log "not compatible" and render nothing. GLSL has to be
  ported to TSL. Node output is treated as linear and converted at the end.
- **Post-processing.** `EffectComposer` does not run. Use `RenderPipeline` with TSL nodes.
- **Imports.** `three/webgpu` is its own build of the core classes. Mixing `three` and `three/webgpu`
  imports in one bundle produces two class sets. That is exactly the `instanceof`/two-instances hazard
  in `WebEngineTS/CLAUDE.md`. A WebGPU backend therefore needs **every** three import routed through
  one module, and stage 1 is what brings resource imports down to one folder.
- **Browsers.** WebGPU is on by default in Chrome/Edge (desktop; Android 12+ on Qualcomm/ARM since
  121; Linux Intel 144, NVIDIA 147), Safari 26 (macOS/iOS/iPadOS 26 only), and Firefox 141+ on Windows
  and 145+ on Apple-Silicon macOS. **Firefox on Linux and Android: pre-release builds only** (still
  behind a flag as of autumn 2026). Older iOS/macOS have none. The card's "missing on most Linux,
  Firefox Android, Intel Macs" is still right in substance.
- **Not verified by any page I read** (to verify in the WebGPU spike, not assumed):
  `KTX2Loader.detectSupport` with WebGPURenderer, `readRenderTargetPixelsAsync` behaviour,
  `renderer.info` field parity, and WebGPU inside the player's sandboxed opaque-origin iframe.

Sources: utsubo.com "Migrate Three.js to WebGPU (2026)" and "Three.js r186 changelog";
sirocco18.jp "Measuring three.js r187"; myreleasenotes r183; webgpu.com "All major browsers now ship
it"; Wikipedia "WebGPU" (Firefox status as of 2026-08); abratabia.com WebGPU browser support.

## How other engines stage a backend abstraction (from their public source trees)

- **PlayCanvas.** A platform-neutral `Texture`/`VertexBuffer`/`IndexBuffer` holds descriptor and CPU
  data. `GraphicsDevice` creates an `impl` per resource (`createTextureImpl`, …): `WebglTexture` or
  `WebgpuTexture`. The engine-side object stays the source of truth, and upload is lazy at bind time.
  WebGPU was added beside WebGL2 by adding impls, without touching scene code.
- **Babylon.js.** `InternalTexture` wraps an `IHardwareTextureWrapper` (`WebGLHardwareTexture` /
  `WebGPUHardwareTexture`). `ThinEngine`/`AbstractEngine` vs `WebGPUEngine` create them. The same
  pattern applies to buffers and draw wrappers.
- **Bevy/wgpu.** `Handle<Image>` and `Handle<Mesh>` are asset handles. An extract step "prepares" a
  `RenderAsset` (GPU object) per handle, so the main world never sees a GPU object.

The common shape: an opaque handle per resource, **created by the device layer**, a descriptor (plus
CPU data) owned by the engine object, mutations as device calls, and a single place that turns a
handle into the API object. N4 stage 1 adopts this shape with three objects as the impl.

## Decisions (the owner delegates; each with its evidence)

- **D1. Handle shape.** Branded opaque types `TextureHandle`, `MeshHandle`, `MaterialHandle` and
  `RenderTargetHandle`, declared engine-side in `rendering/ResourceHandles.ts` with no readable
  members. The three implementation backs each with a small wrapper object (`{ object: THREE.X }`)
  whose identity is stable for the life of the engine resource, and whose inner object may be replaced
  (LOD re-decode, canvas swap). *Why a wrapper, not the three object cast:* `_setInternalThreeTexture`
  and `_adoptThreeTexture` swap the three object today, and a stable handle keeps that swap inside the
  three layer, as PlayCanvas's impl and Babylon's hardware wrapper do. Cost: one property read, no
  per-frame allocation.
- **D2. Who creates handles.** One internal resource factory per realm, `RenderResources` (interface,
  `rendering/RenderResources.ts`), with one implementation `ThreeResources`
  (`rendering/three/ThreeResources.ts` plus per-type files). It is reached through `Graphics._resources`
  (`rendering/GraphicsResources.ts`), which is lazily the three factory. It exists before any
  `Application`, because textures and meshes are created at import time and in tests without one.
  *Not* a new member on the public `RenderBackend` in stage 1: three's `WebGLRenderer` and
  `WebGPURenderer` consume the same three resource objects, so the frame backend and the resource
  factory do not have to be paired yet. Pairing them is a WebGPU-stage decision.
- **D3. No public API change.** Handles, descriptors, `RenderResources` and the factory stay
  `@internal`. The public `RenderBackend` interface is unchanged by N4 (C6's additions stay as C6
  wrote them). The engine CHANGELOG records an internal change with no pixel change. *Why:* exposing a
  resource API to custom backends would freeze its shape before the WebGPU spike has tested it.
- **D4. What "exactly one way" means and how it is enforced.** For each resource type: (a) exactly
  one construction site of its three objects, inside `rendering/three/`; (b) exactly one way to turn
  a handle into a three object, `ThreeResources.textureOf/meshOf/materialOf/targetOf`, callable only
  from `rendering/three/` and from an explicit allowlist of stage-2/3 files (the scene graph and
  component render objects); (c) no engine resource class writes a three field. A committed guard
  test, `tests/ResourceIsolation.test.ts`, scans `src/engine` for forbidden patterns: `new THREE.` of
  texture/geometry/material/render-target classes, `TextureLoader`/`KTX2Loader`/`CanvasTexture`, and
  the old accessor names. It fails on any hit outside the allowed files, and its allowlist only
  shrinks, phase by phase. A phase moves one *mechanism* for a resource type across **all** of that
  type's classes, so no phase leaves one class creating through the factory while a sibling still
  does `new THREE.*`. During a type's conversion, the old `@internal` getter (`_internalThreeTexture`
  and so on) stays as a one-line unwrap: it is the single read path until the consumer phase deletes
  it.
- **D5. The stage merges whole.** All phases land on one branch `N4-…` and merge to `master` once,
  after the final review. That is the card's "never in fragments" and PLAN §1.4's "do not start it
  in fragments": `master` never holds a half-converted state.
- **D6. Component-private render objects stay for stage 3.** `SpriteRenderer`, `LineRenderer`,
  `ParticleSystem` and the collider raycast proxies create a scene node together with a private
  geometry/material that nothing else shares. They are part of their component's render object
  (stage 2/3), not engine resources. They stay allowlisted, with the reason in the guard test, and
  they unwrap engine textures only through `textureOf`. *Exception:* the shared fallback materials
  (`Renderer._errorMaterial`, `MeshRenderer._defaultMaterial`, `InstancedMeshRenderer`'s default) are
  real materials and move to the factory with the materials.
- **D7. Physics is out.** The collider proxies are raycast geometry for `Physics.raycast`, never
  drawn, and N3 may replace them. Allowlisted.
- **D8. Post-processing, the scene graph, cameras and lights are out** (stages 2/3 and the WebGPU
  stage). Allowlisted. `RenderSettings` may unwrap the skybox/environment texture through `textureOf`.
- **D9. N4 depends on C6 and C2 being merged.** C6 adds `RenderTexture`, a fifth resource class that
  stage 1 must convert with the textures (C6 D1 asks for exactly that), and touches
  `Texture`/`RenderBackend`/`Application`. C2 touches `Application`. Building N4 before them would
  mean re-planning the texture phases or converting `RenderTexture` in a fragment afterwards. If C6 is
  ever dropped, the `RenderTexture` items in Phases 3–5 fall away; nothing else changes.
- **D10. Engine-side state is the source of truth.** Offset, tiling, filter, wrap, colour space, flip,
  the CPU image source (canvas/bitmap) and a content version counter live on the engine `Texture`,
  and the factory applies them. `UIImage` reads the engine's source and version counter, not three's
  `.image`/`.version`. The counter must increment on exactly the events where three's `version`
  increments today (pinned by the characterization test, D12).
- **D11. Import paths are three-layer operations.** `GLTFLoader`, `TextureLoader` and `KTX2Loader`
  produce three objects, so they live in (or call into) `rendering/three/`. An imported three texture
  enters the engine only through `ThreeResources.adoptTexture(threeTex) → TextureHandle`. Geometry
  import (`_fromThreeGeometry`) and `Mesh.combine`'s merge move to `rendering/three/ThreeMeshImport.ts`
  **with the same algorithm** (same arrays, same index width), so imported and combined meshes are
  byte-identical. `ScenarioAssets` keeps its scene conversion (stage 2/3) and calls the import
  functions.
- **D12. Pixels unchanged is proven three ways.** (a) A characterization test written first, on the
  base: `tests/ResourceCharacterization.test.ts`, with committed vitest snapshots of every relevant
  field of the three objects that each public creation path produces (textures: colorSpace, flipY,
  filters, wraps, offset/repeat, mipmaps, anisotropy, format/type, mapping, premultiplyAlpha,
  version; meshes: attribute arrays, item sizes, index array type, groups, bounds; materials: type,
  colour/emissive/metalness/roughness/maps/side/transparent/depthWrite/uniform keys). Later phases
  must not update the snapshots (`-u` is forbidden). Only the access path in the test changes, through
  the test helper. (b) The visual suite (D13) before and after every Full-gate phase gives identical
  SHA256. (c) Full-gate review re-runs both.
- **D13. A committed visual suite.** `scripts/visual/` holds a page plus a runner over
  `scripts/shoot.mjs`: fixed 800×600, pixel ratio 1, time frozen, one scene per query. The runner
  writes PNGs to the gitignored `shoot.local/` and prints `scene sha256` lines. The suite is committed
  (unlike C6's scratch page) because every resource phase needs the same scenes and N6 is blocked on
  a visual harness. Baselines are machine-specific, so they live in the task notes, not in the repo.
- **D14. Tests migrate their access path only.** The 16 white-box test files reach three objects
  through one helper, `tests/support/three.ts` (`threeTexture(t)`, `threeGeometry(m)`,
  `threeMaterial(m)`). It wraps `ThreeResources.*Of`. No assertion is removed, loosened or changed in
  value, and each touched test is listed in the phase notes.
- **D15. three's version is not changed in stage 1.** Pinning to an exact version, and the upgrade to
  ≥ r186 that WebGPU needs, is the first step of the WebGPU task (separate pixel-checked commit). A
  pin now would change the peer range every consumer resolves, for no stage-1 benefit.
- **D16. KTX2 support detection** moves with the KTX2 loader into `rendering/three/ThreeTextures.ts`.
  It reads the renderer through the existing `_internalThreeRenderer` route, now confined to that
  file. The upload probe becomes an `@internal` method on `WebGLRenderBackend`,
  `_isTextureUploaded(handle)`, which `Application` calls through optional chaining as it reaches
  `_internalThreeRenderer` today. `TextureRelease`'s probe type becomes
  `(handle: TextureHandle) => boolean`.
- **D17. KTX2 visual coverage is conditional.** If a `.ktx2` asset and the basis transcoder are present
  in the worker's worktrees (`../virtual-lab/frontend/...`), the suite includes a KTX2 scene.
  Otherwise the build notes record "KTX2 not covered visually" and the unit tests plus the
  characterization snapshot of the KTX2 wrap path cover it.
- **D18. `Mesh.combine` result and index width are unchanged.** The `Uint16` index below 65,536
  vertices and `Uint32` above, and `_estimateVramBytes`, stay as they are (G2 measurements and the
  MemoryProfiler figures must stay comparable).

## Go/no-go for the WebGPU stage (a separate task after N4)

**Go only when all of these hold:**
1. N4 stage 1 is merged, and the guard test lists no resource class outside `rendering/three/`.
2. A spike branch pins three to one exact version ≥ r186 (devDependency, plus `three/webgpu` as the
   single import entry for the WebGPU bundle), and the WebGL2 visual suite is identical after the
   upgrade, or every difference is explained and accepted per scene.
3. Every GPU program the engine ships has a TSL port, or a declared "WebGL2-only" flag that makes
   `Application` fall back to the WebGL2 backend when a scene uses it: custom `Shader` (GLSL
   `ShaderMaterial`), `ParticleSystem`, `BloomEffect`/`VignetteEffect` (`EffectComposer` →
   `RenderPipeline`), `PCFSoftShadowMap` → `PCFShadowMap`. Production content uses none of them
   today, so the fallback costs content nothing.
4. The spike's `WebGPURenderBackend` behind `Application.backendFactory` (async `init()` before the
   first frame) renders the visual suite **within a perceptual tolerance** (≤ 0.5% of pixels differ by
   more than 2/255 per channel; byte identity is not expected across APIs). It also passes
   `npm test`, the player smoke in Chromium, and a WebGPU check inside the player's sandboxed iframe.
5. A measured gain on the benchmark harness: CPU ms/frame or frame time at least 20% better on at
   least one draw-call-heavy scene, and no scene worse than 5%, on the owner's target device classes.
   Owner decision #4 (delegated): Intel UHD Windows laptops, Chromebooks, Android tablets. The
   measurement is an owner-hardware row like V4.
6. Bundle: the WebGPU backend ships as a separately loaded file (the N3 Rapier pattern), so the
   standalone's 450,000 B gzip budget (measured 393,125 B) is not spent by WebGL users.

**No-go** (any criterion fails): stop after stage 1. Stage 1 still has value: one folder of three
resource code, a single import path for a future three upgrade, and the visual suite.
**Default switch:** WebGL2 stays the default. WebGPU is opt-in per host (`Application.backendFactory`
or a player option) until platform telemetry (R9, `🔒`) can show WebGPU adapters on at least 95% of
student sessions. The browser data above (no Firefox Linux/Android, Safari only on 26, Android 12+
Qualcomm/ARM only) says that will not happen soon.

## Follow-up rows (written by the final phase as `⬜`, repo E)

- **N4b** WebGPU spike under the go/no-go criteria above (Opus design; depends on N4).
- **N4c** Render adapter stage 2: engine scene nodes under `Transform` (Opus; depends on N4).
- **N4d** Stage 3: component render objects (`SpriteRenderer`, `LineRenderer`, `ParticleSystem`,
  fallbacks) through the factory; GLSL `ShaderMaterial` users listed for TSL (depends on N4c).
- **N6 note**: `scripts/visual/` exists now; N6's "visual harness first" can build on it.
