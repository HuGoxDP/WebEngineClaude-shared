# B1 phase 1 build notes — scene-view skeleton, D-2 layers, probe, 3D Object menu

Plan: `code-foundations/B1/plan.md` § Phase 1. Branch `B1-scene-and-objects` in `WebEngineTSEditor`
(+ `.claude-shared` for this file). Commit `7c5f7dc`. Editor only — no engine change (D-1).

## What landed

- **`app/src/app/scene-view/space.ts`** — engine↔three conversions with the citation:
  the engine scene is left-handed (`Scene.ts:126–129`, content root `scale (1, 1, −1)`), so a point
  is `(x, y, −z)`, a direction negated in z, and a quaternion conjugated. Every later phase and the
  probe speak engine space through this one module.
- **`scene-view/scene-view-renderer.ts`** — owns the WebGLRenderer, the camera, the OrbitControls
  and two overlay scenes (`grid`, `above-scene`), and the D-2 frame: clear → engine scene → grid
  (depth-tested against the scene) → `clearDepth` → on-top layer. `addOverlayLayer(kind, obj)` /
  `removeOverlayLayer`. The old overlay lights and the `AxesHelper` are gone (D-7: a scene with no
  light reads dark).
- **`scene-view/debug-probe.ts`** (D-13) — `window.__wetsProbe` installed only when
  `localStorage['wets:debug:probe'] === '1'` (e2e's `newPage({ probe: true })` sets it):
  `camera()`, `pivot()`, `selection()` in engine space, `handlePoint(axis, t)`, and `readPixel`
  (the render-order proof of DW-1.4; draws and reads in one task because the drawing buffer is not
  preserved).
- **`viewport.service.ts`** — a thin facade: the gizmo, the outline, click picking, `frameOnObject`
  and the tick bookkeeping stay; the drawing moved to the renderer; `pivot` (engine space) is the
  new accessor root creates use.
- **`commands.service.ts`** — the `3D Object` submenu (six primitives, D-3: `createCube`,
  `createSphere`, `createCapsule` r 0.5 h 2, `createCylinder(0.5, 2)`, `createPlane(10, 10)`,
  `createQuad`; MeshFilter + white StandardMaterial + Unity's collider per kind — Cube→Box,
  Sphere→Sphere, Capsule/Cylinder→Capsule, Plane/Quad→none, the MeshCollider deviation recorded).
  A root lands at the pivot, a child at local zero; one undo step per create.
- **`history.service.ts`** — `record(label, fn, { coalesce: false })`: two primitives of a kind in
  quick succession are two creates and two undo steps (the plan's edge case).
- **i18n uk/en** — the 3D Object keys. **e2e** — the new scenario + the `probe` option on
  `newPage`.

## Checks (all green on the task branch)

- `npx ng build` — green. The "bundle initial exceeded maximum budget" warning is pre-existing
  (verified by building stashed master: the same warning, ~852 kB over, before my files).
- `npm run e2e` (against the production bundle served statically, `http://localhost:4201/`) —
  **202 / 202 checks, every old scenario unchanged**, including the pixel-coupled "honest saving"
  (the gizmo at (800, 388), the camera pose, handle size 0.8 and world space for an unrotated
  object at the origin are all untouched).
- `npm run e2e:build` — green ("The editor's project builds and runs").
- DW-1.5 audit: `grep -rn "_internal" app/src/app/scene-view` → **one hit** — the render access
  (`_internalThreeScene`, D-1a). The `_internalObject3D` uses live in `viewport.service.ts`
  (picking/gizmo/outline, pre-existing code that moved location) and the pre-existing
  `frameOnObject` call in `commands.service.ts`; both are the D-1b read-only family and are
  recorded here rather than moved.

## Deviations

- **e2e runs against a static server of the built bundle** (`python -m http.server 4201
  --directory dist/browser`), not the Docker deployment and not `ng serve`: the deployed editor
  container on the lab stack is another worker's image, and the plan's rule is the production
  bundle, which this is. The `editor-e2e.lock` was held for the run (the browser e2e ports).
- The probe's `pixelStats` two-layer comparison from the plan became a single composed-frame
  `readPixel`: the D-2 order is exactly what the composite shows, so the arrow-over-cube pixel IS
  the test.

## What's left for later phases

Phase 2 (navigation controller) is the next; the probe's `camera()`/`pivot()` and `space.ts` are
the ground it is asserted against.
