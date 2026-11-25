# C6r9 plan: readPixels source rect, GL bottom-up row, Camera.render flush

**Status:** ready. **Date:** 2026-11-25. **Size:** S. **Research:** research.md. **Risk overall:** normal.
Rule: existing tests are never modified; new test files only. No shared files touched (CHANGELOG entry is phase 4, integrator).

## Phase 1 — Texture2D reads from the source rectangle
**File scope:** WebEngineTS: src/engine/core/graphics/Texture2D.ts, tests/RenderTextureReadSource.test.ts (new)
**AC:** AC-3
**Risk:** normal
Steps: in `readPixels` clip source to the target, then destination; for negative `destX/destY` advance src x/y by the clipped amount and shrink w/h; call `_readBack(srcX', srcY', width, height, bytes)`; write at `(left+col, top+row)`. Update the comment.
New test: stub `RenderTexture._readHook` to answer from an (x,y)-addressed pattern (value encodes x,y; hook honours its x,y and fills top row first; record the args). Cases: 4x2 target, `Rect(1,0,2,1)` at (0,0) gives top-row middle pixels; `Rect(64,64,128,128)` of 256x256 hook receives (64,64,128,128); `destX=10` leaves hook x unchanged and writes at texture x=10; `destX=-2` hook x = source.x+2, width reduced.
**Done when:** `npx vitest run tests/RenderTextureReadSource.test.ts tests/RenderTextureReadback.test.ts` passes; `npx tsc --noEmit` clean.
- [ ] DW-1.1 hook gets source x/y, never the destination
- [ ] DW-1.2 negative dest clips and advances the source
- [ ] DW-1.3 destX/destY shift only the write position
- [ ] DW-1.4 old Readback test file untouched and green

## Phase 2 — WebGL backend converts to GL bottom-up row
**File scope:** WebEngineTS: src/engine/core/rendering/WebGLRenderBackend.ts, tests/WebGLReadPixelsRows.test.ts (new)
**AC:** AC-3
**Risk:** normal
Steps: call `readRenderTargetPixels(rt, x, target.height - y - height, width, height, out)`; keep the row flip; document the hook contract (clipped source rect, top-down). Test: build the backend with a fake renderer (follow how `tests/RenderBackend.test.ts` constructs one) whose `readRenderTargetPixels` records its arguments and fills a bottom-up pattern; assert glY for (0,0,W,H) = 0, for a sub-rect = H-y-h, and `out` is top row first.
**Done when:** `npx vitest run tests/WebGLReadPixelsRows.test.ts tests/RenderBackend.test.ts` passes; `npx tsc --noEmit` clean.
- [ ] DW-2.1 glY = height - y - h recorded by the fake
- [ ] DW-2.2 returned rows top-first, full-target read unchanged
- [ ] DW-2.3 half-float and short `out` still return false

## Phase 3 — Camera.render flushes dirty transforms
**File scope:** WebEngineTS: src/engine/core/components/Camera.ts, tests/CameraRenderFlush.test.ts (new)
**AC:** AC-3 (U-2 flush part; research D12)
**Risk:** normal
Steps: in `render()` after the guards and before the hook call `Transform._syncAllDirty()` and `SceneManager.activeScene._internalThreeScene.updateMatrixWorld(true)` (mirror `Application._render`); avoid import cycles. Test: enable `Transform.dirtyTransformsEnabled`, set `_renderHook` to read a moved object's `matrixWorld`/world position, move the object, call `camera.render()`, assert the new position; restore the switch in `afterEach`. Also assert the no-hook warning path is unchanged.
**Done when:** `npx vitest run tests/CameraRenderFlush.test.ts` passes plus the existing Camera/RenderTexture suites; tsc clean.
- [ ] DW-3.1 moved object seen at its new position inside the hook
- [ ] DW-3.2 switch restored after test; frame render path untouched

## Phase 4 — Integrator: notes and full gate
**File scope:** WebEngineTS: CHANGELOG.md
**AC:** AC-3
**Risk:** normal
Add a *Fixed* line (readPixels source rectangle, GL row origin, Camera.render flush; frame pixels without a target unchanged). Run the full `npx vitest run` and `npx tsc --noEmit`.
**Done when:** full vitest and tsc pass; CHANGELOG lists the three fixes.
- [ ] DW-4.1 CHANGELOG entry present
- [ ] DW-4.2 full suite green
