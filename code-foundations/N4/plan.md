# Plan: N4 — Render adapter stage 1: resource handles (WebGPU gated after it)
**Created:** 2026-11-11 (Claude, architect lane)
**Status:** ready
**Complexity:** complex
**Review cadence:** 1
**Check-ins:** quiet
---
## Context
Every engine resource class (`Texture`, `Texture2D`, `Cubemap`, C6's `RenderTexture`, `Mesh`,
`Material`, `StandardMaterial`, `UnlitMaterial`) owns a live Three.js object, and code all over the
engine reaches into it. That makes a second graphics backend a rewrite. Stage 1 of the render-adapter
staging (`git show a3fe342^:design/render-adapter-plan.md`, deleted, do not restore) gives each
resource an opaque handle created by one internal factory in `rendering/three/`. After stage 1,
nothing above that folder creates, mutates or names a three texture, geometry or material, except the
allowlisted stage-2/3 files that unwrap a handle through one function. WebGPU is **not** built here;
it is a later task gated by the go/no-go criteria in the research. Card: `tasks/E-growth.md` § N4.
Research and every decision with its evidence: `code-foundations/N4/research.md` — **read it first;
its Decisions D1–D18 are binding.**

**Success criteria:**
1. Each resource type has exactly one construction site of its three objects (inside
   `src/engine/core/rendering/three/`) and one unwrap function (`ThreeResources.textureOf/meshOf/
   materialOf/targetOf`). `tests/ResourceIsolation.test.ts` enforces this against a final allowlist
   of stage-2/3 files only.
2. No engine resource class imports `three` (`graphics/*.ts` has no `from "three"`).
3. Pixels unchanged: the visual suite gives the same SHA256 for every scene on the base and on the
   branch (double-run pairs identical), and the characterization snapshots are unchanged.
4. No public API change: the `dist/WebEngineTS.d.ts` public surface is identical to the base except
   for `@internal`-stripped members; no `THREE` in a public signature; `RenderBackend` unchanged by
   N4.
5. No per-frame allocation added; `npm run size` within budget and within +2 KB gzip of the base.
6. `npm run typecheck`, `npm test`, `npm run build` green; the stage merges to `master` once (D5).

## Constraints
- Engine only (`WebEngineTS`) plus this task's `.claude-shared` notes and rows. No consumer changes.
- **Depends on C6 and C2 merged (D9).** Before Phase 1, sync and re-verify every `file:line` in the
  research against the synced tree. Record the new base commit in the notes.
- One branch, one merge (D5). Phases are commits on the branch; nothing merges early.
- Never update the characterization snapshots (`vitest -u` forbidden after Phase 1). Never weaken,
  skip or delete a test. Tests change only their access path, through `tests/support/three.ts` (D14).
- No change to three's version or peer range (D15). No change to the public `RenderBackend` (D3).
- Out of scope (stay allowlisted, D6–D8): scene graph (`Transform`, `Scene`, `Camera`, lights), the
  component render objects of `SpriteRenderer`, `LineRenderer` and `ParticleSystem`, collider
  proxies, post-processing, `ShaderWarmup`, and `WebGLRenderBackend`'s frame code.
- Scratch PNGs only under the gitignored `shoot.local/`. Anything this plan does not answer is a
  question: park the task (ATTENTION), do not guess.

---
## Implementation Phases

### Phase 1: Characterization snapshots and the visual suite (on the base, no src change)
**Skills:** code-foundations:welc-legacy-code, code-foundations:cc-quality-practices
**Model:** sonnet
**Gate:** Standard
**Depends on:** none
**File scope:** tests/ResourceCharacterization.test.ts (new), tests/__snapshots__/ResourceCharacterization.test.ts.snap (new), tests/support/three.ts (new), scripts/visual/suite.html (new), scripts/visual/scenes.js (new), scripts/visual/run.mjs (new)

**Goal:** pin what the three objects look like today, and what the screen looks like today, before
anything moves.

**Scope:**
- IN: `tests/support/three.ts` with `threeTexture(t)`, `threeGeometry(m)`, `threeMaterial(m)`
  (today: the existing internal getters; later phases repoint only this file).
  `ResourceCharacterization.test.ts`: one `toMatchSnapshot()` per creation path, over a plain-object
  projection of the fields listed in research D12. Paths:
  - textures: `new Texture()`, `Texture2D` (size/format/mipChain/linear variants, `SetPixels`+`Apply`,
    `filterMode` × 3, `wrapMode` × 3, `setOffset`/`setTiling`, `flipVertically`), `_fromThreeTexture`
    of a given three texture, `Cubemap` 6-face, `Cubemap.fromEquirectangular(Texture2D)`,
    `RenderTexture` (C6) ARGB32/ARGBHalf/depth 0/AA 4, and the KTX2 wrap path with a stubbed loader
    result;
  - meshes: every `Mesh.create*` primitive, a mesh with uv2/colors/tangents, a >65,535-vertex mesh
    (Uint32 index), submeshes, `Mesh.combine` of two primitives, `_fromThreeGeometry` of a three box;
  - materials: `StandardMaterial` with every slot and scalar set, `UnlitMaterial`, Lambert/Phong
    shaders, a custom `Shader` with uniforms of every value type, a shader swap (render state kept),
    `setColor`/`setFloat`/`setTexture` by name.
  Also `version` counters after a fixed sequence of mutations.
- IN: the visual suite (D13). `run.mjs` serves the repo root with Node `http`, runs
  `node scripts/shoot.mjs <url> shoot.local/<scene>-<n>.png 6000` twice per scene and prints
  `<scene> <sha-run1> <sha-run2>`; `--compare <file>` exits 1 on any mismatch with that file. The
  page loads `dist/WebEngineTS.standalone.js`, 800×600, `pixelRatio 1`, `Time.timeScale = 0` before
  the first frame. Scenes: `standard` (lit primitives, albedo/normal/metallic/occlusion/emission maps
  from generated canvases, directional shadow), `unlit` (alpha, render queue, tiling/offset),
  `custom-shader` (GLSL `Shader` with a texture uniform), `skybox-cube`, `skybox-equirect` (with
  environment reflections), `texture2d` (SetPixels, Point/Bilinear/Trilinear, Clamp/Mirror),
  `instanced-batched` (`InstancedMeshRenderer`, `StaticBatchingUtility`, multi-material submeshes, a
  mesh whose vertices are edited after frame 1), `sprites-lines-ui` (`SpriteRenderer`, `LineRenderer`,
  `UIImage`), `swap` (texture re-decode via `_adoptThreeTexture`'s public trigger, material shader
  swap), `render-texture` (C6 target sampled by a quad), `glb` (a `.glb` copied from
  `../ScenarioCreator/Scenarios/**` into `shoot.local/`; skipped with a note if none), `ktx2` (D17:
  conditional).
- OUT: any change under `src/`.

**Edge cases:** a scene whose double run differs on the base is non-deterministic. Fix the page (seed,
frame count) or drop it from the SHA set with the reason in the notes. Never leave it in.

**Done when:**
- [ ] DW-1.1: `npm test` green with the new characterization file. Snapshot file committed; snapshot count recorded in the notes.
- [ ] DW-1.2: `node scripts/visual/run.mjs` on this commit: every scene's two SHAs are equal. The list is saved as `code-foundations/N4/visual-baseline.txt` (in `.claude-shared`, not the engine repo), along with the engine commit, the Edge version and which conditional scenes ran.
- [ ] DW-1.3: `git diff --stat` of the phase shows no `src/` file.

### Phase 2: Contracts — handle types, the factory interface, the realm accessor, the guard
**Skills:** code-foundations:aposd-designing-deep-modules, code-foundations:ca-architecture-boundaries
**Model:** sonnet
**Gate:** Standard
**Depends on:** Phase 1
**File scope:** src/engine/core/rendering/ResourceHandles.ts (new), src/engine/core/rendering/RenderResources.ts (new), src/engine/core/rendering/GraphicsResources.ts (new), src/engine/core/rendering/three/ThreeResources.ts (new, facade with unwrappers only), tests/ResourceIsolation.test.ts (new), tests/ResourceHandles.test.ts (new)

**Goal:** the shapes every later phase fills, plus a guard that measures today's offenders.

**Scope:**
- IN:
  - `ResourceHandles.ts`: branded `TextureHandle`, `MeshHandle`, `MaterialHandle`,
    `RenderTargetHandle` (`interface X { readonly __brand: unique symbol }`), all `@internal`, and the
    engine-typed descriptors `TextureSampler` (filter, wrap, anisotropy), `TextureTransform` (offset,
    repeat), `TextureColor` (`"srgb" | "linear"`), `MeshData` (Float32Arrays, `Uint16Array |
    Uint32Array` index, groups, bounds), `MaterialKind` (Standard/Basic/Lambert/Phong/custom source).
  - `RenderResources.ts`: the interface, with method signatures only. Each later phase adds its type's
    methods to the interface and the implementation in the same phase, so no unused path exists early.
  - `GraphicsResources.ts`: `Graphics._resources(): RenderResources`, lazily
    `ThreeResources.instance`, plus `@internal _setForTests(r)` (throws if any handle is live).
  - `three/ThreeResources.ts`: the class shell, the wrapper types (`{ object }`, D1) and the unwrap
    statics, still unused.
  - `ResourceIsolation.test.ts`: walks `src/engine/**/*.ts` and fails on any match of the forbidden
    patterns (D4) outside `core/rendering/three/**` and an `ALLOWLIST` map
    `file → { reason, stage }`. Seed the allowlist with **today's** offenders, so the test is green now.
    A second assertion checks that every allowlisted file still matches at least one pattern, so a
    stale entry fails and the list must shrink when code moves.
- OUT: moving any resource.

**Done when:**
- [ ] DW-2.1: the guard is green, and its allowlist equals the grep inventory in the research facts (diff pasted in the notes). Adding `new THREE.Texture()` to a non-allowlisted file in a scratch edit makes it fail (shown, then reverted).
- [ ] DW-2.2: `ResourceHandles.test.ts`: `Graphics._resources()` returns the same instance twice, and `_setForTests` throws while a handle is live (stub). Typecheck shows a `TextureHandle` is not assignable from `{}` or from a three texture (`// @ts-expect-error` lines).
- [ ] DW-2.3: no public export added (`src/engine/index.ts` untouched); `npm run build` green.

### Phase 3: Textures — every construction through the factory
**Skills:** code-foundations:cc-refactoring-guidance, code-foundations:cc-defensive-programming
**Model:** sonnet
**Gate:** Full
**Depends on:** Phase 2
**File scope:** src/engine/core/rendering/three/ThreeTextures.ts (new), src/engine/core/rendering/three/ThreeResources.ts, src/engine/core/rendering/RenderResources.ts, src/engine/core/graphics/Texture.ts, src/engine/core/graphics/Texture2D.ts, src/engine/core/graphics/Cubemap.ts, src/engine/core/graphics/RenderTexture.ts, src/engine/core/scenario/ScenarioAssets.ts (`_fromThreeTexture` call sites only), tests/ResourceIsolation.test.ts (allowlist shrink), tests/support/three.ts, tests/ThreeTextures.test.ts (new)

**Goal:** no texture class constructs a three object; each holds a `TextureHandle` (or a
`RenderTargetHandle`).

**Scope:**
- IN:
  - Factory methods `createTexture`, `createCanvasTexture(canvas)`, `createCubeTexture(faces)`,
    `cloneForEquirect(handle)`, `createRenderTarget(desc)`, `adoptTexture(threeTex)` (the import
    door, D11), `replaceTextureObject(handle, from: handle)` (the swap behind
    `_setInternalThreeTexture`/`_adoptThreeTexture`), `loadTextureUrl(url, onLoad)`
    (`THREE.TextureLoader`) and `loadKtx2(bytes)` (`KTX2Loader` singleton and its `detectSupport`,
    D16), and `destroyTexture(handle)` (dispose, ImageBitmap `close()` exactly as `Texture.onDestroy`
    does today).
  - Each class stores `_handle`. `_internalThreeTexture` (and `Cubemap`'s, and RenderTexture's
    `_internalThreeRenderTarget`) become one-line unwraps (`ThreeResources.textureOf(this._handle)`),
    the single read path until Phase 5. Construction order, defaults and the `_skipCanvasAllocation`
    trick are preserved exactly.
- OUT: state writes (Phase 4), consumers (Phase 5).

**Edge cases:** a swap while materials hold the texture (referents notified once, as today); destroy
after swap disposes the current object only; the KTX2 loader created before any `Application` warns
exactly as today; a `RenderTexture` released and re-created gets a new inner object, same handle.

**Done when:**
- [ ] DW-3.1: characterization snapshots unchanged (`npm test` with no `-u`; the snapshot file is not in the phase diff).
- [ ] DW-3.2: `ThreeTextures.test.ts`: handle identity is stable across `replaceTextureObject`; the old inner object is disposed exactly once (spy); `destroyTexture` closes an ImageBitmap source once.
- [ ] DW-3.3: guard allowlist no longer lists `Texture.ts`, `Texture2D.ts`, `Cubemap.ts` or `RenderTexture.ts` for construction patterns; `grep -n "new THREE\.\|Loader(" src/engine/core/graphics/{Texture,Texture2D,Cubemap,RenderTexture}.ts` is empty (output pasted).
- [ ] DW-3.4: visual suite `--compare visual-baseline.txt` passes every scene.

### Phase 4: Textures — engine-side state, applied through the factory
**Skills:** code-foundations:cc-refactoring-guidance, code-foundations:cc-defensive-programming
**Model:** sonnet
**Gate:** Full
**Depends on:** Phase 3
**File scope:** src/engine/core/rendering/three/ThreeTextures.ts, src/engine/core/rendering/RenderResources.ts, src/engine/core/graphics/Texture.ts, src/engine/core/graphics/Texture2D.ts, src/engine/core/graphics/Cubemap.ts, src/engine/core/graphics/RenderTexture.ts, tests/ThreeTextures.test.ts, tests/TextureState.test.ts (new)

**Goal:** texture classes hold their own state and never write a three field (D10).

**Scope:**
- IN:
  - Engine fields for offset, tiling, flip, colour space (`_setLinearData`), a CPU source
    (`_source`: canvas/bitmap/image or null) and `_contentVersion`.
  - Factory calls `setTextureSampler`, `setTextureTransform`, `setTextureColor`, `setTextureFlip`,
    `markTextureDirty(handle)` (= three `needsUpdate = true`, which bumps three's `version`).
    `_contentVersion` increments exactly where `markTextureDirty` is called.
  - `Texture2D` readback reads `_source`, not `threeTex.image`.
  - `_threeTextureForUpload` → `_handleForUpload(): TextureHandle | null` on `Texture2D`/`Cubemap`
    (TextureRelease uses it in Phase 5).
  - Getters return engine fields. Today's getters that read three (e.g. `filterMode` derived from
    three) must return the same values: covered by the snapshot and by `TextureState.test.ts`.
- OUT: consumers.

**Edge cases:** a property set before the swap carries over to the new inner object (today
`_setInternalThreeTexture` re-syncs filter and wrap; it must now re-apply every engine field, and
this must not change pixels: the snapshot of a swapped texture decides); a `RenderTexture` ignores
`_setLinearData` (C6).

**Done when:**
- [ ] DW-4.1: characterization snapshots unchanged, including the `version` counters after the fixed mutation sequence.
- [ ] DW-4.2: `TextureState.test.ts`: for each mutation API, `_contentVersion` and three `version` advance together over a scripted sequence (equal deltas).
- [ ] DW-4.3: `grep -n "\._internalThreeTexture\.\|threeTex\.\|\.image\b" src/engine/core/graphics/{Texture,Texture2D,Cubemap,RenderTexture}.ts` shows no field write (output pasted, every remaining hit explained).
- [ ] DW-4.4: visual suite passes every scene.

### Phase 5: Textures — consumers unwrap or read engine state; delete the old accessors
**Skills:** code-foundations:cc-refactoring-guidance, code-foundations:aposd-verifying-correctness
**Model:** sonnet
**Gate:** Full
**Depends on:** Phase 4
**File scope:** src/engine/core/graphics/Texture.ts, src/engine/core/graphics/Texture2D.ts, src/engine/core/graphics/Cubemap.ts, src/engine/core/graphics/RenderTexture.ts, src/engine/core/graphics/TextureRelease.ts, src/engine/core/graphics/_TextureMemory.ts, src/engine/core/graphics/Material.ts (texture slot sync only), src/engine/core/graphics/StandardMaterial.ts (`:207` only), src/engine/core/ui/UIImage.ts, src/engine/core/RenderSettings.ts, src/engine/core/assets/Resources.ts, src/engine/core/diagnostics/MemoryProfiler.ts, src/engine/core/components/SpriteRenderer.ts, src/engine/core/particles/ParticleSystem.ts, src/engine/core/Application.ts (upload probe only), src/engine/core/rendering/WebGLRenderBackend.ts (`_isTextureUploaded`, the C6 target branch unwrap only), tests/ResourceIsolation.test.ts, tests/support/three.ts, the texture white-box tests (access path only: CubemapFromTexture, MaxSizeScope, RenderSettingsSerialization, ResourceReload, TextureColorSpace, TextureOrientation, TextureReleaseDeferral, TextureSwap, UI, DiagnosticsPolicy, Serialization)

**Goal:** `_internalThreeTexture`, `_setInternalThreeTexture`, `_fromThreeTexture`,
`_adoptThreeTexture` (three-typed form) and `_threeTextureForUpload` are gone; every reader uses the
handle.

**Scope:**
- IN:
  - `UIImage` reads `_source`/`_contentVersion` (D10). `MemoryProfiler` dedupes by handle.
    `TextureRelease` uses the probe `(h: TextureHandle) => boolean` with `_handleForUpload`
    (D16), and `Application` builds the probe from `backend._isTextureUploaded?.bind(backend)`.
  - `RenderSettings`, `SpriteRenderer`, `ParticleSystem`, `Material`/`StandardMaterial` texture slots
    and `Resources:712` call `ThreeResources.textureOf(handle)` (allowlisted with reason, or inside
    the material layer until Phase 7 moves it).
  - The C6 target branch in `WebGLRenderBackend` unwraps via `targetOf`.
  - Tests switch to `tests/support/three.ts`; the notes list each file and confirm the assertions are
    untouched (`git diff -U0 tests/` reviewed: only access expressions change).
- OUT: meshes and materials.

**Edge cases:** `UIImage`'s cache hash must change on exactly the frames it changed before
(UI tests + `sprites-lines-ui` scene); the MemoryProfiler figures `liveTextures`,
`estimatedTextureVramBytes`, `textureFormats` and `renderTextures` must be identical on the
`standard` and `render-texture` scenes (log `MemoryProfiler.snapshot()` JSON before/after, paste the
diff, expected empty); the fake-backend MemoryProfiler pin (stage 0) still holds.

**Done when:**
- [ ] DW-5.1: `grep -rn "_internalThreeTexture\|_setInternalThreeTexture\|_fromThreeTexture\|_threeTextureForUpload" src tests` is empty.
- [ ] DW-5.2: characterization snapshots unchanged; full `npm test` green.
- [ ] DW-5.3: MemoryProfiler snapshot JSON identical before/after on two scenes (diff pasted).
- [ ] DW-5.4: guard allowlist has no texture entry except stage-2/3 files that call `textureOf`, each with its reason.
- [ ] DW-5.5: visual suite passes every scene.

### Phase 6: Meshes — handle, upload, import, consumers
**Skills:** code-foundations:cc-refactoring-guidance, code-foundations:cc-defensive-programming
**Model:** sonnet
**Gate:** Full
**Depends on:** Phase 5
**File scope:** src/engine/core/rendering/three/ThreeMeshes.ts (new), src/engine/core/rendering/three/ThreeMeshImport.ts (new), src/engine/core/rendering/three/ThreeResources.ts, src/engine/core/rendering/RenderResources.ts, src/engine/core/graphics/Mesh.ts, src/engine/core/rendering/MeshRenderer.ts (`_syncGeometry` only), src/engine/core/rendering/InstancedMeshRenderer.ts (geometry reads only), src/engine/core/scenario/ScenarioAssets.ts (`_fromThreeGeometry` call only), src/engine/core/animation/AnimationClip.ts (comment only, if it names the old function), tests/ResourceIsolation.test.ts, tests/support/three.ts, tests/SecondUvSet.test.ts and other mesh white-box tests (access path only), tests/ThreeMeshes.test.ts (new)

**Goal:** `Mesh` holds a `MeshHandle`; geometry is built only in `ThreeMeshes`.

**Scope:**
- IN:
  - `createMesh`, `uploadMesh(handle, MeshData)` (the body of today's `_syncToThree`, same attribute
    names `position/normal/tangent/uv/uv1/color`, same index width rule, `computeBoundingBox/Sphere`),
    and `destroyMesh`.
  - `Mesh._handleForDraw()` flushes a pending upload, then returns the handle (sync-on-access kept).
  - `ThreeMeshImport.meshFromGeometry` (old `_fromThreeGeometry`, same algorithm) and
    `ThreeMeshImport.combine` (`Mesh.combine`'s merge, same algorithm, D11/D18).
  - Renderers use `ThreeResources.meshOf(mesh._handleForDraw())`. Delete `_internalGeometry` and
    `_fromThreeGeometry`. `_estimateVramBytes` unchanged.
- OUT: materials.

**Edge cases:** vertices edited after first draw (the `instanced-batched` scene covers it); a mesh
destroyed while a renderer still references it (no throw on the next frame, as today); an empty mesh;
>65,535 vertices.

**Done when:**
- [ ] DW-6.1: characterization snapshots unchanged (mesh section, incl. combine and import).
- [ ] DW-6.2: `ThreeMeshes.test.ts`: a second `uploadMesh` disposes the previous geometry once; handle stable; `destroyMesh` disposes once.
- [ ] DW-6.3: `grep -rn "_internalGeometry\|_fromThreeGeometry\|_threeGeometry" src tests` empty; `Mesh.ts` has no `from "three"`.
- [ ] DW-6.4: visual suite passes every scene.

### Phase 7: Materials — base class creation and property sync
**Skills:** code-foundations:cc-refactoring-guidance, code-foundations:cc-defensive-programming
**Model:** sonnet
**Gate:** Full
**Depends on:** Phase 6
**File scope:** src/engine/core/rendering/three/ThreeMaterials.ts (new), src/engine/core/rendering/three/ThreeResources.ts, src/engine/core/rendering/RenderResources.ts, src/engine/core/graphics/Material.ts, tests/ResourceIsolation.test.ts, tests/ThreeMaterials.test.ts (new)

**Goal:** `Material` holds a `MaterialHandle`; creation, shader swap and generic property sync live in
`ThreeMaterials`.

**Scope:**
- IN:
  - `createMaterial(kind | source)` (old `_createThreeMaterial`/`_createShaderMaterial` with identical
    constructor arguments), `swapMaterialShader(handle, kind | source)` (`_copyRenderState` inside),
    `setMaterialColor/Float/Int/Vector/Matrix/Texture(handle, name, engineValue)` (the old
    `_sync*ToThree` and `_syncUniform`, engine-typed in, three inside), `setRenderQueue`, and
    `destroyMaterial`.
  - `_threeMatHandle` becomes a `protected get` unwrap (the single read path for the subclasses until
    Phase 8). `_internalThreeMaterial` stays as an unwrap until Phase 8.
- OUT: subclasses, fallback materials, renderers.

**Edge cases:** a uniform declared after creation (today it has nowhere to go: keep the same
behaviour, warn the same); a texture swapped while assigned (`_onTextureSwapped` re-points through
the factory); `clone()` and `copyPropertiesFromMaterial` produce the same snapshots.

**Done when:**
- [ ] DW-7.1: characterization snapshots unchanged (material section, incl. shader swap and custom shader).
- [ ] DW-7.2: `ThreeMaterials.test.ts`: each `set*` with each engine value type yields the same three state as the old path (table-driven, compared with the snapshot projection).
- [ ] DW-7.3: `Material.ts` has no `new THREE.` and no three field write (grep pasted).
- [ ] DW-7.4: visual suite passes every scene (`custom-shader` and `swap` especially).

### Phase 8: Materials — subclasses, fallbacks, renderers; delete the old accessors
**Skills:** code-foundations:cc-refactoring-guidance, code-foundations:aposd-verifying-correctness
**Model:** sonnet
**Gate:** Full
**Depends on:** Phase 7
**File scope:** src/engine/core/graphics/Material.ts, src/engine/core/graphics/StandardMaterial.ts, src/engine/core/graphics/UnlitMaterial.ts, src/engine/core/rendering/three/ThreeMaterials.ts, src/engine/core/rendering/Renderer.ts (material sync + `_errorMaterial` only), src/engine/core/rendering/MeshRenderer.ts (`_defaultMaterial` + material sync only), src/engine/core/rendering/InstancedMeshRenderer.ts (default material + material reads only), src/engine/core/components/LineRenderer.ts (`:815` read only), tests/ResourceIsolation.test.ts, tests/support/three.ts, the material white-box tests (access path only: CustomShader, MaterialAlpha, MaterialShaderSwap, LineRendererIntegration)

**Goal:** no material state is written outside `ThreeMaterials`; the shared fallbacks are factory
materials.

**Scope:**
- IN:
  - `StandardMaterial`/`UnlitMaterial` call `setMaterial*` instead of writing `_threeMatHandle`.
  - The fallbacks become lazily created engine-internal `MaterialHandle`s from the factory with the
    same constructor arguments (`0xffffff` standard; the error material's exact options). D6.
  - `Renderer._syncMaterialToThree`/`_syncMaterialsToThree` keep their `instanceof THREE.Mesh`
    checks (scene graph, stage 2) and assign `ThreeResources.materialOf(handle)`.
  - Delete `_internalThreeMaterial` and the `_threeMatHandle` getter.
- OUT: `SpriteRenderer`/`LineRenderer`/`ParticleSystem` private materials (D6, allowlisted).

**Edge cases:** multi-material arrays; a renderer with no material shows the error material; a
material destroyed while assigned.

**Done when:**
- [ ] DW-8.1: `grep -rn "_internalThreeMaterial\|_threeMatHandle" src tests` empty; `graphics/*.ts` has no `from "three"` (success criterion 2; grep pasted).
- [ ] DW-8.2: characterization snapshots unchanged; full `npm test` green.
- [ ] DW-8.3: visual suite passes every scene.

### Phase 9: Seal and adversarial review
**Skills:** code-foundations:aposd-verifying-correctness, code-foundations:cc-quality-practices, code-foundations:performance-optimization
**Model:** sonnet
**Gate:** Full
**Depends on:** Phase 8
**File scope:** tests/ResourceIsolation.test.ts (final allowlist), tests/ResourceLifecycle.test.ts (new, for any bug found), any src file of Phases 3–8 (fixes only, each with its regression test)

**Goal:** prove there is exactly one way, nothing leaks, nothing got slower, and the public surface
did not move.

**Scope:**
- IN:
  - Final allowlist: only stage-2/3 files (scene graph, component render objects, physics proxies,
    post-processing, `WebGLRenderBackend`, `ShaderWarmup`, `ScenarioAssets` scene conversion), each
    entry `{ reason, stage }`.
  - Public surface: build the base and the branch (`git archive <base> | tar -x -C <tmp>`, `npm ci`,
    `npm run build`), diff `dist/WebEngineTS.d.ts`. Expected: empty, or only `@internal` additions
    that the d.ts strips (pasted).
  - Adversarial: create/destroy 1,000 textures, meshes and materials in a loop with the
    `RenderBackend` fake and with the real page (`?stress` scene), and compare `renderer.info.memory`
    geometries/textures before and after (must return to the start value). Swap textures during a
    frame. Destroy a mesh that a live renderer uses. Re-decode a texture held by three materials and a
    `UIImage`. Shader swap on a material shared by 50 renderers. Run the `RenderTexture`
    release/create cycle from C6's Phase 7.
  - Performance: the `instanced-batched` scene, 600 frames, `MemoryProfiler`/`Benchmark` frame time
    and heap delta, base vs branch. No per-frame allocation added (heap delta within noise, the
    existing allocation tests green).
  - `npm run size`.
- OUT: new features.

**Done when:**
- [ ] DW-9.1: guard green with the final allowlist; the allowlist printed in the notes.
- [ ] DW-9.2: d.ts diff pasted (expected empty).
- [ ] DW-9.3: every adversarial case passes or yields a fixed bug with a regression test in `tests/ResourceLifecycle.test.ts`; `renderer.info.memory` returns to its start value.
- [ ] DW-9.4: frame time within ±3% and no heap growth beyond the base's on the `instanced-batched` run (figures pasted); `npm run size` within budget and ≤ +2 KB gzip of the base.
- [ ] DW-9.5: visual suite passes every scene; base and branch pairs pasted.
- [ ] DW-9.6: full checks green on one run: `npm run typecheck`, `npm test`, `npm run build`.

### Phase 10: Docs and roadmap
**Skills:** code-foundations:code-clarity-and-docs
**Model:** sonnet
**Gate:** Minimal
**Depends on:** Phase 9
**File scope:** CHANGELOG.md (engine), CLAUDE.md (engine: Three.js Isolation section + roadmap item 8), .claude-shared/ROADMAP.md (N4 row + follow-up rows), .claude-shared/tasks/E-growth.md (N4 paragraph), .claude-shared/PLAN.md (§1.4), .claude-shared/code-foundations/N4/*

**Goal:** the change is recorded where the next stage and the owner will look.

**Done when:**
- [ ] DW-10.1: engine CHANGELOG *Changed* (internal): resource handles and the `rendering/three/` factory; "no public API change, no pixel change, no measured number changes"; `scripts/visual/` added. CLAUDE.md: rule "textures, meshes and materials reach three only through `rendering/three/`; the guard test enforces it"; roadmap item 8 updated to "stage 1 done".
- [ ] DW-10.2: ROADMAP N4 → `✅ <date> W<n>` + what landed; the follow-up rows N4b/N4c/N4d from research added as `⬜`; E-growth N4 paragraph and PLAN §1.4 say stage 1 is done and point to `code-foundations/N4/research.md` for the WebGPU go/no-go.
- [ ] DW-10.3: build notes (base commit, snapshot count, visual SHA pairs per phase, test files whose access path changed, allowlist history) in `code-foundations/N4/notes.md`.

---
## Test Coverage
**Level:** 100% of new/changed routines by unit tests; behaviour preservation by characterization snapshots + visual SHA256.
## Test Plan
- [ ] Every DW has a named test or a recorded command output / SHA list.
- [ ] Characterization (`ResourceCharacterization.test.ts`) is written on the base and never re-snapshotted.
- [ ] Dirty tests: swap during a frame, destroy while referenced, ImageBitmap closed once, >65,535 vertices, unknown material kind (warn + Standard, as today), `_setForTests` with live handles.
- [ ] Integration: the fake-backend frame tests (`RenderBackend.test.ts`) and MemoryProfiler stage-0 pin unchanged.
- [ ] Visual: `scripts/visual/run.mjs --compare` after Phases 3–9; double-run pairs in the notes.

## Assumptions
| Assumption | Confidence | Verify Before Phase | Fallback If Wrong |
|---|---|---|---|
| Three resource objects construct in vitest without GL (as the existing tests already do) | high | 1 | characterize the paths that do; mark the rest visual-only in the notes |
| SwiftShader output is deterministic run to run on one machine | high | 1 | drop the offending scene from the SHA set with the reason (Phase 1 edge case) |
| `three.version` bumps only on `needsUpdate = true` | high | 4 | mirror whatever increments it; DW-4.2 decides |
| C6 merged in its planned shape (`_internalThreeRenderTarget`, target branch) | medium | 1 | re-read merged C6; adapt names only; if C6 is not merged, stop (D9) |
| No consumer repo reads the removed `@internal` accessors | high | 5 | grep the worker's ScenarioCreator/editor/virtual-lab worktrees; if found → ATTENTION, keep a deprecated `@internal` shim for one release |

## Decision Log
| Decision | Alternatives Considered | Rationale | Phase |
|---|---|---|---|
| D1 wrapper handles with stable identity | handle = the three object cast | swaps (LOD re-decode, canvas) stay inside the three layer | 2–8 |
| D2 realm factory, not on `RenderBackend` | `backend.createTexture` | resources exist before any Application; WebGL and WebGPU three renderers share resource objects | 2 |
| D3 everything `@internal` | public `RenderResources` for custom backends | do not freeze an API before the WebGPU spike tests it | 2, 10 |
| D4 a phase moves one mechanism across a whole type + guard test | one class at a time | one class through the factory while a sibling does `new THREE.*` = two ways | 3–9 |
| D5 one merge for the stage | merge per phase | card "never in fragments", PLAN §1.4 | all |
| D6 component render objects stay for stage 3 | move them now | they are scene nodes plus private resources; moving them is stage 2/3 | 8, 9 |
| D9 depends on C6 + C2 | plan around them | RenderTexture is a texture class; C6 D1 defers it to N4 | 1 |
| D12 snapshots + SHA256 | eyeballing | "same pixels" must be checkable by a weaker model | 1–9 |
| D13 committed visual suite | scratch page (C6) | needed by 7 phases and by N6 | 1 |
| D15 no three version change | pin now | consumers resolve the peer range; pin belongs to the WebGPU task | — |

---
## Notes
- Strictly serial: every phase after 2 touches `ThreeResources.ts`/`RenderResources.ts`, and Phases
  3–9 are Full gates. No waves.
- Each Full-gate review re-runs the characterization test and the visual suite itself, and reads the
  guard allowlist diff for that phase: the list may only shrink.
- Phases 3–8 are about one day each for a Sonnet worker; if one runs over, split it at a mechanism
  boundary **within the same type** (never leave two construction sites), and record it in Decided
  During Build.
- WebGPU go/no-go: research § "Go/no-go for the WebGPU stage". It is not part of this build.
---
## Decided During Build
_Filled by /code-foundations-build — one row per decision an agent made or question it raised:_
| # | Phase | Decision or question | Source | Status |
|---|---|---|---|---|
---
## Execution Log
_To be filled during /code-foundations-build_
