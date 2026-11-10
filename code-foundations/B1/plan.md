# Plan: B1 — Editor stage 6: scene and objects
**Created:** 2026-11-10 (Claude, architect lane)
**Status:** ready
**Complexity:** complex
**Review cadence:** 1
**Check-ins:** quiet
---
## Context
The editor's Scene view still behaves like a three.js demo: `OrbitControls` on LMB, no primitives, a
green box for selection, inert Pivot/Local/Lighting/Gizmos chips. B1 makes it behave like Unity's Scene
view (stage 6 of `WebEngineTSEditor/docs/unity-editor-plan.md`): 3D Object menu, Unity navigation,
orientation cube, Q/Y tools with Pivot/Center, Local/Global and snapping, orange outline with box
selection, component gizmos, lighting toggle, draw modes and grid. Card:
`.claude-shared/tasks/B-milestone-1.md` § B1. Research and every decision with its evidence:
`code-foundations/B1/research.md` — **read it first; its Decisions D-1…D-14 are binding.**

**Success criteria (card + research):**
1. e2e: each of Cube, Sphere, Capsule, Cylinder, Plane, Quad is created from GameObject → 3D Object
   and from the Hierarchy "+", placed at the Scene view pivot, selected, undone in one step, saved,
   reopened and present with its mesh and material; the file stays scene version 1.
2. e2e: every navigation gesture of D-4 moves the editor camera as asserted by engine-space deltas;
   F frames, Shift+F follows; a human feel check is listed in the report.
3. e2e: orientation cube click on +X → camera forward = (−1, 0, 0) in engine space; centre → ortho
   and back.
4. e2e: snapped move lands on the step; Local vs Global differ on a rotated object; Q pans; Y shows
   all three handles; Pivot vs Center differ on a two-object selection.
5. e2e: box selects three of four cubes; Shift/Ctrl add/remove; the outline is orange and only while
   selected.
6. e2e: Gizmos menu toggles hide the camera frustum (count → 0); screenshots on/off in the report.
7. A scene with no light is dark in the editor (lighting on) **and** on the platform build; with a
   light (or lighting off in the editor) the cube is lit. Shaded/Wireframe and grid toggle work.
8. `npx ng build`, `npm run e2e` (all old scenarios unchanged and green), `npm run e2e:build` green;
   the stage-6 catalog scenario ZIP exists (§9 of the editor plan).

## Constraints
- Editor repo only (`WebEngineTSEditor/app`), plus this task's `.claude-shared` notes. **No engine
  change.** If an engine behaviour blocks a DW, stop and report it with file:line (ENGINE-GAPS
  procedure), never patch around it.
- Assumption **A8 is done** (merged `0c3bb5d`): the editor runs the current engine and opens scenes
  through `SceneSerializer`'s version check. Build on `origin/master` at or after `0c3bb5d`.
- Editor-only drawing never enters the engine scene graph or a `GameObject` (card gotcha); the only
  reaches into three are the ones listed in D-1, all under `app/src/app/scene-view/`.
- All editor logic in engine space; three conversion only through `scene-view/space.ts`.
- UI strings in uk and en. Build and test on the production bundle (`npx ng build` + `npm run e2e`),
  never only on `ng serve`.
- Existing e2e scenarios must pass **unchanged**. A genuinely wrong old test is fixed in its own
  commit with the reason (and in the report); never weaken or delete a check.
- **e2e runs hold `editor-e2e.lock`**: `bash R/.workers/wk.sh lock editor-e2e W<n> B1` before
  `npm run e2e` / `e2e:build` (fixed port 8044 and the shared OPFS profile), `unlock editor-e2e W<n>`
  after, on every exit path; beat during long runs.
- Anything this plan does not answer is a question: park the task (ATTENTION), do not guess.

---
## Implementation Phases

### Phase 1: Scene-view skeleton, render order, debug probe, 3D Object menu (B1.1)
**Skills:** code-foundations:aposd-designing-deep-modules, code-foundations:cc-defensive-programming
**Model:** sonnet
**Gate:** Full
**Depends on:** none
**File scope:** app/src/app/viewport.service.ts (becomes a thin facade or moves), app/src/app/scene-view/space.ts, app/src/app/scene-view/scene-view-renderer.ts, app/src/app/scene-view/debug-probe.ts, app/src/app/services/commands.service.ts (createMenu, primitives, placement), app/src/app/i18n/en.ts, app/src/app/i18n/uk.ts, app/e2e/run.mjs

**Goal:** a home for every later phase, a render order that keeps editor drawing on top, a test probe,
and the six primitives.

**Scope:**
- IN: `space.ts` (engine↔three for points, directions, quaternions; doc comment cites
  `WebEngineTS/src/engine/core/Scene.ts:126–129`); `SceneViewRenderer` owning the frame (D-2 order;
  removes the overlay hemisphere/directional lights and the `AxesHelper`); `debug-probe.ts` (D-13,
  installed only with `localStorage['wets:debug:probe']==='1'`; e2e `instrument()` sets it);
  3D Object submenu in `createMenu` (shared by GameObject menu and Hierarchy "+"/context) with D-3
  sizes, `MeshFilter` + `MeshRenderer` + `StandardMaterial` + Unity's collider; root creates placed at
  `viewport.pivot` (still the OrbitControls target in this phase), children at local zero; same
  placement for every root create; one `history.record` each; i18n keys.
- OUT: new navigation (Phase 2).

**Edge cases:** create while nothing is open (menu disabled as today); create under a scaled/rotated
parent → local zero; create twice quickly → two undo entries (labels differ per kind or
`commitPendingEdit` before each create); `StandardMaterial` inlining must not make the scene version
2 (assert).

**Produces:** `space.ts`, `SceneViewRenderer` with ordered layers (`addOverlayLayer(kind, obj)`),
the probe API, `viewport.pivot` accessor.

**Done when:**
- [ ] DW-1.1: e2e `3d objects`: for each of the six kinds, from GameObject → 3D Object: one object
  with the right name is selected, `transformOf` = pivot (origin), Ctrl+Z removes it in one step,
  Ctrl+Y brings it back.
- [ ] DW-1.2: same from Hierarchy "+" and from the context menu of an object (→ child at local zero).
- [ ] DW-1.3: save → close → reopen: all six present; the saved JSON has `version: 1`, a
  `PrimitiveMesh` with the D-3 kind/args on each `MeshFilter`, a material on each `MeshRenderer`,
  and the D-3 collider type.
- [ ] DW-1.4: with a cube at the origin selected and the move tool on, `pixelStats` finds the gizmo's
  red X arrow pixels **over** the cube (render order), and the old "honest saving" scenario passes
  unchanged.
- [ ] DW-1.5: `grep -rn "_internal" app/src/app` lists only the D-1 access points (record the output
  in the build notes).

### Phase 2: Navigation controller (B1.2)
**Skills:** code-foundations:cc-pseudocode-programming, code-foundations:cc-control-flow-quality
**Model:** sonnet
**Gate:** Standard
**Depends on:** Phase 1
**File scope:** app/src/app/scene-view/scene-view-controller.ts, app/src/app/viewport.service.ts (drops OrbitControls, wires the controller), app/src/app/services/shortcuts.service.ts (F, Shift+F), app/src/app/services/commands.service.ts (frameSelection), app/src/app/services/settings.service.ts (flySpeed), app/src/app/settings/settings-dialog.component.ts, app/src/app/i18n/en.ts, app/src/app/i18n/uk.ts, app/e2e/run.mjs

**Goal:** Unity's Scene view navigation in one class, exactly as D-4.

**Scope:**
- IN: Alt+LMB orbit, Alt+RMB dolly, RMB look, RMB+WASDQE fly (Shift ×4, wheel while flying scales
  speed), MMB/Alt+MMB pan, wheel zoom toward pivot, F frame (animated), Shift+F follow until the next
  user gesture; LMB is left to selection (Phase 5 adds the rectangle; here LMB click still picks);
  ortho mode: RMB orbits; context menu and Alt keyup suppressed on the canvas only; pointer capture;
  initial pose unchanged (engine `(6,6,−10)`, pivot origin); `flySpeed` in Preferences.
- OUT: orientation cube (Phase 3).

**Edge cases:** pointer leaves the canvas mid-drag (capture keeps it); RMB released while W held →
flying stops; window blur → all keys released; text field focused → WASD ignored; frame an empty
object (pivot only) or a multi-selection; zoom at minimum distance does not pass through the pivot;
Shift+F then delete the followed object → follow ends without errors.

**Done when:**
- [ ] DW-2.1: e2e `navigation`: Alt+LMB drag right by 100 px → camera orbits about the pivot:
  distance to pivot unchanged (±1e-3), forward yaw changes sign-correctly (camera moves to the left
  around the pivot as in Unity — assert the expected sign of Δposition.x in the probe's engine space).
- [ ] DW-2.2: wheel one notch forward → distance to pivot decreases, pivot unchanged; Alt+RMB drag
  likewise dollies.
- [ ] DW-2.3: MMB drag → camera and pivot move by the same vector, forward unchanged.
- [ ] DW-2.4: RMB drag → camera position unchanged (±1e-3), forward changes; RMB held + W for 500 ms
  → position moves along forward; with Shift held the distance covered is ≥ 3× the plain run;
  Q/E move along −Y/+Y.
- [ ] DW-2.5: select a cube at (5,0,5), F → pivot = its bounds centre, cube's screen rect inside the
  canvas; Shift+F then move the cube by the inspector → pivot follows; an Alt+LMB orbit ends following.
- [ ] DW-2.6: none of the gestures marks the scene unsaved or adds an undo entry.
- [ ] DW-2.7 (manual, in the report): a Unity user's feel check — orbit, fly, pan, zoom speeds; list
  what felt off.

### Phase 3: Orientation cube (B1.3)
**Skills:** code-foundations:aposd-designing-deep-modules
**Model:** sonnet
**Gate:** Standard
**Depends on:** Phase 2
**File scope:** app/src/app/scene-view/orientation-gizmo.ts, app/src/app/scene-view/scene-view-controller.ts (lookAlong, toggleProjection, ortho camera), app/src/app/scene-view/scene-view-renderer.ts (corner viewport), app/src/app/shell/workspace.component.ts (label below), app/src/app/i18n/en.ts, app/src/app/i18n/uk.ts, app/e2e/run.mjs

**Goal:** D-5 — an engine-space orientation cube in the top-right corner.

**Done when:**
- [ ] DW-3.1: e2e: click the +X cone (position from probe `orientationTarget('posX')`) → after the
  animation camera forward = (−1,0,0) ±1e-3, pivot unchanged; same for +Y (forward (0,−1,0)) and +Z
  (forward (0,0,−1)) and −Z (forward (0,0,1)).
- [ ] DW-3.2: click the centre → `camera().orthographic === true`, label "Iso"; again → perspective,
  label "Persp"; screen rect of a cube at the pivot changes by < 15 % across the toggle.
- [ ] DW-3.3: the Z arm is in engine space: after clicking +Y (Top view, Unity's orientation: engine
  +Z up the screen), probe `orientationTarget('posZ')` lies above the gizmo centre in screen space and
  `orientationTarget('posX')` to its right.

### Phase 4: Tools — Q, Y, Pivot/Center, Local/Global, snapping (B1.4)
**Skills:** code-foundations:cc-defensive-programming, code-foundations:cc-pseudocode-programming
**Model:** sonnet
**Gate:** Full
**Depends on:** Phase 3
**File scope:** app/src/app/scene-view/transform-handles.ts, app/src/app/viewport.service.ts (tool, pivotMode, handleSpace, snap state), app/src/app/shell/workspace.component.ts (tool palette, Pivot/Local chips, magnet toggle), app/src/app/services/shortcuts.service.ts (Q, Y, Ctrl hold), app/src/app/services/settings.service.ts (rotateSnap, scaleSnap), app/src/app/settings/settings-dialog.component.ts, app/src/app/i18n/en.ts, app/src/app/i18n/uk.ts, app/e2e/run.mjs

**Goal:** D-6 — handles on an editor proxy, multi-object aware, with Unity's toggles and snapping.

**Scope:**
- IN: proxy-based `TransformHandles`; tools Q/W/E/R/Y (palette buttons enabled; Rect stays disabled,
  stage 18); Pivot/Center and Local/Global chips (dropdown or toggle, persisted in `localStorage`);
  magnet toggle (default off) + Ctrl-held snapping; increments from Preferences; one undo entry per
  drag via `pushSnapshot`; inspector refresh via `selection.notifyChanged`.
- OUT: vertex/surface snapping (stage 25).

**Edge cases:** selection of a parent and its child → only the parent is moved; destroyed object while
attached (existing guard); undo during a drag; Ctrl pressed mid-drag switches snapping live; scale
with a negative or zero result clamped as TransformControls does; Center with objects without bounds →
their pivots count as points.

**Done when:**
- [ ] DW-4.1: e2e: Preferences move step 0.5; cube at origin; Ctrl held, drag the X arrow (located with
  `handlePoint('X')` + `hoverAxis()`) → `transformOf('Cube').position.x` is a non-zero multiple of 0.5
  (|x − round(x/0.5)·0.5| < 1e-6), y and z unchanged; the same drag without Ctrl and magnet off →
  generally not a multiple (assert it differs from the snapped run's value).
- [ ] DW-4.2: cube rotated (0,45,0): Global drag of X → Δz = 0; Local drag of X → Δx ≈ Δz ≠ 0 (engine
  space, sign matching the object's local +X).
- [ ] DW-4.3: two cubes at (0,0,0) and (4,0,0) both selected: Pivot → `handlePoint` origin at the
  active cube's pivot; Center → at (2,0,0); a move drags both by the same delta; one Ctrl+Z restores
  both.
- [ ] DW-4.4: Q → no handle (`hoverAxis()` null anywhere), LMB drag pans (Phase 2 assertion);
  Y → hovering finds translate, rotate and scale axes on one object.
- [ ] DW-4.5: Rotate drag with snapping → rotation about Y is a multiple of 15°.
- [ ] DW-4.6: old "honest saving" scenario passes unchanged.

### Phase 5: Selection — box, modifiers, outline (B1.5)
**Skills:** code-foundations:aposd-designing-deep-modules, code-foundations:performance-optimization
**Model:** sonnet
**Gate:** Full
**Depends on:** Phase 4
**File scope:** app/src/app/scene-view/selection-outline.ts, app/src/app/scene-view/scene-picker.ts (click + rect), app/src/app/viewport.service.ts (pointer routing), app/src/app/shell/workspace.component.ts (rectangle div), app/src/styles.css, app/e2e/run.mjs

**Goal:** D-9 and D-10.

**Edge cases:** rectangle drawn right-to-left/bottom-to-top; rectangle with zero area = click;
selection containing an object deleted by undo; canvas resize mid-session (mask target follows);
child meshes of a selected empty parent get outlined; meshes behind the camera not selected.

**Done when:**
- [ ] DW-5.1: e2e: four cubes at x = −3, −1, 1, 3; a rectangle around the first three (screen rects
  from `objectScreenRect`) selects exactly those three (Hierarchy highlights agree); Shift+rectangle
  around the fourth → four; Ctrl+click on the second → three.
- [ ] DW-5.2: click on a cube selects it; click on empty space clears; Shift+click toggles.
- [ ] DW-5.3: a selected cube → `pixelStats` counts ≥ 200 orange (#FF6600 ±40) pixels around its screen
  rect; deselected → < 10; the old green `BoxHelper` is gone for meshes.
- [ ] DW-5.4: selection changes do not mark the scene unsaved and add no undo entry.
- [ ] DW-5.5: frame time with 50 selected cubes recorded in the build notes (not a gate).

### Phase 6: Component gizmos and the Gizmos menu (B1.6)
**Skills:** code-foundations:aposd-designing-deep-modules
**Model:** sonnet
**Gate:** Standard
**Depends on:** Phase 5
**File scope:** app/src/app/scene-view/component-gizmos.ts, app/src/app/scene-view/gizmo-icons.ts, app/src/app/shell/workspace.component.ts (Gizmos dropdown), app/src/app/i18n/en.ts, app/src/app/i18n/uk.ts, app/e2e/run.mjs

**Goal:** D-11 — light, camera, collider and audio gizmos, toggled per type.

**Edge cases:** disabled component or inactive object → no gizmo; spot angle 0/179; camera far = 1e6
(display clamp); collider on a scaled parent; component removed in the inspector → its gizmo goes
the next frame.

**Done when:**
- [ ] DW-6.1: e2e: in the "Light and camera" template, `gizmoCounts()` reports cameraFrustum 1 and
  directionalLight 1; unchecking Camera in the Gizmos menu → cameraFrustum 0, light still 1; master
  toggle off → all 0; settings survive a reload.
- [ ] DW-6.2: a cube's BoxCollider wireframe count 1; PointLight range circles follow `range` edited in
  the inspector (probe returns the radius).
- [ ] DW-6.3: screenshots `.shots/b1-gizmos-on.png` and `b1-gizmos-off.png`, attached to the report.
- [ ] DW-6.4: none of the gizmo objects appears in a saved scene (diff of the scene JSON with gizmos
  on vs off is empty).

### Phase 7: Scene lighting, draw modes, grid; platform check; catalog scenario (B1.7)
**Skills:** code-foundations:cc-defensive-programming
**Model:** sonnet
**Gate:** Standard
**Depends on:** Phase 6
**File scope:** app/src/app/scene-view/scene-view-renderer.ts (lighting override, wireframe override, grid), app/src/app/shell/workspace.component.ts (Lighting, Shaded/Wireframe, grid chips, no-light hint), app/src/app/services/settings.service.ts (gridSize), app/src/app/settings/settings-dialog.component.ts, app/src/app/i18n/en.ts, app/src/app/i18n/uk.ts, app/e2e/run.mjs, app/e2e/scenariocreator-check.mjs, app/e2e/platform-pixels.mjs

**Goal:** D-7, D-8, D-14 — what the editor shows is what the platform shows.

**Done when:**
- [ ] DW-7.1: e2e: empty project + cube (no light), lighting on → centre pixel of the cube's screen rect
  has luminance < 0.05; the no-light hint is visible; lighting off → luminance > 0.3; add a
  Directional Light, lighting on → > 0.3 and the hint is gone. Lighting state is not saved in the
  scene and not undoable.
- [ ] DW-7.2: after any lighting-off frame, the engine's lights have their original `visible` and the
  three scene has no extra children (probe check) — the override leaves nothing behind.
- [ ] DW-7.3: Wireframe → cube interior pixel ≈ background while edge pixels are lit; Shaded back →
  filled; engine materials unchanged (saved JSON identical before/after toggling).
- [ ] DW-7.4: grid hidden → no grid-colour pixels in an empty area; grid step 0.5 in Preferences →
  line spacing halves (probe reports the grid step).
- [ ] DW-7.5: `npm run e2e:build` builds two exported projects (cube + camera + light; cube + camera, no
  light) and `platform-pixels.mjs` reports the cube lit in the first and dark (< 0.05) in the second,
  on the engine bundle ScenarioCreator ships; the old wizard-project checks still pass.
- [ ] DW-7.6: the stage-6 catalog scenario (primitives, a light, a camera — only stage-6 features) is
  built by the same flow; ZIP path and SHA-256 in the report (upload is the owner's step).
- [ ] DW-7.7: full checks green on one run: `npx ng build`, `npm run e2e` (with `editor-e2e.lock`),
  `npm run e2e:build`; e2e PASS counts before/after recorded.

### Phase 8: Docs and roadmap
**Skills:** code-foundations:code-clarity-and-docs
**Model:** sonnet
**Gate:** Minimal
**Depends on:** Phase 7
**File scope:** WebEngineTSEditor/docs/unity-editor-plan.md (§5 Scene/Hierarchy/Toolbar rows → done, deviations), WebEngineTSEditor/README.md (probe flag, e2e:build fixtures), .claude-shared/ROADMAP.md (B1 row), .claude-shared/tasks/B-milestone-1.md (B1 status line), .claude-shared/CHANGELOG.md (editor section), .claude-shared/code-foundations/B1/*

**Done when:**
- [ ] DW-8.1: parity rows of stage 6 marked done with date; recorded deviations listed (Plane/Quad
  without collider — no MeshCollider in the engine; one outline colour, no blue child outline;
  lighting toggle on by default for every scene, D-7; no platform upload in CI).
- [ ] DW-8.2: ROADMAP B1 → `✅ <date> W<n>` + what landed; build notes, probe API and screenshots list
  in `code-foundations/B1/`.

---
## Test Coverage
**Level:** every DW has an e2e check (or a recorded command output for DW-1.5, 5.5, 7.6, 7.7).
## Test Plan
- [ ] e2e scenarios added to `app/e2e/run.mjs`: `3d objects`, `navigation`, `orientation cube`,
  `tools and snapping`, `selection and outline`, `gizmos`, `lighting and view`; each ends with
  "no page errors" and "no native dialogs".
- [ ] Dirty tests: pointer leaves the canvas mid-drag; window blur while flying; Alt keyup does not
  open the browser menu (focus stays on the canvas); undo during a handle drag; Shift+F on an object
  then deleting it; zero-area rectangle; outline after a canvas resize; gizmo for a disabled light.
- [ ] Regression: all existing scenarios unchanged and green (they cover create-empty, gizmo drag,
  undo, save marks).
- [ ] Platform: `e2e:build` + `platform-pixels.mjs` (DW-7.5).
- [ ] Manual: navigation feel (DW-2.7); Windows Alt behaviour in Edge and Chrome; light theme
  legibility of the orientation cube and the rectangle.

## Assumptions
| Assumption | Confidence | Verify Before Phase | Fallback If Wrong |
|---|---|---|---|
| A8 is done (`0c3bb5d`): current engine, version-checked open | high | 1 | stop: B1 depends on A8 |
| An inlined `StandardMaterial` + `PrimitiveMesh` keeps the scene at version 1 and reopens | medium | 1 | report with the JSON; ENGINE-GAPS row; do not hand-edit JSON |
| `readPixels` right after `render()` in the same task returns the frame without `preserveDrawingBuffer` (swiftshader, Edge/Chromium) | high | 1 | set `preserveDrawingBuffer: true` only when the probe flag is on |
| Hiding engine three lights for one `render()` and restoring is invisible to the engine (no per-frame engine code runs in between; the editor does not run the engine loop) | high | 7 | keep lights untouched and instead render an unlit pass — record and ask |
| `ScenarioCreator/node_modules/WebEngineTS/dist/WebEngineTS.standalone.js` is the bundle the platform runs | medium | 7 | use the virtual-lab bundle path the README names; note it |
| Playwright can send MMB, RMB and Alt+drag to the canvas in Edge/Chromium | high | 2 | dispatch `PointerEvent`s via `page.evaluate` for that gesture only, noted |

## Decision Log
| Decision | Alternatives Considered | Rationale | Phase |
|---|---|---|---|
| D-1 editor-only, documented three access list | engine `RenderTexture`/E8 first | E8 is stage 13 (2–3 weeks); list is short and greppable | all |
| D-5 own gizmo adapted from `ViewHelper` | `ViewHelper` as-is | wrong Z under the engine mirror, no centre toggle, its animation fights the controller | 3 |
| D-6 handles on a proxy | attach to engine `Object3D` | multi-select, Center, Local/Global; mirrored parent breaks world Y rotation | 4 |
| D-7 lighting on by default for every scene | auto-off without a light (card wording) | auto-off makes a light-less scene look lit — what the done-when forbids | 7 |
| D-9 mask post-pass outline | `OutlinePass`; inverted hull | keeps the main render path identical to the platform; hulls break on cubes | 5 |
| D-13 read-only probe behind a localStorage flag | DOM readouts; screenshots + PNG decode | exact engine-space numbers, no new deps, absent in normal sessions | 1 |
| D-14 pixel check in an editor-repo script | change `verify-render.mjs` | no cross-repo change in an editor task | 7 |

---
## Notes
- Phases are strictly serial (shared hub files: `viewport.service.ts`, `workspace.component.ts`,
  i18n, `e2e/run.mjs`).
- Full-gate reviewers (Phases 1, 4, 5) must re-run DW-1.3, DW-4.2/4.3 and DW-5.1 themselves and check
  every direction assertion in engine space.
- B2–B4 compatibility: keep `SelectionService` as the single selection source (B2 adds eye/pick
  toggles — the picker must take an `isPickable(go)` predicate, default true); keep `createMenu` the
  one create list (B2 context menu, B4 drag-and-drop of models uses the same pivot placement); keep
  gizmo drawing driven by component type → drawer map (B3's registry-driven inspector must not need
  gizmo changes).
- Owner question (non-blocking): D-7 default — confirm "on for every scene" over the card's wording.
---
## Decided During Build
_Filled by /code-foundations-build — one row per decision an agent made or question it raised:_
| # | Phase | Decision or question | Source | Status |
---
## Execution Log
_To be filled during /code-foundations-build_
