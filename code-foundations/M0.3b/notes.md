# M0.3b — zero-delay `Destroy()` and the render

Card: ROADMAP `M0.3b` — *"Check: zero-delay `Destroy()` runs on a microtask after LateUpdate and
render; Unity destroys before rendering — probe with a running `Application`, then decide."*
Source: `code-foundations/M0.3/review.md` → *"Also observed, not filed as a defect (follow-up
`M0.3b`, check first)"*.

Repo(s): WebEngineTS (+ `.claude-shared` for the row).
Branch: `M0.3b-destroy-before-render`.

## Question the card leaves open

The review recorded that `Destroy(obj)` with no delay runs on a `queueMicrotask`
(`EngineObject.ts:370`), and that called from `update` inside the synchronous
`Application._loop` the microtask runs after the loop body. Unity documents
"delayed until after the current Update loop, but always done before rendering".
The card asks for a probe with a *running* `Application` and a decision — it does
not say whether the observed order is a defect or an acceptable difference.

## Probe

A running `Application` with the FakeBackend harness of `LoopFrameIntegrity.test.ts`, a doomed
GameObject with a script logging `lateUpdate`/`onDestroy`, and a second script that calls
`EngineObject.Destroy(victim, 0)` from `update`. `_render` was wrapped to log the render point.

Result (before the change):

```
["destroyer:update","victim:lateUpdate","loop:render","victim:onDestroy"]
```

So the finding holds **with a loop running**: `onDestroy` fires after the render, and the doomed
object is visited by `scene._lateUpdate()` on the frame it dies. Both are after the frame body — the
whole of it, including the render at step 7 and the UI canvas paint at step 8.

## Evidence that it is a difference and not a no-op

- Unity, `Object.Destroy` (docs.unity.com/en-us/engine/6000.0/script-reference/unityengine/object/destroy):
  *"Actual object destruction is always delayed until after the current Update loop, but always happens
  before rendering."*
- The engine already agreed with Unity **for a delayed destroy**: `Application._loop` runs
  `EngineObject._updatePendingDestroys(Time.deltaTime)` at step 7a-, with the comment *"Here rather
  than later so an object asked to die never gets audio-synced, laid out or LOD-selected on the frame
  it dies — Unity destroys at this point in the frame for the same reason."* The zero-delay path was
  the only one that did not.
- What the wrong order costs, on the frame the object dies: it is laid out (`LayoutGroup`,
  `ContentSizeFitter`, `AspectRatioFitter`, `ScrollRect`), hit-tested by `EventSystem._update()`,
  LOD-selected (`LODGroup._updateAll()`), audio-synced (`AudioListener`/`AudioSource`), and **drawn**
  (3D render at step 7 and UI canvas at step 8). A bullet destroyed in `update` still appears on
  screen; a button destroyed in `update` still takes a click that frame.

## Decision

Fix it. The card's "decide" is decided by the engine's own documented Unity order for the timed
path: one rule for both, at the sweep the loop already runs after LateUpdate.

## Implementation

`EngineObject.Destroy` (src/engine/core/EngineObject.ts):

- delay > 0 and finite → `_pendingDestroys.push({ obj, remaining: delay })` (unchanged).
- otherwise (0, negative, `NaN`, `±Infinity`) → `_pendingDestroys.push({ obj, remaining: 0 })`, so the
  entry is due at the next `_updatePendingDestroys` — the same sweep, in the same frame phase — **and**
  `queueMicrotask(() => EngineObject._updatePendingDestroys(0))` as the fallback for callers with no
  loop running (a load's `awake`, a host's `dispose`, a test).

Why both: the sweep is only called from the frame loop. Without the microtask a `destroy()` issued
outside any loop (the already-pinned case in `DestroyedDuringLoad.test.ts`, whose singleton pattern
destroys in `awake`, and `AssetCacheSharing`/`TextureSwap`, whose comments document the tick-later
settling) would never be destroyed. With both, the sweep having already removed the entry makes the
microtask call a no-op (`pending.length === 0` short-circuits), so the only way it does anything is
when no frame ran.

Consequence, deliberate: a zero-delay destroy now obeys the *loop-stops-everything* rule a positive
delay always had. A `remaining` of 0 minus the frame's delta is negative, so the entry is due on the
first frame that runs — including one with `Time.deltaTime = 0` (a paused game reports 0, but the
subtraction `0 - 0 <= 0` is still due). It is not postponed by a pause; it simply never happens if
the loop never runs. It used to fire from a microtask regardless of the pause.

Note on `NaN`: `Number.isFinite(NaN)` is false, so `NaN` goes through the zero path and is due at the
first frame, like delay 0 — the same treatment the microtask gave it.

`+Infinity` is also zero-path now (`Number.isFinite(Infinity)` is false) and dies on the first frame.
Previously it went through the microtask and died a tick later. `tests/DelayedDestroy.test.ts`
pins that it is not parked forever; it now dies a frame earlier rather than never.

## Tests

New `tests/DestroyBeforeRender.test.ts` (3 tests):

1. **destroys its object before the frame renders it** — the finding, pinned with a running
   `Application`: `victim:onDestroy` before `loop:render`, `victim:lateUpdate` before the render.
   Failed before the fix.
2. **still destroys its object when no loop is running** — the fallback case: `Destroy(go, 0)` with no
   `Application` alive still resolves by the next `await Promise.resolve()`.
3. **a negative or non-finite delay is treated as zero** — `Destroy(x, -1)` and
   `Destroy(x, Number.POSITIVE_INFINITY)` both die at the first sweep.

No existing test had to change. Nothing in the suite ran a frame loop *and* a zero-delay destroy
together, which is why this went unnoticed: 2829 of 2829 tests passed after the change with no edits
to existing expectations.

## Checks (one run, all green)

- `npm run typecheck` — exit 0 (three tsconfigs).
- `npx vitest run` — 162 files passed, 2829 tests passed, 0 failed. (Before the change on the same
  base commit, without the new file: 161 files, 2817 passed 9 skipped; the new file adds 3, and one
  previously-skipped file now runs, +9.)
- `npm run build` — exit 0.
- `npm run size` — 395,445 gzip against the 450,000 budget; player-host 7,897 against 8,000;
  player 3,190 against 4,000.

Bundle-size check: no allocation was added to the destroy path (the microtask closure existed before;
the pending entry is pushed instead of nothing). Both figures are inside budget and unchanged in kind
from the previous release, so no re-measure is needed.
