# Shared engine gap registry

Loaded into every repository's session. **Index only — one row per gap, not the narrative.** Full
evidence (code, measurements, repro) lives in the repo that found it; this file says what is open,
what is closed, and where to read the rest. Keep it short: it is paid for in four sessions at once.

**Before adding or acting on anything here, re-verify against the current engine build.** Of the
nine items originally spread across three separate lists, six were already fixed by the time they
were re-checked. The engine moves faster than any list describing it.

## Open

| # | Gap | Found in | Found against | Detail |
|---|---|---|---|---|
| G2 | Streamed asset path reports ~2.8× the texture VRAM of the ZIP path for the same scenario — **partly closed 2026-11-10 (ROADMAP P7 + SC-G2)**: the content half is fixed — solar-system's redundant fallbacks (six planets whose `.glb` loads, plus the unreferenced `saturn_ring.png`) now ship `Lazy`, measured 273.8 → 224.8 MB with the same 20 textures and 27 draw calls. The remaining 128 MB is ONE engine-side live `Texture` (the retained skybox pano) — ROADMAP **E-G2a** | testv/virtual-lab | `0.1.0-local.1794342651370` | `testv/virtual-lab/docs/upstream/webenginets.md` §1 |
| G4 | Texture orientation depends on the file format: the image path uploads `flipY = true`, glTF and KTX2 use `false`, so a de-embedded map samples upside down and a KTX2 A/B compares two different pictures | ScenarioCreator | `0.1.0-local.1787408668962` | `ScenarioCreator/docs/ENGINE-GAPS.md` §6 |
| G5 | `Time.timeScale` survives `Application.dispose()` and the next scenario load — `Time._reset()` (`Time.ts:280`) has no caller, so a paused or slowed scenario leaks its scale into the next one in the same page | testv/virtual-lab | `0.1.0-local.1792706134341` | `testv/virtual-lab/docs/upstream/webenginets.md` §6 (the platform runs every scenario, restarts included, in a fresh player frame — player-isolation, virtual-lab 2bf3a12 — so the scale cannot leak there; the engine fix, a `Time._reset()` caller, is still open for hosts that reuse one realm) |

**G2 has a diagnosis (2026-09-05), and it is not an engine leak.** Streamed scenarios eagerly
decode every non-`Lazy` manifest asset — `Scenario._preloadCriticalAssets` then
`_startDeferredLoading`, which is the streaming design working as intended, and which the ZIP path
deliberately skips ("a ZIP is already in memory… nothing is gained by asking earlier"). The
solar-system content then ships **redundant assets**: every planet declares both a `.glb` *and* a
loose albedo `.jpg` (`texAlbedo: "mercury", model: "mercury"`, and so on for six planets, plus
Earth's normal and emissive). The ZIP path never decodes the unused fallbacks because
`Resources.tryLoad` is lazy; the streamed path decodes both sets. That is the right magnitude for
2.9×, and it explains why `renderer.textures` matches at 20 while `estimatedTextureVramBytes` does
not — the former counts GPU uploads, the latter counts every live `Texture` object.

**The predicted reading is confirmed on the platform (2026-11-10, P7, engine
`0.1.0-local.1794342651370`):** `liveTextures` differs while `textures` matches —
`e2e/tests/streaming.spec.ts`, solar-system ZIP vs manifest: textures 20 / 20 (GPU uploads),
estimatedTextureVramBytes 96.8 MB / 273.8 MB (live `Texture` objects), draw calls 27 / 27, first
frame 41.1 s / 40.6 s. That is branch 1 of the platform's own decision tree, and the cause is
redundant content eagerly prefetched, not a leak.

**The content half is fixed (2026-11-10, SC-G2):** solar-system's `streaming.priorities` mark the
six never-requested planet fallbacks and the unreferenced `saturn_ring.png` `Lazy` — the manifest
path dropped 273.8 → 224.8 MB with the same 20 textures and 27 draw calls (the ZIP path is
untouched, so no pixel changed).

**The remaining 128 MB is one engine-side `Texture`, not content (E-G2a):** a per-path dump of
`EngineObject.FindObjectsOfType(Texture)` shows the manifest path holding
`Texture from ArrayBuffer 8192x4096 128.0MB` that the ZIP path never creates.
`skybox/stars_panorama.jpg` is the only 8192×4096 asset and the scenario consumes it via
`Resources.getUrl` + `Cubemap.fromEquirectangular` — on the ZIP path that fetches straight into the
cubemap conversion with no engine `Texture` left behind; on the manifest path the eager prefetch
decodes the skybox as a `Texture2D` and the resource cache keeps it. Fix in the engine: release the
raw texture after the conversion, or keep `getUrl` from materializing a `Texture2D` for an asset
the prefetch already decoded.

**G4 is half-closed, deliberately.** `Texture.flipVertically` (2026-08-22) lets content state the
orientation through the public API instead of reaching into the Three.js texture, which closes the
rule violation and unblocks the measurement. The convention itself is **not** settled: KTX2 forces
`flipY = false` and cannot do otherwise, so unifying means moving the whole engine — including all
twelve primitive UV generators — to a top-left origin. That changes rendered output in content
nobody looks at before it ships, so it needs the visual harness in
`WebEngineTS/design/coordinate-check/` first. Plan and staging:
`WebEngineTS/design/unity-coordinates-plan.md`.

## Closed

Full detail stays in the originating repo's list, marked closed there too. The fix and its pinning
test are named here so a re-report can be answered without re-deriving anything.

| Gap | Fixed by |
|---|---|
| G1 — four `Mesh.create*` primitives wound opposite to their stored normals: culled, hollow or invisible | Winding corrected in `createPlane`, `createCylinder`'s side wall, `createCapsule`, `createTorus`. `createCapsule` also stitched non-adjacent rings — its middle ordered bottom-up between hemispheres ordered top-down. `tests/PrimitiveWinding.test.ts` |
| G3 — every texture from `Resources` tagged sRGB, so data maps were decoded as colour and the KTX2 path disagreed with the image path | `StandardMaterial` slots declare their content: albedo and emission colour, normal/metallic/occlusion/height linear, matching `GLTFLoader`. `tests/TextureColorSpace.test.ts` |
| `createPlane` produced a wall — XY facing +Z, where Unity's `Plane` is XZ facing +Y | Vertices moved to XZ/+Y; the original winding was right for a floor all along. `tests/PrimitiveWinding.test.ts` |
| An imported mesh lost its second UV set, and the writer emitted it on channel two | Import reads `uv1`, the writer emits `uv1`. Engine `uv2` is Unity's second set, which is three's `uv1`. `tests/SecondUvSet.test.ts` |
| `PhysicMaterial.friction` never reached a contact | `PhysicsWorld` registers a `ContactMaterial` per pair |
| `Slider` had no `setValueWithoutNotify` | Added, matching `Toggle`/`Dropdown`/`Scrollbar` |
| KTX2 skybox impossible (E1) | `Cubemap.fromEquirectangular(string \| Texture2D)` |
| Dirty-transform switch write-only (E2) | `Transform.dirtyTransformsEnabled` |
| `maxSize` a silent no-op on KTX2 / GLB (E3) | Documented, plus a once-per-run warning. Deliberately not implemented |
| Parameter channel into scenarios (E4) | Rejected; `WebEngineTS/design/scenario-parameters-decision.md` |
| A scenario could open the diagnostics overlay | `MemoryProfiler.diagnosticsAllowed` host lock |
| No way to see what a texture transcoded to | `MemoryReport.renderer.textureFormats` |
| Asset URLs joined instead of resolved | `StreamingAssetSource._resolveUrl` uses `new URL()` |
| `Application.version` a fixed literal | Reads `BuildInfo.version` |
| No `script-src blob:` documentation | Stated on all `loadScenarioFrom*` entry points |
| Basis transcoder needs `'unsafe-eval'` | Not the engine's to fix — it ships no transcoder |

**Anything that changes rendered output changes measured numbers.** G1, G3, the plane orientation
and the second UV set all do — so a benchmark result is only comparable against another taken on
the same engine build. Record the build stamp (`BuildInfo.version` / `builtAt`) with any run kept
for comparison.

## How to use this file

1. **Check here first**, then the originating repo's file if you need the evidence.
2. New gap: add one row under **Open** here, write the full entry in *your* repo's own gap file
   (its own conventions — evidence, affected content, workaround — stay there), link it back.
3. Closing one: move the row to **Closed** with how it landed and which test pins it. Keep the
   detail entry in the originating file rather than deleting it — the reason content is shaped
   the way it is would otherwise have to be re-derived.
4. **If a measurement campaign is in flight**: add gaps freely, but hold any fix that would change
   engine behaviour until it ends — landing one mid-run mixes two builds into one table.
