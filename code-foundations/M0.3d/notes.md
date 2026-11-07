# M0.3d — update walk catches up an object moved before its turn under a walked parent

Branch `M0.3d-walk-catch-up` (WebEngineTS, `.claude-shared`). Date: 2026-11-07.
Engine commit: `fb32cd8 fix(core): an object moved before its turn under a walked parent still runs once`.

## Defect

The converse of M0.3a (`code-foundations/M0.3a/notes.md`, follow-up 1). The per-frame passes
walk the hierarchy through parents. An object moved, *before its turn*, under a root or parent
the walk has already left is never reached: roots A, B, C; B's `update` moves C under A →
`["A","B"]`, C (and its subtree) misses the frame. Same for a later child made a root (the lent
root list does not contain it) and for children detached by their own parent in its `update`
(`detachChildren`). Unity's update iterates behaviours, not the hierarchy: a behaviour that existed
when the pass began runs in it once wherever it was moved.

## Reproduction first

`WebEngineTS/tests/UpdateWalkCatchUp.test.ts`, 39 tests (update, fixedUpdate, lateUpdate each).
Before the fix: **27 failed**, 12 passed (the pins of behaviour that was already right).

Failing before, per phase:
- root moved under an earlier, already-walked root (and runs normally next frame, under it)
- child moved by a later sibling under an already-walked parent
- child moved by its own parent under an already-walked root
- the moved object's own children run once too
- a later child made a root before its turn
- children detached by their parent before their turn
- an object that moves itself again while being caught up runs once
- `@ExecutionOrder`: move in an early order pass (moved object runs its early component in the
  catch-up and its default-order component in the next pass, once each); move in a late order pass

Pins (passed before and after), per phase: moved twice (under a walked parent, then under a later
one) runs once; moved under an inactive parent does not run; moved then destroyed does not run;
**created during the pass and put under a walked parent starts next frame**.

The M0.3a probe `zz_m03a_probe_converse.test.ts` now prints `["A","B","C"]`.

## Design

- `_UpdateWalk.ts` (leaf, still imports `GameObject` as a type only) gains a recording slot and
  one shared array `_movedInWalk`. `_recordMovesFor(walk)` opens recording and returns the outer
  value (a nested scene pass restores it); `_noteMoved(go)` pushes `go` only if a walk is
  recording and `go._mayMissWalk(walk)`.
- `Transform.setParent` calls `_noteMoved(this.gameObject)` after the attach. Outside a scene walk
  that is one comparison.
- `GameObject._createdAfterWalk` = the last walk number at construction.
  `_mayMissWalk(walk)` = not run in `walk` and created before it began;
  `_missedWalk(walk)` = that, plus `exists()` and `activeInHierarchy`.
- `Scene`: the six per-pass loops collapse into `_runPass(pass)` → `_walk(pass, order)`. `_walk`
  takes the walk number, opens recording, remembers the array length, walks the roots, then runs
  every recorded object (index loop, so objects moved *during* catch-up are caught up too) that is
  in this scene and `_missedWalk(walk)`, through the same `_system*Update(order, walk)` — the
  M0.3a stamp keeps it at most once, and the subtree is visited with the same walk. `finally`
  truncates the array back and restores the outer recording.

Decisions:
- **Created during the pass → next frame**, kept from M0.3: `_createdAfterWalk < walk` excludes it
  from catch-up. Each execution order is its own walk, so an object created in order pass N is
  eligible from pass N+1 on, the same as the normal walk treats it.
- Catch-up runs **at the end of the walk**, not at the moved object's old position. Unity's own
  order across objects is not the hierarchy's either; what Unity guarantees, and what is pinned,
  is "once per pass".
- Only `setParent` is a hook: it is the single place a parent link changes for a live object.
  `moveGameObjectToScene` is covered by the `go.scene === this` filter (the other scene's own pass
  is responsible). Destruction splices directly and needs no catch-up.
- Not tracked (documented, not pinned): an object that was *inactive* when the pass began, is
  activated and then moved under a walked parent before its turn would be caught up — the normal
  walk already runs such an object if its new position is later, so the two agree.

## Cost

Probe `probes/zz_m03d_probe_bench.test.ts` (the M0.3a bench plus a `tree3410-script-mover` shape: a
script on root 5 moves root 9 under root 0 and back every other frame, so every second `update`
records and catches up a 341-object subtree). One frame = `_fixedUpdate` + `_update` +
`_lateUpdate`, median of 9 × 500 frames; before/after alternated in separate processes, 10
rounds. Shared machine (M0.2a and M0.3e agents running) — round 1 dropped as warm-up; numbers
below are the median of rounds 2–10 per side.

| Shape | before | after |
|---|---|---|
| 1 root × 2000 empty children | 96.3 µs | 100.5 µs |
| 10 roots, 4-ary depth 4 = 3410 empty GOs | 590.2 µs | 508.4 µs |
| same, one no-op `ScriptableBehaviour` each | 712.8 µs | 766.1 µs |
| same + reparenting every frame (catch-up path) | 1074.1 µs | 1237.7 µs |

Round-to-round spread is ±15–40 % on this machine; the differences are inside it in both
directions. The quiet path adds one array-length read, a `try/finally` and one switch per root
per walk, no allocation: heap delta per 4 500 frames 6→16 KB (flat), 20→2 KB (tree), i.e. GC
noise. The mover shape's extra time before/after is dominated by `setParent` itself (world pose
recompute); the fix moves real work there — 341 objects that used to skip a frame now run.

## Checks

`npm run typecheck` exit 0; `npm test` 156 files passed, 2746 tests passed; `npm run build` exit 0.
Engine `CHANGELOG.md`: *Fixed* entry next to M0.3a's.

## Follow-ups

None new. M0.3e (`ScriptableBehaviour._guard` closure churn) is unchanged by this task; the
scripted-tree heap delta in the bench before the fix (up to ~62 MB / 4 500 frames, GC-timing
dependent) is that churn.
