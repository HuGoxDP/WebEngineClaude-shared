# B1 phase 2 build notes — the navigation controller (B1.2)

Plan: `code-foundations/B1/plan.md` § Phase 2. Branch `B1-scene-and-objects` in `WebEngineTSEditor`
(+ `.claude-shared` for this file). Commit `35c2c4a`. Editor only — no engine change.

## What landed

- **`app/src/app/scene-view/scene-view-controller.ts`** (new) — Unity's Scene navigation as one
  class: `pivot / yaw / pitch / distance / orthographic / flySpeed` in engine space, deriving the
  three camera through `space.ts`. The pose is **derived** (pivot + dir·distance), so no gesture can
  drift. Pointer capture on every drag; the wheel listener is non-passive; the context menu is
  suppressed on the canvas only; key state is global on the window (the canvas is not focusable) with
  a blur release.
- **`scene-view-renderer.ts`** — the OrbitControls are gone (a second set of handlers on one canvas
  fought the pan: an MMB drag dollied behind the controller's back); the pivot now lives in the
  controller.
- **`viewport.service.ts`** — a facade that keeps the gizmo, the outline and picking, holds the
  controller, exposes `pivot` (for D-3 root creates) and `flying`; `frameOnObject` and Shift+F
  (`frameAndFollowSelection`) route through the controller.
- **`shortcuts.service.ts`** — F / Shift+F; the toolbar's W/E/R stand down while flying.
- **`settings.service.ts` + `settings-dialog.component.ts` + i18n (uk/en)** — `flySpeed`
  (default 5 u/s), validated positive.

## Invariants verified by probes (engine space via `window.__wetsProbe`)

- **DW-2.1**: Alt+LMB drag right 100 px → the distance to the pivot is unchanged (13.1149 →
  13.1149), yaw changes by the expected sign, pitch unchanged.
- **DW-2.2**: wheel one notch → distance 13.1149 → 11.5411 with the pivot at the origin; Alt+RMB
  drag dollies by the same scale (13.115 → 10.926).
- **DW-2.3**: MMB drag → the pivot moves and the camera position moves by the same vector, forward
  unchanged, distance to the pivot 13.1149 → 13.1149 (the derived pose makes it exact).
- **DW-2.4**: RMB+W 500 ms → ~3 units along the forward; Shift ≥ 3× (plain 1.4 vs shift 15.0 in one
  probe; the exact ratio is frame-rate dependent); Q/E along ∓Y (+Y and −Y confirmed); RMB look
  keeps the position and changes the forward.
- Keys are capture-phase on the window, so a fly key never reaches the undo/tool shortcuts.

## Bugs found and fixed during this phase (each found by a probe)

1. **A second camera controller**: the OrbitControls' MMB autoscroll/wheel still dollied — removed
   the controls entirely (the pivot moved to the controller).
2. **Wheel zoom inverted**: `deltaY < 0` (toward the user) now zooms in — the distance drops.
3. **`camera.forward` on the raw three camera** threw inside the fly (the interface only guarantees
   the pose) — replaced with a quaternion-derived forward.
4. **Keys never reached the controller** (canvas is not focusable) → fly never started — moved to
   the window in the capture phase.
5. **applyPose mixed spaces** (the unmirrored pivot added to a mirrored offset), which made the
   distance to the pivot drift on a pan — both are converted once through `space.ts`.

## Checks (one run, all green)

- `npx ng build` — green (the initial-bundle budget warning predates this work).
- `npm run e2e` — **202 / 202 checks**, all old scenarios unchanged (including the pixel-coupled
  "honest saving" and the recovery race). One flake on the first run ("a copy exists again")
  re-passed in isolation and in the next full run — same file, no code change.
- `npm run e2e:build` — green.

## What's left

Phase 3 (the orientation cube, `lookAlong`/`toggleProjection` are already on the controller),
Phase 4 (tools), Phase 5 (box selection), 6 (component gizmos), 7 (lighting/draw modes/grid),
8 (docs). DW-2.7 (the human feel check) stays for the report.
