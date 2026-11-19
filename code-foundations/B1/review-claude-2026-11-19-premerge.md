# B1 — Claude's pre-merge review of phase 6 + the B1r–B1r4 fold-in (2026-11-19)

Reviewed: `WebEngineTSEditor` `origin/B1-component-gizmos` at `9c366f9` (a17929c B1.6, 0d0f9c1 e2e,
f58ffd3 B1r4, da1d148 B1r/B1r2, 5b4f71a e2e for the proofs, 9c366f9 phase-7 support). Read-only;
the e2e was not run (editor-e2e.lock belongs to W2). ROADMAP row: **B1r5**.

## Closure of B1r–B1r4

| Sub-finding | Fixed at 9c366f9 | Discriminating test (fails before, passes now) |
|---|---|---|
| B1r(1) create under a parent keeps world pose | yes — `_placeUnder`: `setParent(p,false)` + local zero / identity / unit (commands.service.ts:186-198) | yes — run.mjs:2217/2219/2220 |
| B1r(2) DW-1.2 e2e | yes | yes for the child; weak for root-at-pivot (2187, 2238): the pivot is still the default (0,0,0), where master also put new objects |
| B1r(3) DW-1.3 checks | yes (code was right on master) | yes against a regression |
| B1r2(1) taken-name wait | yes — a real poll (50 × 100 ms on `.wiz-error`), = the 03cae8e hunk | n/a |
| B1r2(2) single-object scale seat | **partly** — R tool only; the Y tool still has it (finding 1) | yes for R (seatDot, 1786) |
| B1r3 `noErrors` filter too wide | yes — only `GL Driver Message` + `Performance` and `GPU stall due to ReadPixels` are excused (229-232) | **none** — no check feeds an Error-severity line through `noErrors` |
| B1r4 #1 point/audio circles at origin | yes | yes (2316, 2326) |
| #2 capsule at origin, no lossyScale | yes | yes (2334, 2337); a rotated capsule is untested |
| #3 `_circlePoint('yz')` returned XZ | yes | **weak** — 2322 compares normals the code passes in (finding 3) |
| #4 spot/directional world-fixed basis | yes | **weak** — 2349 reads a passed-in normal; rim lines and the directional light untested |
| #5 collider `center` not a local point | yes | yes for the box (2355); the sphere's centre untested |
| #6 two colliders of one type | yes | yes (2362, 2368) |
| #7 child of an inactive parent | yes | yes (2375, exact icon count 2376) |
| #8 icons: minified names, selection only, brighter | yes | yes for unselected icons in the prod bundle (2381); weak for "brighter" (only the `selected` flag, 2394) |
| #9 8192-vertex truncation | yes (pools grow to the next power of two) | **none** |
| #10 debug leftovers | yes | n/a |

E2e diffs master..9c366f9 and 0d0f9c1..9c366f9: no assertion removed or loosened, no tolerance
widened; removed lines are the two old `noErrors` excuses (now narrower), the recovery scenario's
fixed 1 s wait (now a ≤15 s poll, same assertion) and the wizard's 200/300 ms waits (now the poll).
The debug probe is gated (`probeEnabled()`, viewport.service.ts:187; `localStorage['wets:debug:probe']`,
debug-probe.ts:111-113). 9c366f9's `platform-pixels.mjs` / `scenariocreator-check.mjs` use paths
relative to their own folder — no worker paths.

`npx tsc --noEmit -p tsconfig.app.json` in Claude's worktree: 2 errors, both in master's
`inspector.component.ts:324-325` and both caused by the worktree's `node_modules` junction holding an
older engine (`0.1.0-local.1793745537109`) than the committed tarball (`…1794336134`, which has both
members) — not a branch defect; 0 errors in the files the branch changes.

## Findings

1. **Medium — B1r2(2) is still open for the Y (combined) tool.** `transform-handles.ts:312,328`
   `const scaleSeat = this.mode === 'scale' && this._targets.length === 1;` — with `'combined'` in
   Global the proxy stays at identity (318) and three r182 orients the scale gizmo to the proxy, while
   the write-back is `localScale` (471). Y tool, Global, one cube rotated 45° about Y: dragging the X
   scale box (drawn along world X) stretches the cube along its own diagonal X. Unity's Transform tool
   shows only the uniform scale handle in Global (UnityCsReference `Editor/Mono/Handles/TransformHandle.cs`,
   `s_Default` Global scale = `ScaleHandleParam.Handle.XYZ`). Fix in `_applyDelta`'s scale branch: when
   `mode === 'combined' && space === 'world'`, take the component of `ratio` farthest from 1 and apply it
   to x, y and z, for one or many targets; note in the notes that three still draws the per-axis boxes.
   E2e (B1r2 tail): Y, Global, select `Seat` (45° Y), drag where `hoverAll()` reports `scale: 'X'`;
   `localScale.x/y/z` all change by the same ratio (1e-3). Fails today: only x changes.
2. **Low — Center-mode scale moves the object along world axes while the ratio is in its own axes.**
   `transform-handles.ts:472-479` `point.x + (t.position.x - point.x) * ratio.x` (world axes); since
   da1d148 a single object's `ratio` is in its own axes (in Local space it always was). Parent rotated
   45° about Y with a child at local (3,0,0); select the parent, R, Center, Global, scale X ×2: the editor
   puts the parent at (−1.06, 0, 0), Unity at (−1.06, 0, 1.06) (`TransformManipulator.cs`
   `TransformData.SetScaleDelta`: `pivot + R·Scale(R⁻¹·(pos−pivot), delta)`). Fix: record at drag start
   the rotation the proxy was seated with (`primary.transform.rotation` when `space === 'local' ||
   scaleSeat`, else identity); rotate the offset by R⁻¹, scale by `ratio`, rotate back. E2e: that scene;
   the parent's position equals C + R·((R⁻¹(p−C)) ⊙ ratio) within 1e-3.
3. **Low — the probe's circle normals are passed in, not measured.** `component-gizmos.ts:594-627`
   `_circle(…, nx, ny, nz, …)` builds vertices from `u/v` and records `n` as given, contradicting
   `Drawn`'s doc (97-99, "measured from the vertices actually pushed"). The original `_circlePoint('yz')`
   bug (0d0f9c1:453-455) would still pass run.mjs:2322 ("three distinct planes"), and 2349 (spot normal)
   likewise. Fix: drop `nx,ny,nz`, record `normalize(u × v)` inside `_circle`; add a SphereCollider object
   (three circles, pairwise |n·n| < 0.1) and a DirectionalLight rotated X90 (end-disc normal ∥ rotated
   forward) to the B1r4 scenario.
4. **Low — the CapsuleCollider wireframe has no side lines** (since a17929c, kept by f58ffd3).
   `component-gizmos.ts:478-489`: per cap a full XY circle, an XZ ring and two diameters, nothing joining
   the caps — a default capsule (r 0.5, h 2) reads as a figure-8, a height-4 one as two balls. Unity: a
   ring at each cap centre (±h), four lines joining them at ±r along local X and Z, the hemisphere arcs in
   XY and ZY. Remove the diameters; `half.y` stays h + r. E2e: height-4 capsule → `half.y` = 2 and a
   record with a vertex at local (r, 0, 0).
5. **Low — gizmo bookkeeping pins destroyed GameObjects.** `ComponentGizmos.update()` resets `_objects`
   only inside `if (this._settings.enabled)` (241-242); `ViewportService._sceneWalk` (57) is refilled only
   when gizmos are on (746); `_sceneWalk` / `_gizmoSelected` (48) survive `detach()`; `GizmoIcons.dispose()`
   (gizmo-icons.ts:97) never disposes the material. Gizmos off → undo (scene reload) or Close Project keeps
   the last scene's objects reachable. Fix: reset `_objects` before the `enabled` check; clear `_objects`,
   `_records`, `_lists`, `_circleRecs` in `dispose()`; clear `_sceneWalk` when gizmos are off and in
   `detach()`, plus `_gizmoSelected.clear()`; `material.dispose()` in `GizmoIcons.dispose()`.
6. **Test gaps (B1r3, B1r4 #9).** Add a unit check that feeds a synthetic
   `GL Driver Message (OpenGL, Error, …)` console line through `noErrors` and expects a failure, and an
   e2e scene with more than 8192 gizmo vertices that asserts every record is drawn (pool grown).
