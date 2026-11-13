# B1 phase 6 build notes — component gizmos and the Gizmos menu (B1.6)

Plan: `code-foundations/B1/plan.md` § Phase 6. Branch `B1-component-gizmos` in `WebEngineTSEditor`
(+ `.claude-shared` for this file). Editor only — no engine change (D-1).

## What landed

- **`app/src/app/scene-view/component-gizmos.ts`** (new) — D-11: one pooled `LineSegments` per
  kind, rebuilt each frame from the components' public fields and drawn in the depth-tested
  (grid) layer, so geometry hides the lines exactly as Unity's gizmos are hidden. Kinds:
  camera frustum (or the orthographic box; the far plane clamped to 100 for display),
  directional light (5 rays along the engine forward + an end disc), point light (3 great
  circles of `range`), spot light (4 rim lines + the end circle of `range`/`spotAngle`),
  Box/Sphere/Capsule colliders (green wireframes at `center`, scaled by `lossyScale`),
  AudioSource (the min/max distance circles). Built in **engine space** and converted once,
  per vertex, by `space.ts`, so the gizmos land where the Inspector's numbers say they are.
  Disabled components and inactive objects draw nothing.
- **`app/src/app/scene-view/gizmo-icons.ts`** (new) — the billboard icons (camera, light,
  audio) as canvas-drawn sprites in the on-top layer, pooled per kind, sized from the menu's
  slider.
- **`app/src/app/shell/workspace.component.ts` + `styles.css` + i18n (uk/en)** — the Gizmos
  menu: a dropdown under the existing chip with the master switch, per-type checkboxes
  (Camera, Lights, Colliders, Audio Source) and the icon-size slider.
- **`app/src/app/scene-view/debug-probe.ts`** — `gizmoCounts()`, `gizmoExtent(name, kind)`
  and `gizmoSettings()`; **`viewport.service.ts`** — the per-frame update, the menu's
  setters and the localStorage-backed state.

## Bugs found and fixed during this phase

1. **The component types were matched by `constructor.name`**, which the production build
   minifies ("oc"), so nothing was ever recognised. The engine's own
   `TypeRegistry.getTypeName` names the type and survives minification — the pattern the
   Inspector already uses. A probe found it (`GZ Camera comps=["oc"]`).
2. **A build failure hidden behind a success**: the Angular compiler rejects `Number(...)`
   in a template (no global `Number` there), and `ng build | tail -3` showed only the
   pre-existing budget warning while the build had actually failed — the dist directory was
   left empty and the e2e then failed on a connection refused. The slider is now a typed
   handler on the component, and the build's exit code is what is checked, not its tail.
3. **The Gizmos menu's state was read while the panel was closed** in the new scenario, so
   the row lookups timed out under load. Each switch now ensures the panel is open and waits
   for the scene to agree rather than for the DOM checkbox alone.

## Invariants verified by the new e2e

- **DW-6.1**: the camera frustum and the light's rays are drawn (one each); unchecking
  Camera in the Gizmos menu leaves the light; unchecking Lights hides it too; the master
  switch hides everything; the switches survive a reload.
- **DW-6.2**: a cube's BoxCollider draws one wireframe spanning √3⁄2 (the unit cube's
  corner); a point light's circles are its `range`, and follow the value edited in the
  inspector (10 → 4).
- **DW-6.3**: `.shots/b1-gizmos-on.png` / `b1-gizmos-off.png` (attached to the report).
- **DW-6.4**: the scene JSON is byte-identical with the gizmos on and off.

## Checks

- `npx tsc -p tsconfig.json --noEmit` — clean; `npx ng build` — exit 0 (the pre-existing
  bundle budget warning).
- `npm run e2e` against the production bundle served statically (`http://localhost:4201/`,
  under `editor-e2e.lock`) — **331 checks, "All checks passed"**; the new scenario passes
  on its own as well.
- `npm run e2e:build` — green.

## Deviations

- **The pool is one `LineSegments` per kind, not per object** — a kind's geometry is
  concatenated into a single draw call (D-11's "pooled per kind to avoid per-frame
  allocation"). Individual objects are not addressable in the buffer; the probe's
  `gizmoExtent` reads the object's own extents back from the same pass, which is what
  DW-6.2 asserts.
- **Colliders are green** (D-11's colour); the other kinds are Unity's grey.
- The Gizmos menu is view state in `localStorage` (`wets:gizmos:v1`), as D-11 says — never
  scene data, so DW-6.4 holds by construction.

## What's left

Phase 7 (scene lighting, draw modes, grid; the platform check; the catalog scenario),
8 (docs and the row's ✅).