# V4 — the LOD texture ladder's memory saving, measured on two real GPUs (Claude, 2026-11-14)

The owner delegated V4 ("делай сам", 2026-11-14). The row said "owner hw", but this machine has
two real GPUs, and one of them is the class decision #4 budgets for:

- **NVIDIA GeForce RTX 3050 Laptop**: 4 GB dedicated, driver 32.0.16.2114.
- **Intel UHD Graphics (0x9A68)**: shared system memory, driver 31.0.101.5333. The same family
  as the student laptops.

## Method

**Engine.** `master` `1bc81ff`, built in `.workers/C/WebEngineTS` (2026-11-14). It includes
E-G2a's `Resources.getUrl` release.

**Content.**
- `solar-system-scenario.zip` (release build of 2026-11-11), published as a streaming manifest
  by `build-manifest.mjs`.
- 12 assets got a ladder: 24 coarser levels with the longest edge 512 and 1024, same format.
- The levels were made by `mklods.mjs` in Edge (canvas, `imageSmoothingQuality: "high"`), under
  `convert_to_ktx2.sh`'s rule: longest edge = size, never upscaled.
  - `toktx`/`basisu` are not installed, so this is the **image** ladder; no KTX2 ladder was built.
  - On both GPUs a KTX2 level transcodes to a block format whose size scales with area the same
    way, so the *ratios* carry over. The absolute numbers would be about 4× smaller per texture.
- All of it lives in a scratch worktree `.workers/C/ScenarioCreator`, so nothing in a primary
  checkout changed.

**Run.**
- `measure.mjs <high|low> <base|0|1|full>` runs Edge headless with `--use-angle=d3d11`.
  `Application.powerPreference` plus `--force_high_performance_gpu` or `--force_low_power_gpu`
  select the GPU.
- `MemoryProfiler.snapshot().gpu` confirms which GPU ran: the RTX for `high`, the UHD for `low`.
- `loadScenarioFromManifest` gets a `fetch` that serves the manifest with every ladder cut at the
  level. Level 0 = 512, 1 = 1024; `full` = the original files, i.e. the ZIP's pictures; `base` =
  an `Application` with no scenario.
- 15 s after the load it reads:
  - the engine's estimate: `estimatedTextureVramBytes`;
  - Windows' real memory of the Edge GPU process: `\GPU Process Memory(pid_*)\Dedicated Usage`
    and `Shared Usage`, summed per adapter (`gpumem.ps1`, the last of three samples 2 s apart).
- Every cell ran twice; `results.jsonl` holds the raw lines.
- `measure2.mjs … sky` is the same with every ladder at 1024 **except** the skybox, which stays
  full size.

## Results (MB, run 1 / run 2)

| Level | Engine estimate | RTX 3050 dedicated | Intel UHD shared |
|---|---|---|---|
| no scenario | 0 | 73.8 / 75.2 | 72.1 / 70.7 |
| 512 | 24.8 | 117.6 / 117.6 | 168.5 / 172.4 |
| 1024 | 32.8 | 152.1 / 148.2 | 213.8 / 213.7 |
| full (= ZIP) | 96.8 | **720.4 / 720.4** | **915.5 / 919.4** |
| 1024, skybox full | 72.8 | 698.7 | 866.9 |

Above the empty engine, the scenario takes:

| Level | RTX 3050 | Intel UHD | Change from full |
|---|---|---|---|
| full | 646 MB | 846 MB | — |
| 1024 | 75 MB | 143 MB | −88% / −83% |
| 512 | 43 MB | 100 MB | −93% / −88% |

**The saving is real and large, and it is almost all one asset.**
- Leaving only the skybox at full size gives back 547 MB (RTX) and 653 MB (UHD), **about 96%** of
  the full→1024 difference.
- `skybox/stars_panorama.jpg` is 8192×4096. The 11 planet and ring textures save tens of MB
  between them.

**The engine's own estimate misses most of it.**
- At full size it says 96.8 MB of textures; the GPU holds about 646 MB more than the empty
  engine, and geometry is 13.7 MB.
- The panorama `Cubemap` borrows its `Texture2D` and estimates itself at 0
  (`Cubemap.ts:476`, `_borrowedFrom`).
- Three.js then keeps the 8192×4096 panorama with a full mip chain (~171 MB as RGBA8) and builds
  its own cube render target to draw the background. Neither is in `estimatedTextureVramBytes`
  or in `estimatedRenderTargetVramBytes` (0).
- `renderer.textures` counts 20 GPU textures against 16 live engine textures: those 4 are three's.
- So the overlay and `Benchmark` under-report this scenario's GPU memory by ~5×. That is the
  number G2's 96.8 / 96.8 MB comparison was made with: both paths were equally blind to it.

**For decision #4's hardware.** On an Intel UHD laptop the ZIP the platform serves today takes
~0.9 GB of the student's system RAM, ~0.85 GB of it for one scenario and ~0.65 GB of that for the
star background. The platform plays ZIPs, not manifests, so the ladder does not help it yet. The
content fix (row SC-V4a) does.

## Rows

- **E-V4a** (engine, ⬜): count the GPU copies three makes of a borrowed equirectangular panorama
  (the mip-chained source and the background cube target) in `MemoryProfiler`, so the estimate
  tracks the measured figure.
- **SC-V4a** (content, ⬜): ship `stars_panorama.jpg` at 4096×2048, a quarter of the memory, and
  re-measure with this harness on both GPUs.
- The ladder itself needed no row: it works as designed.
