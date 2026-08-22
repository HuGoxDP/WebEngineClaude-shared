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

## Fixed 2026-08-20, after the freeze was lifted

The freeze was lifted deliberately once it was confirmed **no measurement had been taken yet** —
`results/` held nothing newer than 3 August. Both of these change rendered output, so fixing them
before measuring was the whole point; fixing them after would have invalidated the table.

| # | Gap | Found in | Fix |
|---|---|---|---|
| G1 | Four `Mesh.create*` primitives wound opposite to their stored normals — back-face culled, hollow or invisible | ScenarioCreator | Winding corrected in `createPlane`, `createCylinder`'s side wall, `createCapsule`, `createTorus`. `createCapsule` also ordered its middle rings bottom-up between hemispheres ordered top-down, so one index grid stitched non-adjacent rings — fixed too. Pinned by `tests/PrimitiveWinding.test.ts`, which audits every builder without a renderer. |
| G3 | Every texture from `Resources` tagged sRGB, so normal and metallic-roughness maps were decoded as colour — and the KTX2 path disagreed with the image path, moving a shading input between the two arms of a KTX2 A/B | ScenarioCreator | `StandardMaterial` slots declare their content: albedo and emission are colour, normal/metallic/occlusion/height are linear, matching `GLTFLoader`. Pinned by `tests/TextureColorSpace.test.ts`. |

**Both change measured numbers.** G1 changes what is drawn and therefore fill cost; G3 changes
shading inputs. Anything measured before `0.1.0-local.<the build after this>` is not comparable.
See `PAPER-STATUS.md` for the current frozen stamp.

**Under a freeze: write gaps up, do not fix them.** That rule held for as long as the freeze
protected real data. It stops applying the moment there is no data to protect, and re-checking
that is cheaper than assuming either way.

## Closed since 2026-08-19

Landed in commits through `2baf724`; full detail in `WebEngineTS/design/upstream-answers.md` and
`WebEngineTS/CHANGELOG.md`.

| Gap | Landed as |
|---|---|
| `PhysicMaterial.friction` never reaches a contact | `PhysicsWorld` registers a `ContactMaterial` per pair |
| `Slider` has no `setValueWithoutNotify` | Added, matching `Toggle`/`Dropdown`/`Scrollbar` |
| KTX2 skybox impossible (E1) | `Cubemap.fromEquirectangular(string \| Texture2D)` |
| Dirty-transform switch write-only (E2) | `Transform.dirtyTransformsEnabled` getter |
| `maxSize` silent no-op on KTX2 / GLB (E3) | Documented (deliberately not implemented) + once-per-run warning |
| Parameter channel into scenarios (E4) | Rejected; `design/scenario-parameters-decision.md` |
| Scenario could open the diagnostics overlay | `MemoryProfiler.diagnosticsAllowed` host lock |
| No way to see what a texture transcoded to | `MemoryReport.renderer.textureFormats` |
| Asset URLs joined instead of resolved | `StreamingAssetSource._resolveUrl` uses `new URL()` |
| `Application.version` a fixed literal | Reads `BuildInfo.version` |
| No `script-src blob:` documentation | Stated on all `loadScenarioFrom*` entry points |
| Basis transcoder needs `'unsafe-eval'` | Not the engine's to fix — it ships no transcoder |

## How to use this file

1. **Check here first**, then the originating repo's file if you need the evidence.
2. New gap: add one row here, write the full entry in *your* repo's own gap file (its own
   conventions — evidence, affected content, workaround — stay there), link it back.
3. Closing a gap: move the row down, one line on how it landed, keep the detail entry in the
   originating file (marked closed there too) rather than deleting it — the reason content is
   shaped the way it is would otherwise have to be re-derived.
4. **During the freeze** (`PAPER-STATUS.md`): add gaps freely, do not act on any that would change
   engine behaviour.
