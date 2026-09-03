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
| G2 | Streamed asset path reports ~2.9× the texture VRAM of the ZIP path for the same scenario; not reproduced in `Resources` + source, root cause still above that layer | testv/virtual-lab | `0.1.0-local.1786569427449` | `testv/virtual-lab/docs/upstream/webenginets.md` §1 |
| G4 | Texture orientation depends on the file format: the image path uploads `flipY = true`, glTF and KTX2 use `false`, so a de-embedded map samples upside down and a KTX2 A/B compares two different pictures | ScenarioCreator | `0.1.0-local.1787408668962` | `ScenarioCreator/docs/ENGINE-GAPS.md` §6 |

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
