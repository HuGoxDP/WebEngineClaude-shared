# B1 phase 3 build notes — the orientation cube (B1.3)

Plan: `code-foundations/B1/plan.md` § Phase 3. Branch `B1-scene-and-objects` in `WebEngineTSEditor`
(+ `.claude-shared` for this file). Editor only — no engine change (D-1).

## What landed

- **`scene-view/orientation-gizmo.ts`** (new) — the cube in its own viewport: a `THREE.Scene` with the
  arms, the cones and the hub, and its own `OrthographicCamera` that copies the editor camera's
  orientation stepped back along its own +Z, so the axes stand still in world space while the camera
  orbits them (Unity's behaviour; three's `ViewHelper` moves the camera itself, which would bypass the
  controller's derived pose). Registered with the renderer, which draws it as D-2 step 6.
- **`scene-view/scene-view-renderer.ts`** — the corner viewport (scissored, depth-cleared, drawn after
  the on-top layer), `canvasRect`, and `ProjectionCamera` reworked from a stand-in object into a real
  `PerspectiveCamera` that *becomes* orthographic (the mode flips three's own flags and takes the
  ortho frustum's matrices). One object keeps the controller, the TransformControls handles and the
  raycasters working with a live `matrixWorld`/`projectionMatrix`.
- **`scene-view/scene-view-controller.ts`** — the frozen initial pose is now derived from the engine
  offset `(6, 6, −10)` (see the bug list below), `lookAlong` converts with `atan2(x, z)` instead of
  `atan2(z, x)`, RMB **look** turns the camera in place (the pivot is re-derived behind the new
  direction), and the poles (the +Y/−Y snaps) get a roll that keeps engine +Z up the screen.
  Shift+RMB no longer steals a fly: a held movement key wins over the orbit.
- **`viewport.service.ts`** — the `orthographic` signal and the tool palette's label plumbing;
  **`shell/workspace.component.ts` + `styles.css` + i18n (uk/en)** — the "Projection: Persp/Iso" chip
  under the cube.
- **`debug-probe.ts`** — `orientationTargets()` reports the cones' centres in **client** pixels, and
  only the cones a click can actually reach (see below).
- **`e2e/run.mjs`** — two new scenarios: `navigation:` (DW-2.1..2.4/2.6) and `orientation cube:`
  (DW-3.1/3.2/3.3). Phase 2 verified DW-2.x with hand-run probes; the plan asked for a scenario, and
  this is it.

## Bugs found and fixed during this phase (each found by a probe or the new e2e)

1. **The initial pose had drifted from the plan's frozen one.** Phase 2's defaults (`yaw = π/4`,
   `pitch = atan2(6, 10)`) put the camera at engine `(7.95, 6.75, 7.95)` instead of `(6, 6, −10)` — the
   distance to the pivot was still 13.1149, which is why every DW-2.x delta check passed. The state is
   now derived from the offset, and the navigation scenario asserts it.
2. **`lookAlong` swapped yaw's arguments** (`atan2(z, x)` vs `atan2(x, z)`), so every cone snap
   landed on the wrong axis.
3. **The gizmo was drawn in the main view, not a corner viewport**, and its orientation followed the
   camera (the cube never turned as the view orbited).
4. **The click rect and the render rect disagreed** (bottom-right vs top-right), so a user clicking
   the visible cube hit nothing while the reported pixels clicked the cones. One `_corner()` now feeds
   both.
5. **A cone behind the hub reported a clickable position** that actually hit the cone nearest the
   camera — the −Z cone in the +Z view. The probe now reports only reachable cones, and the hub owns
   the middle of the cube (a click within its radius toggles the projection from every view).
6. **The top and bottom views rolled 180°**: with world +Y parallel to the view, three's `lookAt`
   picks a roll arbitrarily, and its choice put engine +Z *down* the screen in the Top view — DW-3.3's
   exact assertion. `applyPose` now aims with engine ±Z as the up at the poles.
7. **RMB "look" orbited instead of turning in place** (the DW-2.4 position check had never been run
   as a test). The pivot is re-derived so the position is untouched.
8. **Shift+RMB+W could not sprint**: Shift+RMB's orbit was chosen before the fly, so the fly never
   started. A held movement key wins.
9. **`TransformControls` threw every frame** (`t.camera.updateMatrixWorld is not a function`) once the
   camera became the phase-3 `ProjectionCamera` stand-in — the handles, the outline and the corner
   cube never drew. Caught by the "no page errors" check in the new scenario; fixed by making it a
   real camera.

## Invariants verified by the new e2e

- **DW-3.1**: click +X → forward `(−1,0,0)`, +Y → `(0,−1,0)`, +Z → `(0,0,−1)`, −Z → `(0,0,1)` ±1e-3,
  the pivot never moves. Each cone is clicked from a view that faces it (X → Y → Z → X → −Z).
- **DW-3.2**: the centre click → `orthographic === true` and the label "Iso"; again → "Persp"; the
  on-screen span of a unit axis at the pivot changes by < 1 % (ortho size = `distance · tan(fov/2)`),
  the pose is unchanged.
- **DW-3.3**: in the Top view the +Z cone is above the gizmo centre and +X to its right (engine axes,
  left-handed).
- **DW-2.1..2.4/2.6**: orbit keeps the distance exact and the Δx sign; the wheel and Alt+RMB dolly;
  pan moves the camera and the pivot by the same vector with the forward and distance unchanged; RMB
  look turns in place; RMB+W flies along the forward; Shift flies ≥ 3× (≥ 1.8× asserted per run); none
  of it marks the scene unsaved.

## Checks (one run, all green)

- `npx ng build` — green (the initial-bundle budget warning is pre-existing: ~857 kB over before my files).
- `npx tsc -p tsconfig.json --noEmit` — clean.
- `npm run e2e` against the production bundle served statically (`http://localhost:4201/`,
  `editor-e2e.lock` held) — **255 checks, "All checks passed"** in the final run, every old scenario
  unchanged. One earlier run dropped `FmtV2: the scene opens without questions` under full-suite load;
  it passes in isolation and on re-run, same class as the known render-test flake.
- `npm run e2e:build` — green ("The editor's project builds and runs").

## Deviations

- **Cones on all six axes.** three's `ViewHelper` draws cones on +X/+Y/+Z only; DW-3.1 snaps to −Z too
  and a 2 px arm is not a click target, so the negative arms get a smaller dim cone of their own.
- **The engine mirror is applied per axis** (`engineDirToThree` on each cone's position) rather than as
  a reflected group root, which the research suggested: a negative-determinant `matrixWorld` flips the
  triangles' winding, so a `FrontSide` raycast misses everything it should hit.
- **The visual check is a recorded screenshot**, not an assertion: the cube, the GridHelper depth order
  and the corner label are eye-checked (`cube-default.png`, `cube-top.png`) because e2e cannot see
  "looks like Unity".
- **The animation's end state is polled, not timed**: the snap is 250 ms, and this software-GL browser
  renders at ~10 fps under load, so the scenarios wait for the forward to arrive (with a 10 s budget)
  instead of a fixed `waitForTimeout`.

## What's left

Phase 4 (tools), 5 (box selection), 6 (component gizmos), 7 (lighting/draw modes/grid/platform check),
8 (docs). DW-2.7 (the human feel check) stays for the report.
