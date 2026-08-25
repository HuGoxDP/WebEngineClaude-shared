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
| **Engine freeze** | **RE-ARMED 2026-08-22 06:05 UTC**, after two rendering defects were fixed. Lifted deliberately on 22 Aug once it was confirmed no measurement existed to protect (`results/` held nothing newer than 3 August). |
| **Frozen build** | `0.1.0-local.1787378753713`, built `2026-08-22T06:05:56.613Z`, from engine commit `ee7bb6e`. Every measurement must be against this stamp. The earlier `…7912` stamp is superseded — anything measured against it is not comparable. |
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

## Both machines are in — and one methodological finding outranks everything else

Intel UHD (24 Aug) and RTX 3050 (25 Aug), same engine stamp, same archives. This *is* the
cross-device comparison: two GPUs, no flag involved.

### **38 of 58 configurations are VSync-bound. `mean_ms` measures the monitor, not the engine.**

Intel sits at 60 Hz (≈16.2 ms), the RTX 3050 at 144 Hz (≈6.95 ms). On the 3050 **every**
configuration is pinned except Scene 1 at N5000 — Scene 3's whole 3.1→3.7 ladder reads 7.03 …
6.96 ms, a 1% spread that is the refresh rate and nothing else.

**Consequences, and they are not optional:**

- Do **not** present `mean_ms` for any pinned row. A table showing "the optimisation changed
  nothing" where the scene never dropped below the refresh rate is not a null result, it is an
  unmeasured one, and a reviewer who checks `fps ≈ 143` on every row will see it immediately.
- Use **`cpu_ms`** (`Application.cpuFrameTime`, busy ms on the main thread) as the frame metric.
  It is not VSync-bound and it exists for exactly this. `texVram_MB` and `first_render_ms` are
  likewise unaffected.
- **Scene 1 at N5000 is the only configuration below the cap on both machines**, so it is the one
  place a wall-clock frame time may be quoted.
- If a wall-clock frame number is wanted more widely, the runs must be repeated with VSync off
  (`--disable-frame-rate-limit --disable-gpu-vsync`) or on a heavier scene. That is a re-run, not
  a re-analysis.

### Turning VSync off was tried on both machines. Do not repeat it.

**Intel UHD: it breaks the measurement.** Median frame 0.50 ms, **max 2709 ms**, stdDev 110 ms
against a mean of 5.21. `render` rose from 0.61 ms to 4.83 — the CPU is not computing, it is
blocked waiting on the GPU. Unsynchronised, the engine pushes ~2000 fps into a card sharing system
memory, the queue saturates and the browser stalls for seconds at a time. A mean over that
distribution describes nothing. **Do not re-run Intel without VSync.**

**RTX 3050: it works, and mostly measures the timer.** VSync did come off (2000–3000 fps), but
Scene 2 and Scene 3 then render in 0.33–0.52 ms, where `mean_ms` CV runs 4–22%. Half a millisecond
cannot be measured to 5% against scheduler noise. The scenes are simply too light for this card,
and removing the frame cap does not fix that — only a heavier scene would.

**One row is worth keeping from it.** Scene 1 at N5000 is heavy enough to measure either way, and
without the cap it separates what VSync had hidden:

| | frame | CV | `cpu_ms` |
|---|---|---|---|
| `dirty=0` | 18.70 ms | 4.2% | 18.34 |
| `dirty=1` | 21.16 ms | 6.8% | 20.79 |

**+13%** — dirty transforms make this scene *slower*, where the VSync-bound run showed +1.6% and
called it noise. That agrees with the phase breakdown on Intel: the work moves from Update into
the pre-render flush, and it does not move for free. Report it.

**So the measurement condition is VSync on, and the metric is `cpu_ms`.** It is stable there
(CV < 5% almost everywhere), it is what `Application.cpuFrameTime` exists for, and it is the same
condition on both machines. Quote wall-clock only for Scene 1 at N5000. Keep the no-VSync
directories: they are the evidence for the paragraph above and for why the condition was chosen.

### The KTX2 interaction is a genuine cross-device result

| | texture VRAM | `cpu_ms` | frame |
|---|---|---|---|
| Intel, `maxSize=0` | 208 → 69.3 MB | 0.886 → 0.895 | −0.7% |
| Intel, `maxSize=2048` | 88 → 69.3 MB | 0.831 → **0.918** | **+14.0%** |
| RTX 3050, `maxSize=0` | 208 → 69.3 MB | 0.793 → 0.809 | −0.2% |
| RTX 3050, `maxSize=2048` | 88 → 69.3 MB | 0.797 → 0.802 | −0.2% |

**The +14% appears on integrated graphics and not on discrete**, and the mechanism is the one
predicted: at `ktx2=1` the cap cannot reach the panorama, so three.js derives a 6×4096²
uncompressed cube render target (~384 MiB) instead of 6×1024² (~24 MiB). A discrete card with
dedicated VRAM absorbs it; an integrated one sharing system memory does not.

That is the strongest cross-device claim available here, and it needs no `gpu` flag — it is two
machines. **Report it as the flag interaction on integrated hardware**, with the mechanism.

### Scene 1 at N5000 is CPU-bound, which is why the discrete GPU barely helps

| | frame | fps | `cpu_ms` |
|---|---|---|---|
| Intel | 26.28 ms | 38.0 | 23.87 |
| RTX 3050 | 23.96 ms | 41.8 | 23.51 |

The discrete card is **1.10×** faster, and the CPU times are within 1.5% of each other. At 3931
draw calls the bottleneck is draw-call submission on the main thread, not the GPU. That is a
publishable finding on its own and it motivates the engine's instancing and static-batching work
(P1.4) far better than a synthetic argument would.

### The `gpu` flag is a label, not a control — the GPU is switched in Windows

Confirmed by the operator: the card is selected in Windows' graphics settings per application,
and `gpu=low-power` / `high-performance` were only ever tags on the run. Every row on each
machine reports that machine's selected GPU under either value.

**So `eff_powerPreference` in the CSVs is misleading and must not be cited.** It records what the
flag asked for, which nothing acted on. The column that identifies the hardware is `gpu`, which
carries the unmasked renderer string — cite that.

The `crossdevice` matrix therefore adds nothing over the two directories: drop it, and let
`results/laptop-intel/` vs `results/laptop-rtx3050/` be the comparison. Two machines, switched
deliberately, is a stronger design than a hint the browser is free to ignore — it just has to be
described as what it is.

## Results — first full matrix, 24 August, Intel UHD

29 configurations, all six matrices, against `0.1.0-local.…` built `2026-08-24T18:43:54.699Z`.
CSVs in `WebEngineTS-Benchmarks/results/*_intel_20260824-*.csv`.

**Quality gates.** `fingerprint_varies = 0` everywhere; drop-first applied (4/5, 9/10). Worst
`mean_ms` CV is **3.9%** — the headline metric passes. `cpu_ms` CV exceeds 5% in 5 of 29
configurations, all in Scene 1 at low object counts, where the quantity is 1–6 ms and near the
timer's resolution. Report `mean_ms`; treat Scene 1's `cpu_ms` as indicative.

**The `gpu` flag is a no-op on this machine.** Every one of the 29 rows reports the same
`ANGLE (Intel, Intel(R) UHD Graphics …)`, including both arms of `crossdevice` and both arms of
`ktx2scene`. `gpu=low-power` and `gpu=high-performance` selected the same silicon. **The
`crossdevice` matrix therefore measures nothing** and must not be presented as a cross-device
result. The real cross-device comparison is this Intel run against the RTX 3050 run — two
machines, not two hints — and needs no flag at all.

**KTX2 transcodes.** `texture_formats` reads `BC7:12` on every `ktx2=1` row and `RGBA8:12` on
every `ktx2=0` row. E1's remaining acceptance condition is met on integrated hardware.

### The KTX2 A/B, both axes

| | texture VRAM | frame time |
|---|---|---|
| `maxSize=0` | 208.0 → 69.3 MB (**−138.7**) | −0.7% (noise) |
| `maxSize=2048` | 88.0 → 69.3 MB (−18.7) | **+14.0%** |

At `maxSize=0` KTX2 is a clean −67% of texture VRAM at no measurable frame cost. **Build the
paper's KTX2 claim from this pair.**

At `maxSize=2048` it costs 14% of frame time, and the mechanism is the one predicted: the cap does
not reach a KTX2 texture, so the 8192×4096 panorama stays full size and three.js derives a
6×4096² uncompressed cube render target from it instead of 6×1024². On integrated graphics
sharing system memory that is visible in the frame. Note the *reported* VRAM still falls (−18.7 MB)
because the planets' saving outweighs the skybox's growth — the earlier prediction of a reported
*rise* was about the skybox in isolation and does not hold for the scene total. Report this row as
the flag interaction, with the frame cost, not as a VRAM result.

### Scene 3 incremental, 3.1 → 3.7

**+2.3% overall** — the full stack is slower than the baseline. It is not a flat curve: 3.2
(`maxSize`) takes −11.7%, and 3.5 (`ktx2`) gives back +13.6% for the reason above.

**Do not present Table 3 as a cumulative ladder.** Present each optimisation against the metric it
can move, which is what the roadmap always specified: KTX2 → texture VRAM, dirty transforms → CPU
frame time, shader warmup → first-render cost. A ladder here would claim the engine gets slower
the more optimisations are enabled, which is true of this stacking order and false as a statement
about the optimisations.

### Dirty transforms — the sweep pays off, in the phase it touches

| N | Update `dirty=0` | `dirty=1` | speedup | Render `d0` → `d1` | frame `d0` → `d1` |
|---|---|---|---|---|---|
| 104 | 0.149 | 0.056 | 2.7× | 0.720 → 0.771 | 15.27 → 15.12 |
| 504 | 0.628 | 0.183 | 3.4× | 1.915 → 2.253 | 16.93 → 16.95 |
| 1004 | 1.085 | 0.230 | 4.7× | 4.247 → 4.945 | 18.65 → 18.53 |
| 5004 | 3.780 | 1.037 | 3.6× | 18.599 → 21.994 | 26.28 → 26.54 |

**Update gets 2.7–4.7× faster and the ratio widens with object count** — that is the scaling claim
the sweep was run to make available, and it is real. **Total frame time does not move** (±5%),
because the work moves into the pre-render flush rather than disappearing: every object in
Benchscene1 rotates every frame, so every transform is dirty every frame and there is nothing for
the dirty flag to skip.

That is an honest and publishable result, and stronger than a speedup claim would have been: the
optimisation is a *deferral*, and it pays only in proportion to how many transforms are static.
Say so, and say that the benchmark scene is deliberately its worst case.

### Shader warmup — correction: it works, on the discrete card

Called a null result on 24 August from Intel and Scene 3 alone. The 3050 run overturns that.

Scene 2, `first_render_ms`: on the RTX 3050 all three `warm=1` configurations land on
**157.0 ± 0.2 ms** while the three `warm=0` ones spread across 169.9 / 186.2 / 172.5. That is −11%
on average, and the collapse of a 16 ms spread to 0.4 ms is the clearer half of it.
`max_first10_ms` moves with it, 9.1 → 7.6.

On Intel it does nothing: no systematic direction, every pair inside one standard deviation.
Scene 3 shows nothing on either machine — its first render is dominated by asset loading, not
shader compilation.

So it is a **cross-device result, not a null one**: warmup pays where shader compilation is the
cost, and on this integrated part it is not.

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

## Four findings that constrain what the paper may claim

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

**Benchscene1's floor never rendered — now fixed, and this is why the build stamp changed.**
`Mesh.createPlane` wound its indices opposite to its stored normals, so it was culled to nothing;
`createCylinder`, `createCapsule` and `createTorus` shared the defect. Corrected 22 Aug
(`ee7bb6e`). Separately, normal and metallic-roughness maps were being decoded as sRGB, and the
KTX2 path disagreed with the image path — so the two arms of the KTX2 A/B differed in a shading
input as well as a texture format. Also fixed. Detail: `.claude-shared/ENGINE-GAPS.md` G1 and G3.

**Both change the numbers**, which is exactly why they were fixed before measuring rather than
after. Scene 1 now draws its floor and three solid meshes instead of hollow shells, so its fill
cost is higher and honestly described; Scene 2's two KTX2 arms now shade identically, so "the same
scene with compressed textures" is finally true. **Measure only against
`0.1.0-local.1787378753713`.**

One consequence for the text: Scene 1 is now genuinely "a grid of primitives over a floor plane",
so that description is safe to use — it was not before.

**Scene 2's two KTX2 arms were still rendering different pictures — fixed 24 Aug, in content.**
G3 made the arms *shade* identically; it did not make them the same image. The de-embedded colour
map was being uploaded upside down: glTF's UV origin is top-left and `GLTFLoader` uploads
`flipY = false`, but `Texture2D.fromArrayBuffer` keeps three.js's `flipY = true`. The KTX2 path
was unaffected, because `CompressedTexture` forces `false`. So `ktx2=0` and `ktx2=1` differed by a
**max channel Δ of 173** — a different image, not a different texture format. On this atlas (fur
swatches packed against black gutters) the flip read as a dark, blotchy model rather than as an
obvious flip, which is why it survived the entry-5 colour-space work.

Corrected in `Benchscene2_complexmodel/scripts/Scenario.ts` — `albedo.flipVertically = false`, set
unconditionally so both arms land in one orientation. The arms now differ by **22**, which is
UASTC transcode noise. Written up as `G4` in `ENGINE-GAPS.md` and §6 of
`ScenarioCreator/docs/ENGINE-GAPS.md`. **Any Scene 2 KTX2 run taken before 24 Aug compared two
different scenes** and must be re-taken, and the sentence above about the arms shading identically
only became true today. Verified against the shipping archive: `ktx2=0` matches the
pre-de-embedding render to a max Δ of 5 (JPEG q92 noise).

**Scene 2 is unaffected by the 24 Aug engine update.** `Texture.flipVertically` arrived in
`0.1.0-local.1787597032574` (installed in ScenarioCreator 21:44) and the content workaround moved
onto it, off the Three.js internals it had been reaching into. Rendered output did not move:
the same archive on the old build and on the new one is **pixel-identical, max Δ 0**, on both arms
of the A/B. So the two stamps are comparable *for this scene* — which is not a general claim about
the update, only the one measured here.

## Explicitly cut

User study (cannot run in the time, and reviewers know it — answer it in Limitations), streaming
measurements, UI round 2, Profiler v2, cross-device unless the hardware is on the desk. None of
them is what scored fair/poor.
