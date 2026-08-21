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
| G1 | Four `Mesh.create*` primitives (`createCylinder`, `createCapsule`, `createTorus`, `createPlane`) emit indices wound opposite to their stored normals — back-face culled, renders hollow or invisible | ScenarioCreator | `0.1.0-local.1787254037912` (current frozen build — **not a regression**, same on `...1411`) | `ScenarioCreator/docs/ENGINE-GAPS.md` §4 |
| G2 | Streamed asset path reports ~2.9× the texture VRAM of the ZIP path for the same scenario; not reproduced in `Resources` + source, root cause still above that layer | testv/virtual-lab | `0.1.0-local.1786569427449` | `testv/virtual-lab/docs/upstream/webenginets.md` §1 |

**G1 is why Benchscene1's floor plane has never rendered, in any measurement, on any build** — it's
a `createPlane`. Three of its five object meshes (cylinder, capsule, torus) shade only their far
inner surface. Not a benchmark bug and not build-dependent (verified identical on the frozen build
and its predecessor), but any paper text calling the scene "a grid of primitives over a floor
plane" describes something the renderer never produced. See `.claude-shared/PAPER-STATUS.md`.

**Under the freeze (see PAPER-STATUS.md): write gaps up, do not fix them, even trivial ones.**
Both G1 and G2 were found this way and correctly left alone — G1 in particular arrived *during*
the freeze and stayed a documentation entry rather than a patch.

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
