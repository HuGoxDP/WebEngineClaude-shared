# B1 phase 4 build notes — the transform handles (B1.4)

Plan: `code-foundations/B1/plan.md` § Phase 4. Branch `B1-transform-handles` in `WebEngineTSEditor`
(+ `.claude-shared` for this file). Editor only — no engine change (D-1).

## What landed

- **`app/src/app/scene-view/transform-handles.ts`** (new) — D-6's handles on an **editor proxy**:
  a plain `Object3D` in the overlay scene, placed in three space where Unity's Pivot/Centre and
  Local/Global toggles put the handle, and driven by three `TransformControls` (one per mode, so
  `Y` can show all three sets at once — the only way three's controls do that). Each frame of a
  drag the proxy's TRS delta is written to every selected engine `Transform`, in engine space, from
  each target's pose at the press (absolute, not accumulated).
- **`viewport.service.ts`** — re-wired around the handles: `tool` / `pivotMode` / `handleSpace` /
  `snapOn` signals, the magnet, Ctrl-held snapping (read on the window, so a key pressed mid-drag
  takes effect), `hoverAxis` / `hoverAll` / `handlePoint` for the probe, one undo entry per drag.
  The seat is driven from the frame loop's revision check rather than from inside an Angular effect
  (see the bugs).
- **`scene-view/scene-view-controller.ts`** — the View tool (Q): the left button pans.
- **`shortcuts.service.ts`** — Q / Y (Ctrl+Y stays redo).
- **`settings.service.ts` + `settings-dialog.component.ts`** — `rotateSnap` (15°) and `scaleSnap`
  (0.1) beside the existing move step.
- **`shell/workspace.component.ts` + `styles.css` + i18n (uk/en)** — the palette buttons are live
  (Q, Y), Pivot↔Centre and Global↔Local switch, the magnet toggles, and the hint line lists Q·Y.
- **`debug-probe.ts`** — `hoverAxis()`, `hoverAll()`, `transformOf(name)` (position, rotation,
  Euler degrees, scale), `handlePoint('X'|'Y'|'Z')` for the handle's own axes.
- **`e2e/run.mjs`** — the `transform handles:` scenario (DW-4.1..4.6).

## Bugs found and fixed during this phase (each found by a probe or the new e2e)

1. **The three controls were never given their modes** — a fresh `TransformControls` is always a
   translate gizmo, so the rotate and scale sets drew and dragged as translate: the turn gizmo
   translated the object, `Y` showed three identical translate handles. `setMode` per instance.
2. **`controls.space` was never set** — the proxy's quaternion aims the handle at the object's own
   axes, but only a Local-space *control* drags along them: every Local drag moved along world X.
3. **The write-back accumulated the delta** — the cumulative proxy delta was added to the object
   each frame, so a 56 px drag moved it 9× the right distance. It now writes from each target's
   pose at the press, absolutely.
4. **`setTargets` inside the selection effect re-queued the effect** in a tight loop (the effect ran
   with identical signal values, hundreds of times a second, and the app never settled). The handle
   is now seated from the frame loop's revision check instead.
5. **A drag re-seated the handle every frame** (the revision changes each write-back for the
   Inspector), which snapped the proxy back and collapsed the drag — guarded with `dragging`.
6. **The capture-phase pointerup cleared the drag owner** before three's own release event, so the
   undo entry was never pushed: Ctrl+Z undid the *create* instead of the drag. Only a press that did
   **not** become a drag now hands the sets back.
7. **The proxy was not in a scene graph** — three's `TransformControls` refuses a detached object and
   logged it every frame (which the e2e's page-error check would have failed). Added to the overlay.
8. **The Q tool's tool-switch did not reach the controller**, so LMB kept selecting instead of
   panning — `setTool` now tells the navigation controller.
9. **The space change did not reach the controls** (`setHandleSpace` forgot `applyMode`), the same
   class as bug 2.

## Invariants verified by the new e2e

- **DW-4.1**: Preferences move step 0.5; Ctrl-held drag of the X arrow → `position.x` a multiple of
  0.5, y/z untouched; the same drag without Ctrl does not land on the step (and differs from the
  snapped value); one undo restores.
- **DW-4.2**: an object at 45° about Y — a Global X drag keeps Δz 0; a Local X drag gives
  |Δx| ≈ |Δz| ≠ 0 (the object's own X).
- **DW-4.3**: two cubes (one at (4,0,0)) — Pivot puts the handle on the active object, Centre
  between them at a different screen place; a drag moves both by the same delta; one Ctrl+Z restores
  both.
- **DW-4.4**: Q → `hoverAxis()` null over the canvas and LMB pans; Y → `hoverAll()` finds the
  translate, rotate and scale sets on one object, and a drag in Y mode moves it.
- **DW-4.5**: a Ctrl-dragged turn lands on 15° (the Preferences step).
- **DW-4.6**: the old "honest saving" scenario passes unchanged — it now finds the move arrow
  through the probe, so the corrected pose and the new handles do not disturb it.

## Checks (one run, all green)

- `npx tsc -p tsconfig.json --noEmit` — clean; `npx ng build` — green (the pre-existing bundle
  budget warning).
- `npm run e2e` against the production bundle served statically (`http://localhost:4201/`) —
  **294 checks, "All checks passed"** in the final run; the `transform handles:` scenario passes
  twice in a row on its own. Three load flakes surfaced on the way (a reload's fixed 800 ms wait,
  the wizard's 1 s focus budget, and one format-scenario run) — each now waits for what it asserts
  instead of a fixed duration; the assertions are unchanged.

## Deviations

- **Three `TransformControls` instances, one proxy.** Three's controls handle a single mode per
  instance (`pointerHover` raycasts only that mode's picker), so the combined `Y` tool needs three.
  With `Y` active the three sets are co-located on the same axes (Unity's combined gizmo overlaps
  the same way), so a press is given one owner before three sees the event ({@link claimPointer})
  and the probe reports every set's hover ({@link hoverAll}).
- **The plane handles intercept an arrow's tip** at some angles (three's picker geometry): the e2e
  finds an arrow by hovering for it rather than by computing its tip, which is also what a user does.
- **Scale in Global space applies the ratio to `localScale`** directly — correct in Local space and
  for unrotated objects; a rotated object's world-space scale axes are left to a later phase (the
  plan's scope is the toggle and the increments).
- DW-4.7 (the human feel check) stays for the report.

## What's left

Phase 5 (box selection, modifiers, the orange outline), 6 (component gizmos), 7 (lighting/draw
modes/grid, the platform check, the catalog scenario), 8 (docs).
