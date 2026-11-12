# B1 phase 5 build notes — selection and the orange outline (B1.5)

Plan: `code-foundations/B1/plan.md` § Phase 5. Branch `B1-selection-outline` in `WebEngineTSEditor`
(+ `.claude-shared` for this file). Editor only — no engine change (D-1).

## What landed

- **`app/src/app/scene-view/scene-picker.ts`** (new) — D-10's picking: the nearest hit by
  raycast, and the rectangle selection by projected renderer bounds (the box's 8 corners →
  a screen AABB), with objects behind the camera dropped first. `objectScreenRect(name)` is the
  probe's read-back and the rectangle's target.
- **`app/src/app/scene-view/selection-outline.ts`** (new) — D-9's screen-space mask post-pass:
  each frame with a selection, every selected mesh is drawn flat white into a canvas-sized render
  target through **proxy meshes** that share the engine mesh's geometry and copy its `matrixWorld`
  (read-only, `DoubleSide`, no depth test), then a full-screen quad draws Unity orange `#FF6600`
  wherever the mask is empty and any sample within 2 pixels of it is filled. Objects without a mesh
  (lights, cameras, empties) keep a thin dim-orange `BoxHelper`. No `EffectComposer`, so the scene's
  own render — and therefore its colour handling — is untouched.
- **`scene-view/scene-view-renderer.ts`** — a D-2 step 7 post-pass hook (`setPostPass`), called
  after every layer with the WebGLRenderer, so the outline composites straight onto the canvas.
- **`app/src/app/viewport.service.ts`** — the left button's three meanings (handle drag / rectangle
  draft / click), the rectangle's DOM div and its Shift/Ctrl resolution, `_pickAt` and the rect
  select routing through the picker, and the modifiers (`the modifiers the press recorded decide
  what the release does`).
- **`shell/workspace.component.ts`, `styles.css`, `e2e/run.mjs`** — the rectangle draft's styling
  (a div over the canvas, never a WebGL object) and the new scenario.
- **`debug-probe.ts`** — `objectScreenRect(name)` and `pixelStats(rect)` (a hue count over a
  client-pixel rectangle, reading the frame in one task like `pixel`).

## Bugs found and fixed during this phase (each found by a probe or the new e2e)

1. **The rectangle draft was in canvas pixels and the picker works in client pixels** — the
   marquee selected whatever happened to intersect the canvas-relative rectangle (the wrong cube).
2. **The handle sat on the first object of the selection set, not the active one** — Unity's Pivot
   and Local modes take their position and axes from the *active* object, which is the one toggled
   last. `_reseatHandles` now orders the primary first.
3. **three's `attach()` undid the tool's visibility** — with the Q (view) tool the handle sets still
   drew (and their pickers still took presses), because `setTargets` re-attaches the proxy and
   `attach()` shows the roots again. `_applyMode` runs after it.
4. **A Shift+click started the browser's native text selection**, which then swallowed every later
   mouse event on the canvas: `user-select: none` on the canvas plus `preventDefault` on the press.
5. **The outline's rim drew in linear colour** — three's `Color(0xff6600)` uniform is the working
   space, and the shader writes straight to the default framebuffer, so Unity's orange landed as a
   much darker green. The uniform is now the sRGB bytes.
6. **The rectangle's division by zero on a zero-area draft** — a draft that never grows past a few
   pixels is a click (D-10's edge case); the release now routes through the click path.
7. **`lookAll`'s stale axes** — three keeps `axis` from the last hover, so a "hovered handle" test
   read a value left over from an earlier position; the View tool hides the sets, which is what the
   click tests use.

## Invariants verified by the new e2e

- **DW-5.1**: four cubes at x = −3, −1, 1, 3; a rectangle around the first three selects exactly
  those three (the Hierarchy's highlights agree); Shift+rectangle around the fourth → four;
  Ctrl+click on one → three.
- **DW-5.2**: a click selects, a click on empty space clears, Shift+click adds and removes again.
- **DW-5.3**: a selected cube has ≥ 200 orange pixels around its screen rect and 0 when deselected
  (the View tool is used so the only colour is the outline's); the green the old `BoxHelper` used is
  gone.
- **DW-5.4**: a run of selection changes does not mark the scene unsaved and leaves the undo stack's
  top where it was (one Ctrl+Z still removes the object created just before them).
- The click points are a cube's projected corners, not its centre: the translation handle's centre
  box owns the pivot, exactly as Unity's does.

## Checks

- `npx tsc -p tsconfig.json --noEmit` — clean; `npx ng build` — green.
- `npm run e2e` against the production bundle served statically (`http://localhost:4201/`) — the
  `selection:` scenario passes on its own; the full-suite run is in the report.

## Deviations

- **The outline is a post-pass, not an `OutlinePass`** — D-9's reason stands (the viewport must keep
  matching the platform's own render). The cost is one render target the size of the canvas and one
  extra draw per frame with a selection; DW-5.5's frame-time note goes in the report.
- **Objects without meshes get a dim box**, as D-9 records (Unity highlights their gizmo instead —
  that is D-11's phase).
- The rectangle is a DOM div, so it never enters the WebGL frame (D-10's wording) and nothing about
  it is serialized.

## What's left

Phase 6 (component gizmos + the Gizmos menu), 7 (lighting/draw modes/grid, the platform check, the
catalog scenario), 8 (docs).
