# C2 — Engine E2: edit mode — build notes (W1, 2026-11-12)

Branch: `C2-edit-mode` in `WebEngineTS` (engine) and `.claude-shared` (this file, roadmap, milestone note).
Plan: `plan.md`; research and the binding decisions D1–D9: `research.md`.
Base at plan time: `06aeaf5`; base at merge time: `2569fc4` (both ancestors of `master`).

## What landed, per phase

| Phase | Commit | Result |
|---|---|---|
| 1 — mode state, API skeleton, decorators | `5f8f86c` | `_PlayMode.ts` (leaf, no imports); static `Application.isPlaying` = `!_isEditMode()` with the instance flag documented as the loop flag; `enterEditMode()` / `enterPlayMode()` idempotent with `Time._reset()`; `@ExecuteAlways` / `@ExecuteInEditMode` + `_executesInEditMode` (own class only, never inherited); exports. 7 tests. |
| 2 — the lifecycle gate | `340bea9` | The gate in `ScriptableBehaviour`: constructor caches `_runsInEditMode = _executesInEditMode(new.target)`; one predicate `_lifecycleAllowed()`; early returns in `_systemAwake` (does **not** set `_awakeCalled`), `_onEnabledChanged` (before `super`, only for a never-woken script), `_systemUpdate`, `_systemLateUpdate`; `_systemFixedUpdate` returns in edit mode, decorated or not. `GameObject._awakeComponent` / `_runDeferredAwakes` verified to funnel through the gated entries, so `GameObject` needed no change. 11 tests. |
| 3 — transitions | `bbe433a` | `GameObject._wakeForPlay()` (components in list order, then live children depth first) and `Scene._wakeForPlay()`; `enterPlayMode()` runs the pass over every loaded scene and the Phase 1 TODO is gone; `Scenario.run()` throws in edit mode before creating anything, importing the leaf `_PlayMode.ts` (no cycle); both Cinemachine drivers `@ExecuteAlways`. 10 tests. |
| 4 — the edit frame | `01be3eb` | `Application.updateEditMode(dt)`: clamped delta (non-finite → 0), `Time._update`, the active scene's update and late update, the pending-destroy sweep, the layout passes, `LODGroup`, `LineRenderer`; throws in play mode; no `Application` instance needed. 5 tests. |
| 5 — adversarial review and compatibility proof | `cbfda31` | An independent reviewer probed the four phases; four defects fixed (see below), four findings recorded with why they are not defects. 13 more tests. |
| 6 — docs | (this commit) | Engine `CHANGELOG.md`, the ROADMAP row, the C5/C4 notes in `tasks/C-milestone-2.md`, this file. |

Tests, all new, none existing modified: `tests/EditMode.test.ts` (7), `EditModeLoad.test.ts` (11),
`EditModeTransitions.test.ts` (10), `EditModeFrame.test.ts` (5), `EditModeCompat.test.ts` (10),
`EditModeCinemachine.test.ts` (3) — **46 tests** on the C2 behaviour.

## Decisions taken during the build

| # | Phase | Decision | Why |
|---|---|---|---|
| 1 | 2 | `GameObject._awakeComponent` / `_runDeferredAwakes` untouched | Verified both funnel through `_systemAwake` / `_onEnabledChanged`, which the gate covers — the plan's fallback (gate the bypassing route) was not needed. |
| 2 | 2 | A link-mode save states version 2 only when the scene really holds a prefab link | DW-2.2's link case binds a guid (`AssetDatabase._bindGuid`) and instantiates a real prefab rather than saving plain objects with `prefabs: "link"`. |
| 3 | 2 | Editing out of edit mode is not asserted by a test | No wake pass exists until Phase 3, so a script added while gated must not be observed waking; Phase 3 owns DW-3.x. |
| 4 | 5 | A callback that switches modes mid-callback stops where it is and warns | Continuing would drive a world in a mode the host did not ask for (wake pass cut short, layout drivers run in play mode on a reset clock). Warning instead of throwing: the host's own code decided the switch. |
| 5 | 5 | Teardown still pairs what play woke (research D4) | No leaked subscription whatever order a host switches in; `enterEditMode`'s JSDoc now says so, rather than "nothing awake is touched". |

## The adversarial review (Phase 5)

Findings, and what each became:

| Finding | Severity | Outcome |
|---|---|---|
| `enterEditMode()` inside an `awake` of the wake pass aborts the pass silently, leaving a half-woken world in edit mode | medium | **Fixed** — the pass warns when a callback re-entered edit mode. Verified: what woke stays woken and paired; the rest wakes on the next switch, with no double wake. Regression test in `EditModeCompat.test.ts`. |
| `enterPlayMode()` inside an opted-in `update` of an edit frame let the rest of the "edit" frame run in play mode, on a clock the callback had already reset | medium | **Fixed** — the frame stops at the switch and warns. Regression test included. |
| `updateEditMode` fed the raw `dt` to the pending-destroy sweep, so with `timeScale = 0.5` a 0.1 s destroy counted down at full speed | low/medium | **Fixed** — driven by `Time.deltaTime`. Regression test: half speed takes twice as many frames. |
| `updateEditMode` re-read `SceneManager.activeScene`, while the play loop captures it once | low | **Fixed** — captured once. A callback that loads a scene can no longer have this frame's late update land in it. |
| An edit frame has no `try/finally` | low | **Recorded, not a defect** — with `isolateCallbackErrors = false` the throw ends the frame at the throw, exactly as the play loop's hard stop ends a frame; the walk's own bookkeeping is restored in `Scene`'s finally, so the next frame is clean. |
| A play-woken undecorated script still gets `onEnable` / `onDisable` in edit mode | low | **Recorded, by design** (research D4, decision log row "Teardown pairs with what was received") — the JSDoc said otherwise and now states the rule. |
| `enterEditMode` does not stop a running loop or scenario | low | **Recorded, by design** (D6 puts teardown on the host) — now stated in the JSDoc; there is no other way for the engine to reach a host's loop. |
| The Cinemachine `@ExecuteAlways` was untested | coverage gap | **Fixed** — `EditModeCinemachine.test.ts` pins the brain driving the live camera in one edit frame, and the vcam registry filling and emptying in both modes. Plan Assumption 3 is now verified, not assumed. |
| `WaitForFixedUpdate` on an opted-in coroutine never resolves in edit mode | informational | **Recorded** — `fixedUpdate` does not step in Unity's edit mode either, so a physics-gated coroutine waits for play; the option is a documented stall, not a hang. |

Probed and found safe (each with its evidence in the review): no re-entrancy blowups; an `awake` that creates
an object during the pass does not wake it twice; an `awake` that destroys a later sibling leaves nothing
unpaired; no spurious wake through an inactive parent; `sendMessage`/`broadcastMessage` reach a sleeping
script (Unity's rule, pinned by test); `@ExecutionOrder` + `@ExecuteAlways` keep the order in an edit frame;
`updateEditMode(0)` and "no `Camera.main`" do not throw; the wake pass is one-shot and allocates nothing per
frame; no wake route bypasses the gate (`addComponent`, `deserializeScene`, `deserializeGameObject`,
`Instantiate`, `Prefab.instantiate`, `loadScene`, `setActive`, reparent); no consumer reads the static
`Application.isPlaying` (grep over the engine, its tests and the W1 checkouts of the other four repos).

## Evidence

**DW-1.1** — the grep for readers of the static `Application.isPlaying`: none in `src/`, `tests/`, nor in the
W1 checkouts of `WebEngineTSEditor`, `virtual-lab`, `ScenarioCreator`, `.claude-shared`. The editor's
`play.isPlaying()` is its own signal; the instance flag keeps the loop meaning (`Application.ts`).

**DW-5.2** — base vs branch play-mode logs. One scratch probe (five lifecycle fixtures: add + frame +
activate + destroy; a scene load with an inactive subtree then activation; a reparent under an inactive
parent and back, plus a clone; a mid-walk reparent over two frames; a prefab instantiate and revert) drove
play mode only, so it runs unchanged on both sides. Run on `git archive 06aeaf5` (extracted to /tmp with the
node_modules junction) and on the branch:

```
$ npx vitest run tests/zz_c2_compat_probe.test.ts        # branch
$ cd /tmp/c2base && npx vitest run tests/zz_c2_compat_probe.test.ts   # base 06aeaf5
$ diff /tmp/c2-base.log /tmp/c2-branch.log
$ sha256sum /tmp/c2-base.log /tmp/c2-branch.log
ff3e655be0f069f74401833bf90aef12cd86eb5988c1a7c2752f6c3dcbf83709  /tmp/c2-base.log
ff3e655be0f069f74401833bf90aef12cd86eb5988c1a7c2752f6c3dcbf83709  /tmp/c2-branch.log
```

Identical — 89 lines each, same hash, no diff. (The probe was scratch and is not committed.)

**DW-5.3** — the M0.3a walk bench (`code-foundations/M0.3a/probes/zz_m03a_probe_bench.test.ts`, copied in,
not committed). This shared machine's noise band makes the gate's cost unmeasurable: alternating rounds of
`2569fc4` against the branch gave branch/base ratios of 1.05–1.72 on the scripted tree, while the gate-free
Phase 1 measured **0.74–0.97 of the base in the same runs** — i.e. the band on this machine is at least
±25%, wider than the effect being looked for. The M0.3a noise band (±1 ns per object per walk) was measured
on a quiet machine. What is known from the code: the gate costs three boolean reads per script per frame
(two calls, both cheap enough to inline) and allocates nothing; the wake pass is one-shot and its component
copy is once per enter-play. Follow-up (not a row): re-run the bench on a quiet machine, and if a real
regression shows, hoist `_runsInEditMode`'s read into the walk or inline the three gates into one flag read.

**DW-5.4** — `npm run typecheck` exit 0; `npm test` **177 files / 2922 tests passed** (exit 0);
`npm run build` exit 0.

## Known limitations

- `WaitForFixedUpdate` on an opted-in coroutine never resolves in edit mode (physics does not step there —
  Unity parity).
- An in-place Stop leaves the edit world with play-mode state; C5 must use the D6 reload flow (noted in
  `tasks/C-milestone-2.md`).
- Additive scenario load and per-scene registries are still missing (a C5 concern, not a C2 defect):
  `loadScenarioFromBuffer` destroys every loaded scene and the type registry spans scenes.
- No `OnValidate` hook (research D9) — a C4 concern if the editor wants one.
