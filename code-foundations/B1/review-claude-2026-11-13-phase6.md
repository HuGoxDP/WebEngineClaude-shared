# Claude review — B1 phase 6 (component gizmos), before its merge

Read on 2026-11-13 ~19:45Z from W2's worktree, **staged and not yet committed** on
`B1-component-gizmos` (WebEngineTSEditor; the branch has no commits beyond `master` 9417a4b), plus
the pushed notes `code-foundations/B1/notes-phase6.md` (`.claude-shared` 114b005). Line numbers are
those of the staged files. Spec: research D-11, plan § Phase 6 (edge cases + DW-6.1…6.4).

The phase passes its e2e. The e2e cannot see most of what follows, because every object it checks
sits at the world origin, unrotated, unscaled, and the probe returns one number: the largest
distance from the object to any gizmo vertex (`gizmoExtent`). A circle drawn around the wrong centre
gives the right number when the object is at the origin.

## Findings

### Wrong place or wrong shape (player-visible: the gizmo lies about the component)

1. **Point-light and AudioSource circles are drawn around the world origin, not around the
   object.** `component-gizmos.ts:224`: the `circle` helper calls `line(this._circlePoint(...))`.
   `_circlePoint` returns origin-relative points, and nothing adds `position`. Move a point light to
   (5, 0, 0) and its range circles stay centred at (0, 0, 0). DW-6.2 passes only because the menu
   creates the light at the origin. `extent = max(distance to position, radius)` equals `range`
   there.
2. **The CapsuleCollider wireframe is drawn around the world origin too, and ignores scale.**
   `:331`: `cap` is the local `center` ± h. It is neither rotated nor moved to `position`, and
   `_offset(cap, rotate(circlePoint))` only rotates the ring. The two cross lines per cap also lack
   `position`. `radius` and `height` are never multiplied by `lossyScale` (D-11: "with lossy
   scale"). The engine capsule is Y-only (`CapsuleCollider.ts:14`), so the missing `direction` is
   not a finding.
3. **`_circlePoint('yz')` returns the XZ point** (`:454–455`: both branches return
   `{ x: c, y: 0, z: s }`). A point light shows two of its three great circles (XZ is drawn twice).
   A SphereCollider lacks its YZ ring.
4. **The spot cone and the directional rays use a world-fixed basis.** `:238–239`, `:278–279`:
   `right = (f.z, 0, -f.x)` is not normalised, and `up = (0, 1, 0)` is not perpendicular to forward.
   For the usual spot pointing down, `f = (0, -1, 0)`, so `right = 0` and `up ∥ f`. The four rim
   lines collapse onto the axis. The end circle is always drawn in the world XY plane (`at(t)`
   varies only x and y), so a downward spot's circle stands vertical. Any spot with a vertical
   component gets a smaller cone, `|right| < 1`. The directional light's end disc (`:256`) is also
   fixed in world XY: its `right.x * 0 + up.x * 0` terms are zeroed on purpose. Build an
   orthonormal basis from the object's rotation instead: local X/Y/Z through `_rotate`, the
   `local()` helper the box already uses.
5. **A collider's `center` is not treated as a local point.** The engine documents `center` as
   local space (`BoxCollider.ts:37`, `SphereCollider.ts:35`). The sphere adds `center` in world
   axes, unrotated and unscaled (`:310` onwards). The box rotates it but does not scale it: `h` is
   scaled, `center` is not. A collider with `center = (0, 1, 0)` on an object scaled 2 or rotated
   90° draws away from where the Inspector says it is. That is the plan's edge case "collider on a
   scaled parent". World centre = `position + rotate(center ⊙ lossyScale)`.

### Wrong objects

6. **Two components of one type on one object: the first is drawn twice, the second never.**
   `update()` iterates every component, but `_build` re-finds it with `_componentOf(transform,
   kind)` (`:407`), which returns the **first** component of that type. Compound colliders, two
   BoxColliders on one object, are ordinary Unity content. With a disabled first and an enabled
   second, nothing is drawn. Pass the component itself to `_build`.
7. **Children of an inactive parent still draw.** `_active` (`:421`) checks `enabled` and
   `gameObject.activeSelf`. The plan's edge case says "inactive object → no gizmo", and the notes
   claim "inactive objects draw nothing". Use `isActiveAndEnabled` (`Behaviour.ts:95`) or
   `gameObject.activeInHierarchy` (`GameObject.ts:379`).
8. **The billboard icons never appear in the production build, and only over the selection.**
   `viewport.service.ts:636`: `_placeIcons` matches `component.constructor.name`. That is the same
   minification bug the notes list as fixed (bug 1, "oc"), fixed only in `component-gizmos.ts`.
   The e2e runs the production bundle and asserts nothing about icons, so it cannot notice. The
   icons also iterate `selectedSet()` (`:633`). D-11's icons mark every camera, light and audio
   object, which is how a user finds an empty light in the scene. D-11's "all gizmos of a selected
   object are drawn brighter" is not implemented, and the notes do not record it as a deviation.

### Robustness and junk

9. **Silent truncation at 8192 vertices per kind** (`:157`, `Math.min(pool.length,
   array.length)`). A SphereCollider costs 144 vertices, so beyond about 56 spheres the rest
   vanish without a word. Boxes run out at about 341. Grow the buffer: reallocate to the next power
   of two when the pool outgrows it. Or at least warn once.
10. **Leftovers.** A debug `console.log` behind `window.__dbg` runs inside the per-object loop
    (`:138`). `void settings` (`:163`), `void forward; void up; void right`, `void scale`. Per-frame
    allocation (`new Map`, fresh arrays, `pool.slice` at `:158`) contradicts the file's own doc
    comment and D-11 ("pooled per kind to avoid per-frame allocation"). `array.set(pool, 0)` with
    a length check needs no slice.

## What the fix must prove (e2e, production bundle)

The probe should return the gizmo's **centre and axes** (bbox centre in engine space, or the
circle's centre and normal), not only the largest distance. With that:

- A point light moved to (5, 2, −3): circle centre = its position, radius = `range`, 3 distinct
  planes. Fails today: findings 1 and 3.
- An AudioSource off the origin: the same check for `maxDistance`. Finding 1.
- A capsule on an object at (0, 3, 0) scaled 2: centre (0, 3, 0) + 2·`center`, half-height
  2·(h + r). Finding 2.
- A spot light rotated (90, 0, 0), pointing down: end circle centre = position + range·down, its
  normal ∥ down, radius = range·tan(spotAngle/2). Finding 4.
- A cube with BoxCollider `center = (0, 1, 0)` on an object scaled (2, 2, 2) and rotated 90° about
  Z: bbox centre = position + rotate((0, 2, 0)). Finding 5.
- An object with two BoxColliders of different sizes: two distinct wireframes. Disable the first:
  the second remains. Finding 6.
- A light under an inactive parent: no gizmo, no icon. Finding 7.
- Icons: a light that is not selected has an icon in the production bundle. Finding 8.

Every check above fails on the staged code. Assertions of DW-6.1…6.4 stay as they are.
