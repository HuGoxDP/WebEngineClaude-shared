# B1 — Editor stage 6: scene and objects — research (Claude, 2026-11-10)

**Status:** confirmed by Claude (architect lane); the plan beside it (`plan.md`) is `ready`.
**Base:** WebEngineTSEditor `master` `0c3bb5d` (A8 merged: engine re-packed, scenes open through the
engine's version check; M0.2g: Add Component greys one-per-object types). Engine `master` `dbd43d6`.
Card: `.claude-shared/tasks/B-milestone-1.md` § B1 (table B1.1–B1.7). Spec:
`WebEngineTSEditor/docs/unity-editor-plan.md` §5 "Scene", "Hierarchy" (3D Object row), "Toolbar"
rows and §6 stage 6; §9 (every stage ends with a catalog scenario built only with its features).

## What B1 must achieve

A person who has used Unity rotates, flies, selects and moves objects in the editor's Scene view
without relearning, can create the six primitives, sees an orange outline and component gizmos, and
sees the scene lit exactly as the platform will show it. A cube created from the menu is visible on
the platform after a build.

## Facts checked against the code

| Fact | Where |
|---|---|
| Viewport = own `THREE.WebGLRenderer`, raw `THREE.PerspectiveCamera` at three-world `(6,6,10)` looking at the origin, `OrbitControls` with damping | `app/src/app/viewport.service.ts:70–96` |
| Overlay scene (grid 50×50, `AxesHelper`, **a hemisphere + directional light**, gizmo helper, `BoxHelper` outline) is rendered **first**, the engine scene **second**, one shared depth buffer, no clear between | `viewport.service.ts:79–104, 242–244` |
| The overlay lights do **not** light the engine scene: three collects lights per `render()` call from the scene rendered. So today an unlit engine scene is already black in the editor; the card's "looks lit in the editor" was inferred from the code, never observed (no mesh could be created). The real risk is the opposite: any fix that adds editor light **into** the engine scene must be scoped to the toggle | three `WebGLRenderer.render` light collection; `viewport.service.ts:98–104` |
| Because the engine scene is drawn after the overlay, a mesh will **overdraw the transform gizmo and the outline** as soon as B1.1 creates meshes | `viewport.service.ts:242–244` |
| `TransformControls` attached directly to `go.transform._internalObject3D`; drag writes back `localPosition/Rotation/Scale`; undo via `pushSnapshot` on first real movement | `viewport.service.ts:107–131, 383–393` |
| Snap: `settings.gridSnap` (default 1, 0 = off) always applied as `setTranslationSnap` | `viewport.service.ts:135–138`, `settings.service.ts` |
| Click-select: LMB press/release < 4 px → raycast engine scene, walk to the owning `GameObject`; any drag = orbit | `viewport.service.ts:303–355` |
| `F` frames the primary selection (`frameOnObject`, moves `OrbitControls.target`) | `viewport.service.ts:264–290`, `commands.service.ts:202` |
| Shortcuts: one `keydown` on `window`, stands down in dialogs and text fields; W/E/R tools, F, Del, F2, Ctrl+… | `services/shortcuts.service.ts` |
| Tool palette: Hand, Rect, Combined buttons `disabled`; Pivot/Local/Shaded/Lighting/Gizmos chips have no action | `shell/workspace.component.ts:84–140` |
| Create menu shared by GameObject menu and Hierarchy "+"/context menu: Empty, Camera, Light ▸, Audio ▸, Effects ▸, UI ▸ — no 3D Object; each create = one `history.record` | `services/commands.service.ts:80–115`, `panels/hierarchy/hierarchy.component.ts:198–223` |
| Undo = whole-scene `SceneSerializer` snapshots, 30 deep, same-label coalescing 500 ms | `services/history.service.ts` |
| Selection: `selected` (primary) + `selectedSet`, `select/toggle/addToSelection/clear` | `services/selection.service.ts` |
| Editor has no unit-test runner; the e2e (`app/e2e/run.mjs`, Playwright, own page per scenario, OPFS folder) is the suite; it reads state only through the DOM; one scenario drags the move gizmo at the **hard-coded pixel (800, 388)** | `app/e2e/run.mjs:369–454` |
| `e2e:build` copies `.shots/wizard-project` into ScenarioCreator, builds ZIP + manifest, runs `verify-render.mjs` (object count, both paths agree) — it reads no pixels | `app/e2e/scenariocreator-check.mjs`, `ScenarioCreator/verify-render.mjs` |
| **Engine handedness mirror**: every scene has `_contentRoot` with scale `(1,1,−1)`; engine (Unity, left-handed) world = Z-mirror of three world. `Transform.position/rotation` speak engine space; `_engineWorldMatrix` undoes the mirror. The engine `Camera` cancels it with its own `scale (1,1,−1)` | `WebEngineTS/src/engine/core/Scene.ts:126–129`, `Transform.ts:220–235, 1060–1070`, `components/Camera.ts:919–925` |
| Consequence today: the editor's `AxesHelper` blue (+Z) arm points at **engine −Z**; a three-space `ViewHelper` would label Z backwards | as above |
| Primitives: `Mesh.createCube/Sphere/Capsule/Cylinder/Plane/Quad` (Unity default sizes: cube 1, sphere r 0.5, capsule r 0.5 h 2, cylinder r 0.5 h 1 — Unity's cylinder is h 2, see D-3, plane 1×1 here vs Unity 10×10, quad 1×1); each records `primitive` and serializes as `{ $type: "PrimitiveMesh", kind, args }` | `core/graphics/Mesh.ts:85–118, 683–691, 696–1271`, `serialization/ValueSerializer.ts:316–318, 493` |
| A material without a file is inlined into the scene (`ctx.inlineAsset`) | `ValueSerializer.ts:322–337` |
| `MeshRenderer` without a material draws a shared white `MeshStandardMaterial` (lit) | `core/rendering/MeshRenderer.ts:117, 225` |
| Gizmo data on public API: `Camera.fieldOfView/orthographic/orthographicSize/nearClipPlane/farClipPlane`; `Light.color/intensity`, `PointLight.range`, `SpotLight.range/spotAngle`; `BoxCollider.center/size`, `SphereCollider.center/radius`, `CapsuleCollider.center/radius/height`; `AudioSource.minDistance/maxDistance` | `components/*.ts`, `physics/*Collider.ts`, `audio/AudioSource.ts:184–192` |
| `RenderSettings.ambientColor` is stored and serialized but **never applied** to three (`_syncToThree` handles skybox, environment, fog only): the platform has no ambient fallback → a scene with no light is black there | `core/RenderSettings.ts:213–229, 242–300`, `rendering/WebGLRenderBackend.ts:140–147` |
| three r0.182 in the editor ships `ViewHelper`, `TransformControls`, `OutlinePass` | `app/node_modules/three/examples/jsm/…` |

## Unity behaviour the plan copies (Unity 6 manual + editor knowledge)

- **Navigation** ([Scene view navigation](https://docs.unity3d.com/6000.6/Documentation/Manual/SceneViewNavigation.html),
  [Scene Camera](https://docs.unity3d.com/Manual/SceneViewCamera.html)): LMB = select / rect
  select; Alt+LMB orbit around the pivot; Alt+RMB zoom (dolly); RMB look (rotate in place); RMB held
  + W/S forward/back, A/D left/right, Q/E down/up (flythrough), Shift faster; wheel during RMB changes
  fly speed; MMB (and Alt+MMB) pan; wheel zooms toward the pivot; F frames the selection, Shift+F
  frames and follows (lock view to selected) until the camera is moved by the user; in orthographic
  mode RMB orbits instead of flying. Camera speed settings with min/max (0.01–99) and acceleration.
- **Scene gizmo (orientation cube)**: top-right; clicking an axis cone snaps the camera to look along
  that axis **toward the pivot** (camera on the clicked side, forward = −axis), with a short
  animation; the centre cube (or the label) toggles Perspective ↔ Isometric (orthographic); the label
  below says "Persp"/"Iso" and the view name. Axis colours X red, Y green, Z blue, in **left-handed**
  engine space.
- **Tools**: Q View (hand: LMB drag pans), W Move, E Rotate, R Scale, T Rect (stage 18), Y
  Transform (move + rotate + scale handles together). Toolbar toggles Pivot/Center (handle at the
  active object's pivot / at the centre of the selection bounds) and Local/Global (handle rotation).
- **Snapping** ([Snap increments](https://docs.unity3d.com/6000.6/Documentation/Manual/SnapIncrements.html),
  [Grid and Snap overlay](https://docs.unity3d.com/6000.6/Documentation/Manual/overlay-grid-snap-reference.html)):
  incremental snapping by a toggle or by holding Ctrl while using a gizmo; separate move increment,
  rotate angle increment and scale increment.
- **Selection**: click selects; rect drag selects; Shift adds (toggles) on click and adds on rect;
  Ctrl (Cmd) removes on click/rect. Orange selection outline; children of a selected object outlined
  too (Unity uses a second, blue "selected children" colour).
- **Gizmos**: lights (direction rays for directional, range sphere for point, cone for spot),
  camera frustum, collider wireframes (green), audio source min/max spheres; Gizmos menu toggles per
  type, icon size, 3D icons.
- **Scene view Lighting toggle**: on = the scene's own lights; off = a default light following the
  Scene camera (so geometry is readable). Shaded / Wireframe / Shaded Wireframe draw modes. Grid
  show/hide and size.

## Decisions (made here; the card left them open)

- **D-1 Editor-side vs engine-side split.** B1 is editor-only; **no engine change, no ENGINE-GAPS
  row needed**. Everything the editor draws (grid, axes, handles, outline, gizmos, orientation cube)
  lives in editor-owned three objects in an editor overlay scene, never in the engine scene, never in
  a `GameObject` — so nothing editor-only can be serialized (card gotcha). Editor logic (camera pose
  for tests, placement, gizmo geometry, transforms) speaks **engine space** through the engine's public
  `Transform` API. The editor reaches into three at exactly these documented points, all in
  `app/src/app/scene-view/`: (a) `SceneManager.activeScene._internalThreeScene` to render (existing);
  (b) `go.transform._internalObject3D` to raycast-pick and to read mesh geometry + `matrixWorld` for
  the outline mask (read-only); (c) the lighting-off render override (D-7), which hides engine three
  lights for the duration of one `render()` call and restores them. One module `space.ts` owns the
  engine↔three conversion (`p → (x, y, −z)`, `q → (−x, −y, z, w)`), cited from `Scene.ts:128`.
  Rationale: the plan's rule "editor must not reach into Three.js beyond what the engine exposes" —
  E8 (Scene through the engine) is the real fix and is stage 13; until then the access list is short
  and greppable (`grep -rn "_internal" app/src/app/scene-view` = the list above).
- **D-2 Render order.** Per frame: clear → engine scene (lit per D-7, wireframe per D-8) → grid
  (depth-tested against the engine scene) → `clearDepth` → outline composite → component gizmos →
  transform handles → orientation cube (own viewport). Fixes the overdraw that B1.1 would expose.
- **D-3 Primitives** (B1.1). `Mesh.createCube()`, `createSphere()`, `createCapsule()` (r 0.5, h 2),
  `createCylinder(0.5, 2)` — **h 2, Unity's cylinder**, not the factory default 1 —,
  `createPlane(10, 10)` — Unity's plane is 10×10 —, `createQuad()`. Object = `MeshFilter.sharedMesh`
  + `MeshRenderer.sharedMaterial = new StandardMaterial()` (white, as Unity's Default-Material) +
  a collider like Unity (Cube → BoxCollider, Sphere → SphereCollider, Capsule/Cylinder →
  CapsuleCollider, Plane/Quad → none; Unity gives Plane/Quad a MeshCollider which the engine lacks —
  recorded deviation). Menu labels and object names come from new i18n keys `go.3dObject`, `go.cube`,
  `go.sphere`, `go.capsule`, `go.cylinder`, `go.plane`, `go.quad` (uk + en); the object takes the
  translated label as its name, exactly as `createWith` does today.
  Placement: **at the Scene view pivot** (Unity's behaviour; the pivot is the orbit centre the
  controller keeps), rounded to nothing; as a child (Hierarchy context menu on an object) at local
  zero. The same placement applies to every root create in `createMenu` (Empty, Camera, Lights…),
  Unity parity. With the initial pivot at the origin, existing e2e that create at the origin are
  unaffected. One `history.record('Create Cube', …)` per create = one undo step; selection set inside.
  The serialized form must stay version 1 (`PrimitiveMesh` + inlined material) — verified by DW.
- **D-4 Navigation controller** (B1.2). One class `SceneViewController` (no Angular, no DOM queries
  beyond the canvas it is given), state in engine space: `pivot`, `rotation` (yaw/pitch), `distance`,
  `orthographic`, `flySpeed`; it writes the three camera through `space.ts`. Pointer events with
  pointer capture; wheel `preventDefault` (non-passive listener); context menu suppressed on the
  canvas; key state for WASDQE only while RMB is held; fly uses `requestAnimationFrame` delta time
  (no `Time` from the engine), base speed 5 u/s (setting), Shift ×4 (Unity's "faster"), wheel during
  fly scales speed ×1.2 per notch clamped to [0.01, 99]. Zoom = dolly toward pivot, step proportional
  to distance (never crosses the pivot; min distance 0.01). Pan moves pivot and camera so the point
  under the cursor stays under it (world units per pixel from distance and FOV). Orbit: Alt+LMB, 0.3°
  per pixel, pitch clamped ±89.9°. No damping (Unity has none). `F` = frame selection bounds
  (union of the selection's renderer bounds, else pivots), animated 250 ms; `Shift+F` = frame and
  follow: each frame the pivot tracks the primary selection's world position until any user camera
  gesture. Initial pose: pivot origin, camera at engine `(6, 6, −10)` = the current three `(6, 6, 10)`
  — unchanged, so the existing pixel-based gizmo scenario keeps passing.
- **D-5 Orientation cube** (B1.3). Editor-side `OrientationGizmo`, **adapted from three's
  `ViewHelper`** (same sprite/axis drawing and own-viewport render in the top-right corner), not used
  as-is because: it labels three's axes (Z would read backwards under the engine mirror — the helper
  root gets `scale (1,1,−1)` and click targets are resolved in engine space), it has no centre target
  for the projection toggle, and its built-in animation moves the camera behind the controller's
  back. Clicks are routed to `controller.lookAlong(axis)` (camera on the `axis` side, forward =
  −axis, animated) and `controller.toggleProjection()`; label under it: "Persp"/"Iso" + view name.
  Ortho size = `distance · tan(fov/2)` so toggling keeps the framing.
- **D-6 Transform handles** (B1.4). `TransformControls` attached to an **editor proxy object** in the
  overlay scene, not to the engine `Object3D`. Proxy position = active object's pivot (Pivot) or the
  centre of the selection's world bounds (Center); proxy rotation = active object's world rotation
  (Local) or identity (Global). On drag the delta (in engine space, via `space.ts`) is applied to every
  selected object whose ancestor is not also selected, through `transform.position`,
  `transform.rotation` (about the handle position for Center/multi) and `localScale`. This gives
  multi-object editing, Pivot/Center, Local/Global and correct behaviour under the mirror (attaching
  to the mirrored `Object3D` makes world-space rotation about Y turn the wrong way: three decomposes the
  mirrored parent as a 180° Y rotation with scale (−1,1,1)). Tools: Q View (no handle; LMB drag pans),
  W/E/R as now, Y Transform = three `TransformControls` instances (translate, rotate, scale) on the same
  proxy, scale shown as the uniform centre handle only to avoid overlap. Snapping = Unity's
  *incremental* snapping, active while Ctrl is held or the toolbar magnet toggle is on; increments
  from Preferences: move = existing `gridSnap` (default changes from "always on" to the toggle being
  off; value kept), rotate 15°, scale 0.1 (new settings `rotateSnap`, `scaleSnap`). Move snapping uses
  TransformControls' translation snap on the proxy (rounds the handle position in the handle's space →
  an object starting on the grid lands on multiples of the step); rotate snap is relative. Undo: one
  `pushSnapshot('Move'|'Rotate'|'Scale')` per drag, taken at handle press, pushed on first real change
  (existing pattern). Pivot/Center and Local/Global persisted in `localStorage` like Unity's toolbar,
  not in the project.
- **D-7 Lighting toggle semantics** (B1.7). The editor never adds light to the scene unless the user
  asks. `sceneLighting` (view state, default **on for every scene**): on = the engine scene renders
  with exactly its own lights → a scene without lights is black in the editor, as on the platform;
  off = Unity's default lighting: for the duration of the engine-scene `render()` call the engine's
  three lights get `visible = false` and an editor headlight (directional, from the camera) + dim
  hemisphere are added to the three scene, then everything is restored before the call returns.
  The card says "on by default when the scene has a light"; read literally (auto-off without a light)
  it would make a light-less scene look lit — the exact mismatch the done-when forbids — so the toggle
  starts **on** always, and a viewport hint shows when lighting is on and the scene has no enabled
  `Light`: "No light in the scene — it will look like this on the platform (GameObject → Light)".
  Flagged to the owner as a confirmation question, not a blocker. The overlay's hemisphere/directional
  lights are deleted (they lit nothing). The editor's clear colour = the platform's camera background
  is out of scope (no main camera in edit mode); the viewport keeps its dark background.
- **D-8 Draw modes and grid** (B1.7). Shaded / Wireframe / Shaded Wireframe: wireframe = second render
  of the engine scene with `scene.overrideMaterial` (wireframe `MeshBasicMaterial`) set for that call
  only and restored (same scoped-override pattern as D-7; engine materials are never mutated). Grid:
  show/hide toggle and step (Preferences `gridSize`, default 1), the grid recentred on the pivot's
  XZ snapped to 10 steps so it never ends; `AxesHelper` replaced by the grid's axis lines coloured in
  engine space (red X, blue Z pointing to engine +Z).
- **D-9 Selection outline** (B1.5). Editor-side **screen-space mask post-pass**: each frame with a
  selection, render the selected objects' meshes (and their descendants') as flat white into a
  half-float/RGBA render target sized like the canvas, via editor-owned proxy meshes that share the
  engine mesh's `geometry` and copy its `matrixWorld` (read-only; `matrixAutoUpdate = false`,
  `DoubleSide`, no depth test so the silhouette is complete, as in Unity); then a full-screen quad
  shader draws Unity orange `#FF6600` where the mask is 0 and any tap within 2 px is 1, alpha-blended
  over the frame. Chosen over `OutlinePass`/`EffectComposer` (would move the whole scene render into
  render targets + an `OutputPass`, changing colour/tone handling of the main picture — the viewport
  must keep matching the platform) and over inverted hulls (break on hard-edged primitives; per-mesh
  geometry clones). Objects without meshes keep a thin `BoxHelper` in orange-dim (lights, cameras,
  empties) — Unity shows their gizmo highlighted instead; noted. Unity's blue child colour: deferred.
- **D-10 Selection input** (B1.5). In the Scene view: click = select (raycast, nearest hit), empty
  click = clear; Shift+click toggles in; Ctrl+click toggles out; LMB drag on empty space (not on a
  handle, not with Alt) draws a rectangle (an absolutely positioned DOM div over the canvas); release
  selects every object whose projected renderer world bounds (8 corners → screen AABB) **intersect**
  the rectangle, or, without a renderer, whose pivot lies inside; Shift = add, Ctrl = remove. Objects
  behind the camera are ignored. Hierarchy keeps its own Ctrl/Shift semantics (list, range).
- **D-11 Component gizmos** (B1.6). `ComponentGizmos` rebuilds editor line geometry per frame for
  visible objects from public component fields (D-1 list): directional light → 5 parallel rays along
  forward (+Z engine) of length 1.5 + a small disc; point light → 3 great circles of `range`; spot →
  cone of `range` and `spotAngle` (4 lines + end circle); camera → frustum from fov/near/far (or ortho
  box), aspect = viewport aspect, far clamped to 100 for display; Box/Sphere/Capsule collider → green
  wireframes at `center` with lossy scale; AudioSource → `minDistance`/`maxDistance` circles; plus
  billboard icons (camera, light, audio) drawn as sprites, icon size from the Gizmos menu. All gizmos
  of a selected object are drawn brighter. Gizmos menu (dropdown from the existing chip): master
  "Gizmos" on/off, per-type checkboxes (Camera, Lights, Colliders, Audio Source), icon size slider;
  stored in `localStorage` (view state, Unity stores it per user). Lines are `LineSegments` in the
  overlay (not in the engine scene), pooled per kind to avoid per-frame allocation.
- **D-12 Undo.** No new history mechanism: creation uses `history.record`; handle drags use
  `pushSnapshot` (one entry per drag regardless of how many objects move); camera, selection, tool,
  toggles and gizmo visibility are **not** undoable and do not mark the scene unsaved (Unity: the
  Scene camera is not in undo). Gate Full only where these paths change (Phases 1 and 5).
- **D-13 Testability.** e2e reads editor state through a **debug probe** installed only when
  `localStorage['wets:debug:probe'] === '1'` (precedent: `wets:debug:autosaveMs`), as
  `window.__wetsProbe`: `camera()` → `{ position, forward, up, orthographic }` in engine space;
  `pivot()`; `selection()` → names; `handlePoint(axis, t)` → client px of a point on a handle axis;
  `hoverAxis()` → TransformControls' current axis; `objectScreenRect(name)`; `gizmoCounts()` →
  visible line/icon count per kind; `pixelStats(rect, rgb, tol)` → renders one frame and
  `readPixels` synchronously (no `preserveDrawingBuffer`), returning match count and mean luminance;
  `transformOf(name)` → engine position/rotation(Euler)/scale. The probe is read-only (no setters)
  and absent in a normal session. Gestures are driven by real Playwright mouse/keyboard events on the
  canvas, so the controller is exercised exactly as by a user. Navigation *feel* (speeds, smoothness)
  remains a manual DW.
- **D-14 Platform check for lighting and the cube.** `e2e:build` gains a project fixture made by the
  B1 e2e (exported like `wizard-project`): a cube + camera with a light, and a second one without a
  light. `verify-render.mjs` only reports object counts, so the platform-side pixel check is done by a
  small editor-repo script (`app/e2e/platform-pixels.mjs`) that loads each built ZIP with the engine's
  standalone bundle from ScenarioCreator's `node_modules` (as verify-render does) in Playwright,
  reads the centre pixel of the canvas after the first frame and asserts lit vs dark. It stays in the
  editor repo (no ScenarioCreator change). The **catalog scenario** of §9 (a lit scene of primitives,
  built only with stage-6 features) is produced by the same flow and its ZIP attached to the report;
  uploading it to the platform is the owner's step (no Docker in CI).

## Risks

- **Mirror math** (D-1, D-5, D-6): sign errors are silent and look "almost right". Every DW about
  direction asserts engine-space vectors from the probe, never three-space values.
- **Existing pixel-coupled scenario** ("honest saving", gizmo at (800, 388)): depends on camera pose,
  handle size 0.8 and world space for an unrotated object at the origin. All three are kept; if it
  still breaks, the fix is its own commit with the reason (testing rule) and switches it to
  `handlePoint`, keeping every check.
- **Input conflicts**: Alt on Windows focuses the browser menu on keyup — `preventDefault` on Alt
  keyup while the canvas has focus; RMB context menu suppressed only on the canvas; wheel needs a
  non-passive listener; Ctrl+wheel is browser zoom (not intercepted).
- **Performance**: outline mask and gizmo rebuild each frame; budget ≤ 2 ms at 1600×900 in swiftshader
  for 50 selected primitives — measured once, recorded, not a gate.
- **Hub files**: `viewport.service.ts` is rewritten into `scene-view/`; `commands.service.ts`,
  `shortcuts.service.ts`, `workspace.component.ts`, i18n files and `e2e/run.mjs` are touched by most
  phases → phases run strictly in order.
