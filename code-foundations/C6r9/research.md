# C6r9 research: readPixels source rectangle, GL row origin, Camera.render flush

**Status:** confirmed (autonomous). **Date:** 2026-11-25. Read against `origin/ms/1`.
Summary: four defects in the C6 readback path; the requirements are fixed by ROADMAP C6r9 and MS-2 AC-3 / U-2.

## Findings (all verified in code)
- `src/engine/core/graphics/Texture2D.ts:408-460` `readPixels`: computes `srcX/srcY/srcW/srcH` and the clipped
  `left/top/width/height` (destination), then calls `active._readBack(left, top, width, height, bytes)` — the
  destination offset is used as the source origin. `srcX/srcY` are dead. Negative `destX/destY` clip via
  `Math.max(0, …)` but the source is not advanced by the clipped amount.
- `RenderTexture.ts:492-508` `_readBack` / static `_readHook(target, x, y, w, h, out)` is a pure pass-through;
  `Application.ts:430` installs it onto `_backend.readPixels`. Contract (U-2): rect is the clipped SOURCE rect, top-down.
- `core/rendering/WebGLRenderBackend.ts:325-351` `readPixels` passes `y` straight to `readRenderTargetPixels`
  (GL origin = bottom row), then flips rows. Needs `glY = target.height - y - height`. Full read works only because y=0.
- `tests/RenderTextureReadback.test.ts` stubs the hook with its own row order, ignoring coordinates (DW-5.2) — cannot see either bug. Existing tests must not be modified: add new files.
- `core/components/Camera.ts:578-588` `render()` calls `Camera._renderHook(this)` with no flush; `Application._render`
  (1084-1089) does `Transform._syncAllDirty()` + `scene._internalThreeScene.updateMatrixWorld(true)` first.
  With `Transform.dirtyTransformsEnabled` an on-demand render draws stale positions.
- Frame pixels without a target must stay byte-identical (flush only touches transforms already dirty).

## Decisions
- Clip first in Texture2D: negative destX/destY advance src by the clipped amount; width/height from both clips.
- Hook receives clipped source rect; backend does the GL conversion (no other caller of `_readHook`).
- Flush in `Camera.render()` before the hook (after the existing guards); scene from `SceneManager.activeScene`.
## Open
None blocking. Whether Camera should import Transform/SceneManager (cycle check) — builder verifies with tsc/vitest; fall back to flushing inside the hook body only if a cycle appears.
