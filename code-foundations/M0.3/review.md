# M0.3 — Opus review of A13 (lifecycle robustness)

Reviewed: `72e7b08` (a throwing onDestroy still destroys), `faa77e4` (a child destroyed during its
parent's update loop does not break the loop), on `master` at `03b640f`.
Branch: `M0.3-a13-review` in WebEngineTS and `.claude-shared`. Date: 2026-11-07.

**Verdict: A13 holds; its acceptance is met. The open `Scene` root-loop skip was a real defect in
A13's own scope and is fixed. Two small error-loss defects found and fixed. One remaining hazard
(double update after a self-reparent) is a follow-up, `M0.3a`.**

## Acceptance of the card, re-checked

| Card item | Evidence | Result |
|---|---|---|
| Throwing `onDestroy` ends destroyed; `destroyImmediate` rethrows; not in registry / `FindObjectsOfType` / the object's list; destroying the GO afterwards does not throw | `tests/DestroyRobustness.test.ts` (A13's), and the A3 probe P2 re-run against this branch: `f.exists() false calls 1 goDestroyThrew false go.exists() false found 0` | holds |
| `destroyImmediate(this)` in `onDestroy` runs once; mutual destroy runs once each | A3 probe P3 re-run: `calls 1 listed 0` (was 50 with a cap of 50) | holds |
| Child destroying a later / earlier sibling / itself from `update`, `fixedUpdate`, `lateUpdate`: no throw, correct counts | A13 tests, 3 phases × 5 cases, green | holds |
| `onDestroy` still reads `gameObject` and its fields | A13 test "what onDestroy can still see" | holds |
| A3 probes in `tasks/probes/cards-a3-a6/` | all 11 probes (`zz_review_a3`, `a3b`, `a3c`, `skip`) pass on this branch | holds |
| Lifecycle tests unchanged in count | no test removed or weakened; 12 tests added | holds |

## Focus 1 — copy-on-write children cost ("+15–60% on empty children")

**Classification: acceptable.** The cost is real but small in absolute terms, and the design keeps
the zero-allocation rule (a frame with no structural change allocates nothing — pinned by A13's
"a quiet frame copies nothing" test).

Where it comes from (`GameObject.ts:899`, `:920`/`:943`/`:966`; `Transform.ts:631`): every walk
writes `_childrenLent = true`, and each child is tested with `child.parent === parent &&
child.gameObject.exists()` instead of the old `getChild(i)` bounds check.

Measured (probe `probes/zz_m03_probe_bench.test.ts`, `Scene._update()` only, one implementation
per process so the JIT does not deopt across variants, median of 9 × 500 frames, three runs each;
best run shown because the machine was shared with two other agents and the spread was wide):

| Shape | legacy index walk | A13 copy-on-write | delta |
|---|---|---|---|
| 1 root × 2000 empty children | 29.5 µs | 34.8 µs | +18% (≈ 2.7 ns per child) |
| 10 roots, 4-ary depth 4 = 3410 empty GOs | 154.3 µs | 164.1 µs | +6% (≈ 3 ns per GO) |
| same, one no-op `ScriptableBehaviour` each | 155.9 µs | 172.4 µs | +11% (≈ 5 ns per GO) |

Run-to-run noise was larger than the effect (the scripted tree ranged 156–666 µs for the *legacy*
walk), so "+15–60%" is the noise envelope, not the cost. The cost is a few nanoseconds per
GameObject per walk: about 0.03 ms per frame for 3.4k objects over update + lateUpdate + one fixed
step — under 0.2% of a 16.7 ms frame. A variant that lends only non-empty lists (an empty loop runs
no user code, so it needs no protection) was within noise of both; not worth a change without a
quieter machine.

## Focus 2 — errors logged, not rethrown, from `GameObject.onDestroy`

**Classification: acceptable (Unity-matching, documented in the CHANGELOG and JSDoc).**
`GameObject.ts:1001` logs a component's throwing `onDisable`/`onDestroy` and carries on with the
other components, the children, the scene unregistration and the Transform. Unity never propagates
an exception out of `OnDestroy`; it logs and finishes the destruction. Rethrowing would leave the
object half torn down and still registered with its scene. No double logging: the deferred paths
only see errors from a bare component (GameObject teardown has already swallowed its own).

Two places where an error *was* lost — both fixed (commit `3eefb27`):

1. **Zero-delay `destroy()` of a throwing component** (`EngineObject.ts:366`, master). The
   microtask called `_destroyImmediate()` unguarded. Probe: `uncaughtException: Error: boom`,
   engine log count 0 — in a browser an uncaught error that names no object, in Node/vitest an
   unhandled error. Now logged with the object's name, the same way the timed path
   (`EngineObject.ts:414`) already did; the object still ends destroyed.
2. **`onDisable` and `onDestroy` both throwing** (`Behaviour.ts:174`, master). The `finally` let the
   `onDestroy` error replace the `onDisable` one; probe: caller got `destroy`, log empty — the
   `onDisable` error vanished. Now the `onDestroy` error reaches the caller and the `onDisable` one
   is logged. A lone throwing `onDisable` still reaches the caller (pinned).

Noted, not changed (owner question Q1 below): with `ScriptableBehaviour.isolateCallbackErrors =
false` (the debugging "hard stop", `ScriptableBehaviour.ts:112`) GameObject teardown still only
logs (probe: `threw false, logged 1`). And `destroyImmediate(component)` rethrows while every other
destroy path logs — the card's explicit decision, so left as is.

## Open item — `Scene` root loops skip a root after one is destroyed mid-update

**Classification: real defect, in A13's scope (hazard 3 at root level). Fixed, commit `0b080ad`.**

`Scene._fixedUpdate` / `_update` / `_lateUpdate` (`Scene.ts:358, 368, 386, 396, 414, 424` on
master) walked `_rootGameObjects` by index over the live array, and `_unregisterGameObject`,
`_onGameObjectParentChanged` and `_moveRoot` spliced it. Probes on master:

| Case | expected | master |
|---|---|---|
| root A destroys itself in `update` | A, B, C | **A, C** (B skipped) |
| B destroys earlier root A | A, B, C | **A, B** (C skipped) |
| A destroys later root B | A, C | A, C |
| A moves itself to the end (`setSiblingIndex`) | A, B, C | **A, C, A** (B skipped, A twice) |

Unity runs every live behaviour's `Update` once per frame regardless of what another one destroys,
so this is a defect, not a convention. Fix: the same lend / copy-on-write scheme A13 gave
`Transform._children` — `Scene._lendRoots`, `_writableRoots` (all five writers go through it),
`_isLiveRoot` (`exists()`, still in this scene, still a root). Pinned by 15 tests
(`DestroyRobustness.test.ts`, "a root changed during the scene's %s loop", 3 phases × 5 cases);
12 of the new tests fail on master and pass on the branch.

**Behaviour change, recorded under *Fixed* in the engine CHANGELOG:** a root created during the
walk (`new GameObject()` / `Instantiate` from `update`) now first updates on the next frame, as a
child created during its parent's walk already did since A13 (probe on master: `["A","N"]` — the
new root ran the same frame; branch: `["A"]`). It also matches what Unity is generally observed to
do (a script instantiated during `Update` first updates on the next frame), and removes an
inconsistency between roots and children. No existing test depended on the old behaviour.

## Remaining hazard (follow-up `M0.3a`)

**An object that has already run this frame and then moves under a parent walked later runs a
second time.** Probes on the branch: a root that reparents itself under a later root —
`update` twice; a child that reparents itself under a later sibling's subtree —
`["top","k","k"]`. A13's `_isLiveChild` only covers an object moved *before* its turn. Present
before A13 too (the index walk had the same gap). Fix needs a per-pass "already ran" stamp on the
behaviour or GameObject — a hot-path change of its own, outside this review. Recorded under
*Known issues* in the engine CHANGELOG.

## Also observed, not filed as a defect (follow-up `M0.3b`, check first)

`Destroy(obj)` with no delay runs on a `queueMicrotask` (`EngineObject.ts:370`). Called from
`update` inside the synchronous `Application._loop`, the microtask runs after the loop body —
after LateUpdate *and render*. Unity documents "delayed until after the current Update loop, but
always done before rendering". Not part of A13 (pre-existing since the A3/D5 design); needs a
probe with a running `Application` before deciding.

## Changes on the branch

```
3eefb27 fix(core): destroy errors nobody can catch are logged, not lost
0b080ad fix(core): a root destroyed during the scene's update loop does not skip the next root
```
`CHANGELOG.md` (+23), `Behaviour.ts`, `EngineObject.ts`, `Scene.ts`, `tests/DestroyRobustness.test.ts`
(+118, 15 + 3 tests). Checks: `npm run typecheck` exit 0; `npm test` 150 files passed, 1 skipped,
2644 tests passed, 9 skipped; `npm run build` exit 0.

## Owner questions

- **Q1.** Should GameObject teardown rethrow the first component error *after* finishing the
  teardown when `ScriptableBehaviour.isolateCallbackErrors === false`, so the debugging hard stop
  also covers `onDestroy`? Today it always logs. Default behaviour would not change.

## Probes

`probes/zz_m03_probe_roots.test.ts` (root loop, microtask, double-throw, strict mode, self-reparent)
and `probes/zz_m03_probe_bench.test.ts` (walk cost; `BENCH_IMPL=legacy|current|variant`). Copy into
`WebEngineTS/tests/` to run; they were not committed to the engine.
