# C6 — Engine E8: a camera renders into a target — build notes (W3, 2026-11-12)

Branch: `C6-render-texture` in `WebEngineTS` (engine) and `.claude-shared` (this file, roadmap,
card status). Plan: `plan.md`; research and the binding decisions D1–D14: `research.md`.

Base at claim: `fe759bc` (the tip of `master`).

## What landed, per phase

| Phase | Commit | What |
|---|---|---|
| 1 | `881ec0a` | `src/engine/core/graphics/RenderTexture.ts` + `RenderTextureFormat`, exported at both sites of `index.ts`. The resource on its own: lazy GPU image, immutable descriptor once created, `_estimateVramBytes` pure arithmetic, `active` as a readback slot, no THREE type in the public surface. 21 tests. |
| 2 | `b0d2469` | The seam: `RenderBackend.renderScene(scene, camera, target?)` and `readPixels(...)`. Two pure helpers (`_clearPlan`, `_targetViewport`) so the decisions are testable without GL; the WebGL target branch with every state change restored in a `finally`; the screen branch byte-identical to `06aeaf5`. |
| 3 | `00e3acb` | `Camera.targetTexture`, `Camera.render()`, `Camera._screenCamera()`, the loop's target pass before the screen camera, and `_renderOne` shared by the loop and the hook. A target drives `pixelWidth`/`pixelHeight`/`aspect`. 9 frame-order tests. |
| 4 | `3f4c607` | Materials sample a target: `UnlitMaterial.mainTexture`, `StandardMaterial.albedoTexture`, `emissionTexture` widened to `Texture2D \| RenderTexture`; data slots stay `Texture2D`. Wrapper evidence in the subagent's report: the writer emits no guid and no pixels for a target (D11) — and there is no canvas-pixel inlining path at all. 19 tests. |
| 5 | `30f46af` | `Texture2D.readPixels` reads `RenderTexture.active` through a hook the Application installs; rows flipped to top-down; both rectangles clipped; the three refusals (no active target, half-float, non-readable). 8 tests. |
| 6 | `30f46af` | `MemoryProfiler` counts targets where render targets belong: `_surveyTextures` skips them, `estimatedRenderTargetVramBytes` gains their estimate (added even when the GL parts cannot be read), `renderTextures` counts the live created ones, `logReport` names it. 4 tests. |
| 7 | `06e52d1` | The browser check and what it found, as tests. |
| 8 | this file | Notes, roadmap, card, changelog, N4 paragraph. |

## Decisions taken during build (not in the research)

- **Public d.ts vs `@internal`.** The public `d.ts` names no THREE type in a public signature,
  but `_internalThreeRenderTarget` (like `Texture._internalThreeTexture`) is emitted and marked
  `@internal` — the repo's existing convention, not a leak. Evidence: `awk` of
  `dist/WebEngineTS.d.ts` for the `RenderTexture` block: the only THREE name is that accessor.
- **A flat plane is not a screen.** `Mesh.createQuad`'s winding is culled away in the engine's
  mirrored space — the mesh's own comment says it had never rendered. The check page's monitor is
  a scaled cube for that reason, and the fact is pinned in `tests/RenderTextureFrame.test.ts`
  so the next reader finds it in a test, not in a screenshot.
- **Anonymous callers of the loop.** The target pass iterates `Camera.allCameras`, which filters
  `isActiveAndEnabled`; a disabled camera's target still renders through `render()` — Unity's
  preview pattern, and what the editor needs in C2's edit mode.
- **`shoot.mjs` had to learn a worktree.** It resolved Playwright from `../../testv/virtual-lab/e2e`
  (the owner's layout) and failed with MODULE_NOT_FOUND from a worker worktree. It now honours
  `SHOOT_PLAYWRIGHT_DIR` (committed, `06e52d1`). Without it phase 7's visual half could not run at all.
- **Test-file deviation.** The plan's phase-2 file scope named `tests/RenderBackend.test.ts`'s
  FakeBackend; the interface gained `readPixels`, so five more test files with their own fake
  needed the same one-liner rather than the contract becoming optional.

## The headless format path

The check ran with ANGLE's software rasteriser (`--use-gl=angle --use-angle=swiftshader
--enable-unsafe-swiftshader`), so `EXT_color_buffer_half_float` **is** present and the
ARGBHalf path allocates a half-float target rather than falling back. The fallback (D7's warning
and `format` reporting ARGB32) was therefore not exercised in the browser; it is covered only by
the unit test that `DefaultHDR` resolves to `ARGBHalf`.

## Screenshots (double-run SHA256 pairs, `shoot.local/`)

`?base` is the byte-for-byte control; its page imports only what `06aeaf5` exports, because an
ES-module import of a missing name fails the whole module.

| variant | run 1 | run 2 | verdict |
|---|---|---|---|
| `?base` on this branch | `ec49e9e7…9720` | `ec49e9e7…9720` | identical |
| `?base` on `06aeaf5` (fresh build in a scratch dir) | `ec49e9e7…9720` | `ec49e9e7…9720` | **identical to the branch — DW-7.2** |
| default (monitor shows the side view on green) | `90adb472…58b0` | `90adb472…58b0` | identical |
| `?depthclear` (Depth clear + sub-rect viewport) | `b98417e6…eb0a` | `b98417e6…eb0a` | identical; previous contents survive outside the sub-rect |
| `?feedback` (side camera also sees the monitor) | `d6c05e55…19e2` | `d6c05e55…19e2` | identical; WebGL feedback warning, no page error, loop alive |
| `?readback` (target copied into a UI corner) | `3c715f6d…607f` | `3c715f6d…607f` | identical; the cube's side is upright, not upside down |

**What the shots show.** Default: the red cube and the blue sphere in the main view, and the
monitor (a thin box between the camera and the scene) textured with the side camera's target —
the cube's side view on the target's green clear colour. `?depthclear`: the left half of the
target keeps the previous frame's content and the sub-rect is cleared of depth only. `?feedback`:
the monitor's draw is dropped (the WebGL warning), the rest of the frame unchanged. `?readback`:
the corner canvas shows the same view, top row first.

**Findings the shots produced** — all in `tests/RenderTextureFrame.test.ts`: two cameras into one
target race (last clear wins); release → resize → create keeps rendering (D4); a destroyed
target stops each camera once; the readback's row order; and the quad-winding fact above.

**Controls that never made it into the table:** `?plain` (the engine's own coordinate-check
pattern — proves the engine draws at all), `?quadcheck`/`?quadonly`/`?bigquad` (the quad-winding
investigation), `?targetpeek` (the target's pixels painted large, which is how the box-instead-of-quad
choice was verified), `?sideonly` (the side camera's view on screen, which ruled out the camera),
`?lineartarget` (the colour-space experiment that ruled out sRGB decoding as the cause of the
first black monitor).

**One important negative result.** The first "black monitor" was not an engine defect: it was the
cube's unlit -X face as seen from the side. The controls (`?quadcheck` with a flat colour, then
`?targetpeek` reading the target's pixels on the CPU) proved the target itself was correct before
the lighting was changed.

## Remaining (follow-up rows, all ⬜ in the roadmap)

Screen camera stacking; `cullingMask` honoured; per-camera LOD; per-camera post-processing for
targets; a `RenderTexture` asset + serialised `Camera.targetTexture`; live RT in Canvas UI
(`RawImage`); `AsyncGPUReadback`/HDR readback; `Mesh.createQuad`'s winding (fix or document).

## Green run (DW-7.7)

`npm run typecheck` exit 0 · `npm test` **2999 passed / 2999 (184 files)**, fail 0, skipped 0 ·
`npm run build` exit 0. Per-phase: phase 1 21 tests, phases 2–3 13, phase 4 19, phases 5–6 12,
phase 7 6.
