# Shared context — thesis resubmission status

**This file changes daily. Update it at the end of each working session, in whichever repo you
are in.** It is the one place all five sessions look to know what is going on.

## The deadline

**Resubmission: 24 August 2026.** Driven by thesis submission 76, where Section 5 (Evaluation)
scored fair/poor from 2 of 3 reviewers. The raw data behind the paper's Scene 3 table is lost and
the surviving files describe a different, heavier scene — so Section 5 is being rebuilt from
measurements that do not exist yet. Everything is ordered against "does this make Section 5
defensible".

Full plan: `WebEngineTS/design/roadmap-2026H2.md` §7.1.
Article source: `WebEngineTS/ClaudeDocs/` — Section 5 is `evaluation2.tex`.

## Current state — 20 August 2026

| | |
|---|---|
| **P0-A matrix runner** | **Done.** `#matrix=<name>` in `run.ts` + `matrices.ts`: N reps × M configs unattended, a page reload per leg so static globals reset cleanly, drop-first, mean/stdDev/CV, scene fingerprint per row plus a `fingerprint_varies` flag. |
| **Engine freeze** | **IN FORCE from 2026-08-20 19:27 UTC.** |
| **Frozen build** | `0.1.0-local.1787254037912`, built `2026-08-20T19:27:19.485Z`, from engine commit `2baf724`. Every measurement must be against this stamp. |
| **Consumers** | All synced by `release:local`. WebEngineTSEditor/app skipped — no `node_modules/` yet. |
| **Measurements** | Not started — the only thing left on the critical path. |
| **Next action** | Run the evaluation matrix in WebEngineTS-Benchmarks; commit the CSVs. |

Confirmed present in the frozen bundle: `Transform.dirtyTransformsEnabled`,
`MemoryProfiler.diagnosticsAllowed` (getter *and* setter),
`MemoryReport.renderer.textureFormats`, `MemoryReport.renderer.liveTextures`, the
`Cubemap.fromEquirectangular(Texture2D)` branch, the single-pass texture survey and the KTX2
`maxSize` warning.

## The freeze rule — now active

**No engine change lands until the evaluation matrix is complete.** Every measurement is against
`0.1.0-local.1787254037912`; anything that changes engine behaviour invalidates every run taken
before it, and a partially-invalidated table is worse than no table.

If you find an engine defect during the freeze: **write it up, do not fix it.** Put it in the
relevant gap list (see `ECOSYSTEM.md`) and carry on. This includes defects found *by* the
measurements — especially those, since fixing one mid-matrix silently mixes two builds into one
table.

Lifting the freeze is a decision, not a default: it happens when the CSVs behind Section 5 are
committed.

## The run plan — decided 20 August

Four matrices exist (~120 runs, ~39 min at 60 Hz). Before starting, add:

- **A cross-device matrix** (3.1 and 3.7 × `gpu=low-power`, 5 reps). Automating it protects a
  reviewer-facing row from hand-run error — but it does **not** make it an integrated-GPU result.
  Label it a power-preference hint on the same silicon, or R1 catches it twice.
- **`#scene=ktx2`** (2 runs) — the only unverified acceptance condition of E1, made objective by
  `textureFormats`. Fix the broken asset path in `scenes/sceneKtx2.ts` first.
- **A second axis on the ktx2 A/B**: run it at `maxSize=0` *as well as* `maxSize=2048`
  (+10 runs, ~3 min). At 2048 the A/B measures the *interaction* of two flags; at 0 it measures
  KTX2 alone. Having both isolates the effect, shows the interaction E3 documents as
  non-obvious, and survives the skybox moving to the E1 path — otherwise row 3.2 has to be
  reinterpreted after the fact.

**Keep the 20 Scene 2 runs that prove a zero.** `maxSize` cannot reach textures embedded in a
GLB, so those cells are a negative result with a documented mechanism — that is paper material,
not overhead. Six minutes.

**The Scene 1 object-count sweep is unblocked** (20 Aug). ScenarioCreator has the four archives —
`Benchscene1_N{100,500,1000,5000}.zip`, built against the frozen engine stamp, verified identical
by `git diff --no-index` (`+1 −1`, the constant) and by live object counts.

Two things that follow:

- **Object counts are N + 4** (104 / 504 / 1004 / 5004): the sweep constant plus camera, sun,
  ambient and floor. Label the axis honestly or take the number straight from the `objects`
  fingerprint column; "100 objects" beside `objects=104` is what a reviewer checks.
- **Plot it as scaling, not as a speedup.** The dirty-transform claim is far stronger as "the
  gap widens with object count" than as "it is faster at 1000". The sweep is what makes that
  claim available, and a single-count A/B cannot support it.

**The freeze covers the engine, not the harness.** Harness fixes are allowed *before* the matrix
starts and not during it: changing it mid-run mixes two harness states into one table exactly as
an engine change would.

## Three things that must not be cut

These are exactly why the previous evaluation could not be defended:

1. **10 repetitions** on Scene 3.
2. **Drop-first** — discard the first run of every configuration.
3. **Scene fingerprint in every row** — tris, GameObjects, textures, draw calls, shaders. A table
   must never again be orphaned from the scene it describes.

## Three findings that constrain what the paper may claim

**The skybox's real VRAM is not what the engine reports.** three.js converts an equirectangular
`scene.background` into an *uncompressed* cube render target sized by the panorama's **height** —
six faces, RGBA8, whatever the source format was. `estimatedRenderTargetVramBytes` does not count
it.

**Benchscene3 now loads the skybox through the E1 path** (`Resources.tryLoad(Texture2D, …)` →
`Cubemap.fromEquirectangular(panorama)`, `Scenario.ts:127`), so `maxSize` no longer reaches it
when `ktx2=1`. That makes the two arms of the KTX2 A/B differ in a term the report omits:

| config | reported | unreported cube RT | true total |
|---|---|---|---|
| `maxSize=0` `ktx2=0` | 128 MiB | 384 MiB | 512 MiB |
| `maxSize=0` `ktx2=1` | 32 MiB | 384 MiB | 416 MiB |
| `maxSize=2048` `ktx2=0` | 8 MiB | 24 MiB | 32 MiB |
| `maxSize=2048` `ktx2=1` | 32 MiB | 384 MiB | 416 MiB |

- **At `maxSize=0` the A/B is valid**: reported delta −96 MiB, true delta −96 MiB. The cube render
  target is identical in both arms and cancels. **Build row 3.2 from this pair.**
- **At `maxSize=2048` it is not**: reported delta +24 MiB, true delta **+384 MiB**. The report
  understates the real cost 16×, and shows a mild regression where the real one is large. Run it
  and report it as the *flag interaction*, never as a VRAM result.

Watch the run itself at `ktx2=1`: ~416 MiB of skybox alone. If a run fails or thrashes on a 4 GB
card, that is a finding, not a malfunction.

**Benchscene1's floor has never rendered, on any build.** Found in ScenarioCreator during the
freeze (`0.1.0-local.1787254037912`, and identical on the predecessor build — not a regression,
not a benchmark bug). `Mesh.createPlane` winds its indices opposite to its stored normals, so it
is back-face culled to nothing; `createCylinder`, `createCapsule` and `createTorus` share the
defect on part of their geometry. Full detail: `.claude-shared/ENGINE-GAPS.md` G1,
`ScenarioCreator/docs/ENGINE-GAPS.md` §4.

**Consequence for the paper's text, not its numbers.** The scene's fill cost is not the fill cost
"a grid of primitives over a floor plane" describes — the floor was never drawn and three of five
meshes shade only their inner surface. Cross-build comparisons still stand, since the defect is
identical on every measured build. Do not describe Scene 1's visual content more specifically
than the numbers need; if a figure or caption shows the scene, expect a dark/hollow floor and say
nothing that claims otherwise. Fixing this is out of scope before 24 August — it is exactly the
kind of change the freeze exists to defer.

## Explicitly cut

User study (cannot run in the time, and reviewers know it — answer it in Limitations), streaming
measurements, UI round 2, Profiler v2, cross-device unless the hardware is on the desk. None of
them is what scored fair/poor.
