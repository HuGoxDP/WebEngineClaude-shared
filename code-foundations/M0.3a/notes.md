# M0.3a — update walk runs each object at most once per pass

Branch `M0.3a-update-walk-once` (WebEngineTS, `.claude-shared`). Date: 2026-11-07.
Engine commit: `b05b3a2 fix(core): an object that already ran does not run again after moving under a later parent`.

## Defect

Found by the M0.3 review (`code-foundations/M0.3/review.md`, "Remaining hazard"). The per-frame
passes (`Scene._fixedUpdate` / `_update` / `_lateUpdate` → `GameObject._system*Update`) walk the
hierarchy. A13 and M0.3 made the walks copy-on-write and skip an object moved away *before* its
turn (`_isLiveChild`, `_isLiveRoot`), but nothing recorded who had already run, so an object that
ran and then moved under a parent visited later in the same walk ran again. Probe:
`["top","k","k"]`. Pre-existing (the index walk had the same gap). Unity runs a behaviour's
callback at most once per pass.

## Reproduction first

`WebEngineTS/tests/UpdateWalkOnce.test.ts`, 23 tests. Before the fix: **19 failed**, 4 passed
(the 3 "child that makes itself a root" cases and the direct-call case, which pin behaviour that
was already right). Per phase (update, fixedUpdate, lateUpdate):

- child moves itself under a later sibling (and runs normally the next frame)
- child moved by a later sibling under a later parent
- the moved object's own children run once too
- root moves itself under a later root; the root between still runs
- root moves itself deep into a later root's subtree
- root moved by a later root under a still later one
- child makes itself a root (already right)

Plus: with `@ExecutionOrder`, each order is its own pass (an object that moved in an early pass
still runs its later-order component, once); a direct `go._systemUpdate()` call is a walk of its own.

## Fix

- `src/engine/core/_UpdateWalk.ts` (new, leaf module): `_beginUpdateWalk()` returns a fresh walk
  number. Leaf so `Scene`, which imports `GameObject` as a type only, can start a walk without a
  value import cycle.
- `GameObject._ranInWalk: number` — the walk the object's own components last ran in.
  `_systemUpdate/_systemFixedUpdate/_systemLateUpdate(order, walk = _beginUpdateWalk())`: if the
  stamp equals `walk` the components are skipped, the children are still visited (each checks its
  own stamp; a child that joined after the first visit can still run once). Children get the same
  `walk`.
- `Scene`: one `_beginUpdateWalk()` per pass (per execution order, per fixed step), passed to every root.

Stamp per GameObject rather than per behaviour: one field write per object instead of per script,
and a component added to an already-run object is not run in the same pass when the object moves —
it first runs next frame, which is Unity's behaviour for `AddComponent` during `Update`.

## Cost

Probe `probes/zz_m03a_probe_bench.test.ts` (copy into `WebEngineTS/tests/`): one frame =
`_fixedUpdate` + `_update` + `_lateUpdate`, median of 9 × 500 frames, before/after alternated in
separate processes, 4 rounds. Shared machine (two other agents running); round 1 was warm-up noise
(tree-empty 1974 vs 2194 µs) and is dropped.

| Shape (3 passes per frame) | before (rounds 2–4) | after (rounds 2–4) |
|---|---|---|
| 1 root × 2000 empty children | 142 / 78 / 73 µs | 83 / 80 / 80 µs |
| 10 roots, 4-ary depth 4 = 3410 empty GOs | 589 / 583 / 582 µs | 550 / 508 / 494 µs |
| same, one no-op `ScriptableBehaviour` each | 737 / 779 / 714 µs | 683 / 713 / 699 µs |

Within noise: at most ~+7 µs on 2000 objects (≈ 1 ns per object per walk), and the trees came out
equal or faster. Heap delta per 4 500 frames unchanged (33→35 KB flat, 26→29 KB tree — GC noise;
the walk number is a small integer, no allocation). A13's "a quiet frame copies nothing" tests
still pass.

## Checks

`npm run typecheck` exit 0; `npm test` 152 files passed, 1 skipped; 2681 tests passed, 9 skipped;
`npm run build` exit 0. Engine `CHANGELOG.md`: the Known issue moved to *Fixed*.

## Follow-ups (not done here)

- **Converse case — an object moved, before its turn, under a parent already walked, misses the
  frame.** Probe `probes/zz_m03a_probe_converse.test.ts`: roots A, B, C; B moves C under A →
  `["A","B"]`, C does not run this frame. Unity would run it. Fixing needs a catch-up of objects
  that left a not-yet-walked position (e.g. a per-walk "pending" list built only on reparent), a
  separate design; candidate row for the owner.
- `ScriptableBehaviour._guard` takes a closure per callback; the scripted-tree bench shows heap
  churn (~2.8 MB per 4 500 frames reclaimed by GC) that predates this change. Worth a look against
  the zero-allocation rule.
