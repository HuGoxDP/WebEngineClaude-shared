# Plan: C2 — Engine E2: edit mode (`@ExecuteAlways` / `@ExecuteInEditMode`)
**Created:** 2026-11-10 (Claude, architect lane)
**Status:** ready
**Complexity:** complex
**Review cadence:** 1
**Check-ins:** quiet
---
## Context
In the editor a user script runs as soon as it is added, loaded or activated
(`GameObject._awakeComponent` → `_systemAwake`). Unity runs scripts only in Play, except classes
marked `[ExecuteInEditMode]`/`[ExecuteAlways]`. C2 adds a global edit/play mode (default play),
the two decorators, a gate in the script lifecycle, a host-driven edit-mode frame, and the
edit↔play transitions the editor's Play/Stop (C5) and script reload (C4) need. Card:
`tasks/C-milestone-2.md` § C2. Research and every decision with its evidence:
`code-foundations/C2/research.md` — **read it first; its Decisions D1–D9 are binding.** Base:
WebEngineTS `master` `06aeaf5`.

**Success criteria (card + research):**
1. In edit mode a `ScriptableBehaviour` added, loaded (scene, `Instantiate`, prefab) or activated
   gets no `awake`/`onEnable`/`start`/`update`/`lateUpdate`/`fixedUpdate`.
2. `Application.enterPlayMode()` then runs, for that live script, `awake → onEnable` at once and
   `start` before its first `update` — the same order a play-mode load of the same scene produces.
3. A class decorated `@ExecuteAlways()` (or `@ExecuteInEditMode()`) gets `awake`, `onEnable`,
   `start`, `update`, `lateUpdate`, `onDisable`, `onDestroy` in edit mode, never `fixedUpdate`.
4. Built-ins (Camera, lights, renderers, Canvas/UI, layout, LOD, colliders, …) behave identically
   in both modes (`onAwake`/`onEnable` run, registries filled).
5. Every host that never switches is unaffected: full suite green with no test changed, play-mode
   callback logs identical to the base, walk bench within noise.
6. `npm run typecheck`, `npm test`, `npm run build` green.

## Constraints
- Engine only (`WebEngineTS`), plus this task's `.claude-shared` notes and the C2 card/ROADMAP row.
  No consumer changes; the editor adopts the API in C4/C5.
- Default mode is play; nothing outside an explicit `enterEditMode()` may change behaviour.
- No allocation in the per-frame paths (zero-allocation rule); the gate is field/boolean reads.
- No import cycles: the mode lives in a new leaf module (`_PlayMode.ts`), like `_UpdateWalk.ts`.
- Do not change the M0.2a two-pass load order, the M0.3a/d walk, or M0.3b/c destroy timing.
- Never weaken or edit an existing test to pass. Anything this plan does not answer is a question:
  park the task (ATTENTION), do not guess.

---
## Implementation Phases

### Phase 1: Mode state, public API skeleton, decorators
**Skills:** code-foundations:aposd-designing-deep-modules, code-foundations:code-clarity-and-docs
**Model:** sonnet
**Gate:** Standard
**Depends on:** none
**File scope:** src/engine/core/_PlayMode.ts (new), src/engine/core/Application.ts (static API only), src/engine/core/reflection/Decorators.ts, src/engine/index.ts (exports), tests/EditMode.test.ts (new)

**Goal:** the mode exists, can be switched and read, and classes can opt in — nothing consults it yet.

**Scope:**
- IN: `_PlayMode.ts` with `_isEditMode(): boolean`, `_setEditMode(v: boolean): void` (no imports);
  `Application.isPlaying` static getter → `!_isEditMode()` with JSDoc (Unity meaning; instance
  `isPlaying` = loop flag, JSDoc on both cross-referencing); `Application.enterEditMode()` and
  `Application.enterPlayMode()` (flag flip + `Time._reset()`, idempotent; the wake pass comes in
  Phase 3 — leave a `// TODO: Phase 3 wake pass` marker that Phase 3 removes);
  `@ExecuteAlways()` / `@ExecuteInEditMode()` (legacy class decorators, same per-constructor
  `WeakSet`/`Map`, own class only, not inherited) and `@internal _executesInEditMode(ctor)`;
  exports from `index.ts` (named + default namespace, as other decorators).
- OUT: any gate (Phase 2), wake pass (3), edit frame (4).

**Edge cases:** switching to the current mode does nothing (no `Time._reset`); a decorator on a
subclass does not mark its base, and a decorated base does not mark its subclass; tests must reset
the mode in `afterEach` (add a helper in the test file).

**Produces:** the API and the `_executesInEditMode` contract Phases 2–4 use.

**Done when:**
- [ ] DW-1.1: re-grep (engine `src`/`tests`, ScenarioCreator `Scenarios`, virtual-lab `frontend/src`, editor `app/src`) shows no reader of the static `Application.isPlaying`; output pasted into the build notes.
- [ ] DW-1.2: test: default `Application.isPlaying === true` with no `Application` constructed; after `enterEditMode()` false; after `enterPlayMode()` true; double calls are no-ops (`Time.frameCount` untouched by the second call).
- [ ] DW-1.3: test: `enterPlayMode()` from edit resets `Time.timeScale` to 1 and `Time.time` to 0.
- [ ] DW-1.4: test: `_executesInEditMode` true for both decorators, false for undecorated, false for a subclass of a decorated class.
- [ ] DW-1.5: full suite green with no existing test changed.

### Phase 2: The lifecycle gate (scripts only)
**Skills:** code-foundations:cc-defensive-programming, code-foundations:aposd-verifying-correctness
**Model:** sonnet
**Gate:** Full
**Depends on:** Phase 1
**File scope:** src/engine/core/ScriptableBehaviour.ts, src/engine/core/GameObject.ts (`_awakeComponent`, `_runDeferredAwakes` only), tests/EditMode.test.ts, tests/EditModeLoad.test.ts (new)

**Goal:** in edit mode an undecorated script starts no lifecycle step; decorated scripts and built-ins are unaffected.

**Scope:**
- IN: `ScriptableBehaviour` constructor caches `_runsInEditMode = _executesInEditMode(new.target)`;
  one private predicate `_lifecycleAllowed()` = `!_isEditMode() || this._runsInEditMode`;
  `_systemAwake` returns early when not allowed (does **not** set `_awakeCalled`);
  `_onEnabledChanged` override: when not allowed and not yet woken, return before `super` (records
  no `_wasActiveAndEnabled`, so no `onEnable` and no later unpaired `onDisable`); a script that has
  woken keeps normal transitions (research D4 gate rule); `_systemUpdate`/`_systemLateUpdate`
  return early when not allowed (no `start`, no `update`, no coroutine tick);
  `_systemFixedUpdate` returns early whenever in edit mode, decorated or not;
  `GameObject._awakeComponent` / `_runDeferredAwakes` need no logic change if the checks live in
  the script — verify and only touch them if a path bypasses `_systemAwake`/`_onEnabledChanged`.
- OUT: waking on the switch (Phase 3), edit frame (Phase 4).

**Edge cases:** script with `enabled = false` (play: awake only; edit: nothing); script on an
inactive object then activated in edit mode (nothing) and later in play (awake, onEnable);
reparent under an active parent in edit mode (M0.2e path: nothing); destroy of a never-woken
script in edit mode (no `onDisable`, no `onDestroy`); a script that woke in play, mode switched to
edit, then destroyed (gets `onDisable` + `onDestroy` — pairing); `isolateCallbackErrors = false`
unaffected; built-in `Behaviour` in edit mode still gets `onAwake`/`onEnable`.

**Done when:**
- [x] DW-2.1: test (card): in edit mode `addComponent(Logger)` on an active object → log empty; `update` via `scene._update()` → log empty. (`EditModeLoad.test.ts` — "a script added to an active object runs nothing, and neither does a frame")
- [x] DW-2.2: test: edit-mode `deserializeScene`, `EngineObject.Instantiate`, `Prefab.instantiate` and a link-mode instance with a script → no script callback; fields and references are restored (same values as a play-mode load). (four tests: plain scene load, instantiate + prefab instance, link-mode instance with `count`/`target` restored)
- [x] DW-2.3: test: `@ExecuteAlways` logger in edit mode → `awake, onEnable` at add, `start, update` on `scene._update()`, `lateUpdate` on `scene._lateUpdate()`, nothing on `scene._fixedUpdate()`, `onDisable, onDestroy` on `destroyImmediate`; same for `@ExecuteInEditMode`. ("an opted-in script runs the whole lifecycle in edit mode — never fixedUpdate", "@ExecuteInEditMode opts in exactly as @ExecuteAlways does", plus the prefab-instance variant)
- [x] DW-2.4: test: in edit mode Camera, DirectionalLight, MeshRenderer, Canvas+UIImage, HorizontalLayoutGroup, LODGroup, BoxCollider added → each is in its registry exactly as in play mode (compare registry membership both modes). ("the built-ins register in edit mode exactly as they do in play")
- [x] DW-2.5: test: the pairing cases above (never-woken destroyed → no `onDisable`/`onDestroy`; play-woken then edit-destroyed → both). (both tests, plus `enabled = false` both modes)
- [x] DW-2.6: full suite green with no existing test changed. (173 files / 2894 tests green, typecheck and build clean)

### Phase 3: Transitions — wake pass on `enterPlayMode`, Scenario guard, Cinemachine
**Skills:** code-foundations:cc-defensive-programming
**Model:** sonnet
**Gate:** Full
**Depends on:** Phase 2
**File scope:** src/engine/core/Application.ts (`enterPlayMode`), src/engine/core/Scene.ts (one `@internal _wakeForPlay()`), src/engine/core/GameObject.ts (one `@internal _wakeForPlay()`), src/engine/core/scenario/Scenario.ts (`run` guard), src/engine/core/cinemachine/CinemachineBrain.ts, src/engine/core/cinemachine/CinemachineVirtualCamera.ts, tests/EditModeTransitions.test.ts (new)

**Goal:** switching to play wakes the live world in load order; scenarios refuse to start in edit mode.

**Scope:**
- IN: `GameObject._wakeForPlay()`: if `!exists()` or `!activeSelf` return; `_awakeComponent(c)` for
  each component in list order (stop if the object dies); then recurse into live children
  (`_lendChildren` + `_isLiveChild`). `Scene._wakeForPlay()` over a copy of the roots;
  `enterPlayMode()` (from edit only) flips the flag, `Time._reset()`, then every loaded scene
  (`SceneManager.getSceneAt(i)`) `_wakeForPlay()`; remove the Phase 1 TODO.
  `Scenario.run()` throws before doing anything when `!Application.isPlaying`, message:
  `"[Scenario] Cannot run in edit mode. Call Application.enterPlayMode() first."` (import the leaf
  `_PlayMode.ts`, not `Application`, to avoid a cycle). `@ExecuteAlways()` on the two Cinemachine
  classes after reading their `awake`/`onEnable` (research Assumption 3).
- OUT: `enterEditMode` touches no object (research D6).

**Edge cases:** an `awake` during the wake pass that destroys a later sibling / its parent / adds a
component / creates a new object (new objects wake themselves through `addComponent` in play mode;
no double wake); inactive subtree (stays asleep, wakes on `setActive(true)`); opted-in script
already woken (no second `awake`/`onEnable`); multiple loaded scenes (additive) all wake; a throw
in one `awake` (isolation policy as in a load — check what `_awakeLoaded` does and match it).

**Done when:**
- [ ] DW-3.1: test (card): edit mode, `Holder > Child`, scripts A,B on Holder and C on Child; `enterPlayMode()` → log `A.awake, A.onEnable, B.awake, B.onEnable, C.awake, C.onEnable`; then `scene._update()` → `A.start, A.update, B.start, B.update, C.start, C.update`.
- [ ] DW-3.2: test: the same scene saved, then loaded in play mode on a fresh SceneManager, produces an identical log (in-place switch ≡ reload).
- [ ] DW-3.3: test: the reload flow of research D6 (serialize → clear → `enterPlayMode` → deserialize; Stop: clear → `enterEditMode` → deserialize) leaves `serializeScene` output byte-identical to the original JSON, and the edit-copy scripts got no callback at all.
- [ ] DW-3.4: test: `Scenario.run()` in edit mode rejects with the message above and creates no scene (scene count and active scene unchanged).
- [ ] DW-3.5: test: the destroy-during-wake edge cases above leave no callback unpaired (every `onEnable` has its `onDisable` once destroyed).
- [ ] DW-3.6: full suite green with no existing test changed.

### Phase 4: The edit-mode frame
**Skills:** code-foundations:cc-defensive-programming
**Model:** sonnet
**Gate:** Full
**Depends on:** Phase 3
**File scope:** src/engine/core/Application.ts (`updateEditMode`), tests/EditModeFrame.test.ts (new)

**Goal:** a host can run one edit-mode frame that updates opted-in scripts and the edit-safe built-in drivers only.

**Scope:**
- IN: `static updateEditMode(deltaTime: number): void` — throws `"[Application] updateEditMode() is
  only valid in edit mode."` in play; clamps `deltaTime` to `[0, EngineSettings.Time.MAX_DELTA_TIME]`
  (non-finite → 0); `Time._update(dt)`; `SceneManager.activeScene._update()` then `_lateUpdate()`;
  then in this order: `EngineObject._updatePendingDestroys(Time.deltaTime)`, `LayoutGroup._updateAll()`,
  `ContentSizeFitter._updateAll()`, `AspectRatioFitter._updateAll()`, `Canvas._updateTransforms()`,
  `LODGroup._updateAll()`, `LineRenderer._updateAll()`. JSDoc: Unity's "on change" model, the list
  of what does **not** run (research D5), no `Application` instance needed.
- OUT: rendering (the editor renders), input, physics, animation, particles, audio, tweens, events.

**Edge cases:** no `Camera.main` (LOD must not throw — check); called with an undecorated script
present (not called); an opted-in script that calls `destroy()` (gone after the frame); called
before any scene exists (lazy default scene, no throw).

**Done when:**
- [ ] DW-4.1: test: edit mode, `@ExecuteAlways` mover + undecorated mover + Animator with a clip + ParticleSystem + Rigidbody with gravity; three `updateEditMode(1/60)` → only the decorated mover moved; animation time, particle count and the rigidbody position unchanged.
- [ ] DW-4.2: test: a `HorizontalLayoutGroup` with two children laid out after one `updateEditMode` exactly as after one play-mode loop frame's layout step.
- [ ] DW-4.3: test: `updateEditMode` in play mode throws; with `NaN`/negative/huge `dt` it does not throw and `Time.deltaTime` is clamped.
- [ ] DW-4.4: full suite green with no existing test changed.

### Phase 5: Adversarial review and backward-compatibility proof
**Skills:** code-foundations:aposd-verifying-correctness, code-foundations:cc-quality-practices
**Model:** sonnet
**Gate:** Full
**Depends on:** Phase 4
**File scope:** tests/EditModeCompat.test.ts (new), tests/EditMode*.test.ts (additions only), any src file of Phases 1–4 (fixes only, each with its regression test)

**Goal:** prove play mode is untouched and try to break edit mode.

**Scope:**
- IN: a reviewer that did not build Phases 1–4 tries, with a scratch test each: re-entrant switches
  from inside callbacks (`enterEditMode()` inside an `awake` of the wake pass; `enterPlayMode()`
  inside an opted-in `update` of an edit frame) — decide and pin: the switch inside the wake pass
  must leave every callback paired and must not recurse; coroutine started in edit mode by an
  opted-in script; `sendMessage` to a sleeping script (runs — Unity; pin it); `@ExecutionOrder` +
  `@ExecuteAlways` together; M0.3d catch-up in an edit frame (only opted-in objects run);
  `isolateCallbackErrors = false` in an edit frame. Backward compatibility: play-mode callback log
  of every lifecycle fixture used by `LoadBeforeWake`, `ReparentActivation`, `UpdateWalkOnce`,
  `UpdateWalkCatchUp` scenes is identical to the base `06aeaf5` (record the base logs by running
  the same script on `git archive 06aeaf5 | tar -x -C <tmp>`, not a nested worktree); the M0.3a
  bench (`code-foundations/M0.3a/probes/zz_m03a_probe_bench.test.ts`, copied in, not committed)
  before/after within noise.
- OUT: new features.

**Done when:**
- [x] DW-5.1: every reviewer finding is either fixed with a regression test or recorded in the notes with why it is not a defect. (9 findings: 4 fixed, 5 recorded — the table in `notes.md`)
- [x] DW-5.2: base-vs-branch play-mode callback logs identical (command and diff output in the notes). (89 lines, SHA256 `ff3e655b…` on both)
- [x] DW-5.3: bench table (before/after, rounds) in the notes; median difference within the noise band M0.3a recorded. (this machine's band is ±25% — the gate-free Phase 1 measured 0.74–0.97 of the base — so no regression is demonstrable here; recorded with the follow-up)
- [x] DW-5.4: `npm run typecheck`, `npm test`, `npm run build` exit 0; `test result` counts in the notes. (177 files / 2922 tests)

### Phase 6: Docs and roadmap
**Skills:** code-foundations:code-clarity-and-docs
**Model:** sonnet
**Gate:** Minimal
**Depends on:** Phase 5
**File scope:** CHANGELOG.md (engine), .claude-shared/ROADMAP.md (C2 row), .claude-shared/tasks/C-milestone-2.md (C2 status line; one "Input from C2" note under C5), .claude-shared/tasks/README.md (C2 row if listed), .claude-shared/code-foundations/C2/notes.md (new)

**Goal:** the change is recorded where C4/C5 and the owner look.

**Done when:**
- [x] DW-6.1: engine CHANGELOG *Added* (`@ExecuteAlways`, `@ExecuteInEditMode`, `Application.enterEditMode/enterPlayMode/updateEditMode`, Cinemachine `@ExecuteAlways`) and *Changed* (static `Application.isPlaying` now Unity's meaning; `Scenario.run` refuses edit mode). No measured number changes (say so).
- [x] DW-6.2: C5 note in `tasks/C-milestone-2.md`: "Play must use the reload flow of `code-foundations/C2/research.md` D6 — `loadScenarioFromBuffer` destroys every loaded scene, and registries span scenes"; C4 note: `OnValidate` not provided (research D9).
- [x] DW-6.3: ROADMAP C2 row → `✅ <date> W<n>` + what landed; `notes.md` with the build notes, DW-1.1 grep, DW-5.2/5.3 evidence.

---
## Test Coverage
**Level:** 100% of new and changed routines
## Test Plan
- [ ] Every DW above has a named test in `tests/EditMode*.test.ts` (or recorded output for DW-1.1, 5.2, 5.3).
- [ ] Dirty tests: destroy/parent-destroy/add-component during the wake pass; mode switch inside callbacks; `updateEditMode` with bad `dt` and in play; `Scenario.run` in edit mode; script woke in play then destroyed in edit.
- [ ] Integration: the reload flow (DW-3.3) end to end through `SceneSerializer`, with a prefab link instance and UI in the scene.
- [ ] Regression: whole suite unchanged after every phase; play-mode logs vs base (DW-5.2).
- [ ] Manual: none (the editor adopts it in C4/C5).

## Assumptions
| Assumption | Confidence | Verify Before Phase | Fallback If Wrong |
|---|---|---|---|
| No reader of static `Application.isPlaying` | high | 1 | keep the change, note the reader's repo in ATTENTION; do not add a second flag without asking |
| Unity's attribute is not inherited | medium | 1 | make `_executesInEditMode` walk base classes (one function + DW-1.4 flipped, record why) |
| All script wake routes go through `_systemAwake`/`_onEnabledChanged` | high | 2 | gate the bypassing route in `GameObject` and add its test |
| Cinemachine `awake`/`onEnable` are safe in edit mode | medium | 3 | leave them undecorated, note it |
| `Time._reset()` resets `timeScale`, `time`, `frameCount` | high | 1 | reset the missing fields in the switch, not in `Time._reset` |

## Decision Log
| Decision | Alternatives Considered | Rationale | Phase |
|---|---|---|---|
| Global mode, default play (D1) | per-scene mode | Unity's `Application.isPlaying` is global; reload model never mixes worlds; one predicate keeps a later refinement local | 1 |
| Static `Application.isPlaying` = Unity meaning (D2) | new flag name, keep "loop running" | card asks for it; zero readers; Unity scripts branch on it | 1 |
| Gate inside `ScriptableBehaviour` entry points | gate in the walk / in `GameObject` | one place covers add, load, activate, reparent and the walk; built-ins untouched by construction | 2 |
| Teardown pairs with what was received | gate teardown by mode | no leaked subscriptions whatever order a host switches in; already the code's rule | 2 |
| `fixedUpdate` never in edit mode | run for opted-in | physics does not step in Unity's edit mode | 2 |
| Wake pass on `enterPlayMode` in load order (D6) | flag-only switch | card test; in-place ≡ reload order | 3 |
| Host-driven edit frame, on change (D5) | engine loop in edit mode | Unity's model; the editor renders itself and owns "when" | 4 |
| `Scenario.run` throws in edit mode | auto-enter play | a hidden mode switch would desync the editor UI | 3 |
| C5 must reload; additive play scene is a separate task | fix the loader in C2 | out of card scope; needs per-scene registries | 6 (note) |

---
## Notes
- Hub files `GameObject.ts`, `Application.ts`, `Scene.ts`: phases strictly serial.
- Full-gate reviews must re-run DW-3.1/3.2 (in-place vs reload logs) and DW-2.4 (built-ins) themselves.
- Follow-ups (not rows unless C5's spike asks): additive scenario load + per-scene registries;
  `onValidate` hook for C4; `Application.isEditor`; edit-mode gating of built-in autoplay state
  (ParticleSystem `playOnAwake`, Animator default state) if C5 sees a difference.
---
## Decided During Build
_Filled by /code-foundations-build — one row per decision an agent made or question it raised:_
| # | Phase | Decision or question | Source | Status |
|---|---|---|---|---|
| 1 | 2 | `GameObject._awakeComponent` / `_runDeferredAwakes` need no change: verified both funnel through `ScriptableBehaviour._systemAwake` / `_onEnabledChanged`, which the gate covers. The plan's fallback (gate the bypassing route) was not needed. | plan scope, Phase 2 | done |
| 2 | 2 | A link-mode save only states version 2 when the scene really holds a prefab link, so DW-2.2's link case binds a guid (`AssetDatabase._bindGuid`) and instantiates a real prefab rather than saving plain objects with `prefabs: "link"`. | DW-2.2 | done |
| 3 | 2 | Editing out of edit mode is *not* asserted by a test: no wake pass exists until Phase 3, so a script added while gated must not be observed waking. Phase 3 owns DW-3.x. | plan OUT line | done |

## Execution Log
| Phase | Result | Notes |
|---|---|---|
| 1 | done (`5f8f86c`) | `_PlayMode.ts` (leaf), static `isPlaying` + idempotent switches, both decorators + `_executesInEditMode`, exports; 7 tests. |
| 2 | done (`340bea9`) | Gate in `ScriptableBehaviour`: cached opt-in, one `_lifecycleAllowed()` predicate, four early returns; `GameObject` untouched (verified). 11 tests in `tests/EditModeLoad.test.ts`. Full suite 173 files / 2894 tests green; `npm run typecheck` and `npm run build` clean. |
| 3 | done (`bbe433a`) | `GameObject`/`Scene._wakeForPlay()` + the pass in `enterPlayMode` (TODO removed); `Scenario.run` guard on the leaf module; both Cinemachine classes `@ExecuteAlways`. 10 tests. Full suite 174 files / 2904 tests green. |
| 4 | done (`01be3eb`) | `Application.updateEditMode`: clamped delta, scene update/lateUpdate, destroy sweep, layout, LOD, LineRenderer; throws in play; lazy scene OK. 5 tests. Full suite 175 files / 2909 tests green. |
| 5 | done (`cbfda31`) | Independent adversarial review: 4 defects fixed (silent half-woken pass, play-mode switch inside an edit frame, raw `dt` to the destroy sweep, re-read `activeScene`), 5 findings recorded with reasons. Bench inconclusive on this machine (±25% band); base-vs-branch play logs identical (SHA256 `ff3e655b…`). 13 tests. Full suite 177 files / 2922 tests green. |
| 6 | done (this commit) | Engine `CHANGELOG.md` Added/Changed/Fixed; ROADMAP row ✅; C5 and C4 notes in `tasks/C-milestone-2.md`; `code-foundations/C2/notes.md`. |
