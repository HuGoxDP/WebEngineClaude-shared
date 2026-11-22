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

## Review fold-in (B1r/B1r2/B1r3/B1r4) — 2026-11-18

The four review rows are folded into B1 (ROADMAP marked ✅ there). All 10 findings of
`review-claude-2026-11-13-phase6.md` are fixed; all 8 e2e proofs it lists are implemented and
green; the DW-6.1…6.4 assertions are unchanged.

### What landed per row

- **B1r (placement)** — `commands.service.ts` gains a shared `_placeUnder`:
  `setParent(p, false)` + local zero/identity/unit scale (Unity's `SetParentAndAlign`); root
  creates still land at the pivot. DW-1.2 now has its e2e (below); DW-1.3 asserts the exact
  D-3 `PrimitiveMesh` kind/args and the exact Unity collider type per kind.
- **B1r2 (scale seat)** — a single selected object's scale handle is seated at the object's
  own rotation (proxy quaternion) and forced to local space whatever the Local/Global toggle
  (`ScaleTool.ToolGUI` semantics); the e2e discriminator is `seatDot` against an unrotated
  reference cube (fails pre-fix ≈ 1). The wizard taken-name flake fix is re-applied as a poll
  (50 × 100 ms on `.wiz-error`), assertions unchanged.
- **B1r3 (noErrors)** — narrowed to the performance note only: a line carrying
  `GL Driver Message` **and** `Performance`, or `GPU stall due to ReadPixels`. A real
  Error-severity GL fault fails the suite again.
- **B1r4 (phase-6 findings)** — the 10 findings plus the probe contract (below): circles and
  the capsule wireframe at the object's position with `lossyScale`, `_circlePoint('yz')`
  corrected, normalised object basis for the spot cone and directional rays, collider
  `center` rotated/scaled as a local point, per-instance component lookup (two colliders of
  one type draw both), `isActiveAndEnabled` for icons and gizmos, `TypeRegistry` naming in
  the icons, icons over the whole scene, selected drawn brighter, power-of-two vertex pools
  (no 8192 truncation), debug leftovers removed.

### Two extra defects found and fixed

1. **The review gate found a quaternion bug in `component-gizmos.ts`**: `_rotateInto`'s
   cross terms self-cancelled (`q.z*x − x*q.z`), so rotations silently did nothing. Two-line
   fix, verified numerically against three `Matrix4.makeRotationFromQuaternion` over 1000
   random unit quaternions — max error 5.6e-16.
2. **The e2e run found a src bug in `commands.service.ts`**: `createEmpty`/`createWith`
   reparented through `_placeUnder` without a scene notify, so the Hierarchy rendered the
   GameObject twice (root row + child row). Fix: `this._scene.notify()` after the local TRS
   reset.

### Probe API additions (`debug-probe.ts` / `viewport.service.ts`)

- `gizmoInfo(name, kind?)` → `DrawnInfo[]` — `{ kind` (the component type name)`, extent,
  center, half, circles[{center, normal, radius}], selected }`, engine space, whole scene,
  deep-copied. The `GizmoKind` drawer kinds stay internal; `Drawn.typeName` was added.
- `iconCounts()` — counts per component type (Camera / DirectionalLight / PointLight /
  SpotLight / AudioSource); `{}` when the master switch is off.
- `transformOf(name)` — now whole-scene, plus `localPosition` / `localRotation` /
  `localScale`; the world `scale` field is now `lossyScale`.
- `setComponentEnabled(goName, typeName, index, enabled)` — the write path for component
  enablement: the serializer does not persist `Behaviour.enabled` and the Inspector's
  enable checkbox is a static placeholder.
- Icons/gizmos draw brighter when selected (twin pools, 50 % lerp to white); vertex pools
  grow power-of-two; AudioSource draws one XY circle per distance (ponytail — upgrade path:
  3 great circles).

### E2e additions (0 existing checks removed)

- **DW-1.2 scenario**: root-at-pivot via Hierarchy "+"; a context-menu child at local zero
  under a transformed parent; "+" with a child selected still creates at root.
- **DW-1.3 strengthened**: exact `PrimitiveMesh` kind + args, exact Unity collider types;
  Plane/Quad have none.
- **B1r4 proofs scenario** (seeded scene JSON): point light at (5, 2, −3) → 3 circles of
  `range`; audio at (−4, 1, 6) → XY circle r = 500; capsule at scale 2 → half-height
  doubling; spot rotated X90 → end circle centre/normal/radius = `range·tan(angle/2)`; box
  `center` local, scaled + rotZ90; two BoxColliders draw distinctly, disable-first via the
  probe; an inactive parent draws no gizmo/icon with exact icon counts; an unselected light
  icon renders in the production bundle and the `selected` flag flips.
- **B1.4 scale-seat tail** (B1r2's discriminator, above).

### Run-hardening (no assertion weakened)

- Deterministic offline Google Fonts via `context.route` fulfill — immune to the
  `ERR_NETWORK_CHANGED` network blip.
- Recovery-copy poll 50 × 300 ms.
- B1.6 saves before reload (the autosave recovery dialog raced the Gizmos chip).
- B1.4/B1r4 frame-settle polls (rAF × 2, ≤ 120 iterations) replace fixed waits under load.

### Final counts

- Full e2e: **380 PASS / 0 FAIL, exit 0** (previous green baseline 331).
- `npm run e2e:build` — exit 0; wizard fixture 6 PASS; zip
  sha256 = `3e63625856db77cc02cd67705169afd2783cacd8135acd03a2f26d64a0376999`;
  pixels-lit / pixels-dark / catalog SKIP (the phase-7 exports are not yet authored).
- `npx tsc` exit 0; production `ng build` exit 0 (the pre-existing budget warning).

### Phase-7 support already landed (uncommitted, separate commit)

- `app/e2e/platform-pixels.mjs` (new) — luminance probe on the standalone bundle; CLI
  `<scenario> [--min/--max/--x/--y]`, exit 0/1/2.
- `app/e2e/scenariocreator-check.mjs` — fixture loop over wizard-project / pixels-lit /
  pixels-dark / catalog, zip + sha256 lines, per-fixture cleanup, skip-with-note for absent
  exports.

### Deviations (fold-in)

- **AudioSource draws one XY circle per distance**, not 3 great circles (ponytail; upgrade
  path recorded above).
- **`iconCounts()` counts per component type, not per object** — the menu toggles are
  per-type, which is what DW-6.1 asserts.
- **`transformOf`'s world scale is now `lossyScale`** (was the local scale) — the honest
  world-space number; local values are exposed alongside.