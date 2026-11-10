# C2 — Engine E2: edit mode (`@ExecuteInEditMode`): research (Claude, 2026-11-10)

**Status:** confirmed by Claude (architect lane); the plan beside it (`plan.md`) is `ready`.
**Base:** WebEngineTS `master` `06aeaf5` (after M0.2a–g, M0.3a–f). Card: `tasks/C-milestone-2.md` § C2.
Consumers of this work: C4 (scripts in the editor, script reload with C3), C5 (Play inside the editor).

## What C2 must achieve

In the editor, user scripts must not run just because they were added, loaded or activated.
Unity runs scripts only in Play mode, except classes marked `[ExecuteInEditMode]` /
`[ExecuteAlways]`. Built-in components that are edit-mode by nature (rendering, transforms, UI
layout, LOD) keep working. Every host that never asks for edit mode — the platform player,
ScenarioCreator, the benchmarks, every existing test — must behave exactly as today.

## Facts checked against the code (`06aeaf5`)

| Fact | Where |
|---|---|
| `addComponent` = `_attachComponent` + `_wakeComponent` (= `_initializeComponent` + `_awakeComponent`) | `GameObject.ts:501`, `:590`, `:609`, `:624` |
| `_initializeComponent` runs a built-in's `onAwake` (Three.js objects) whether or not the object is active; scripts have nothing there | `GameObject.ts:609` |
| `_awakeComponent` runs a script's `_systemAwake` and any Behaviour's `_onEnabledChanged`, only when active in hierarchy | `GameObject.ts:624` |
| Deferred awakes for objects activated later (`setActive`, parent activation, M0.2e reparent) | `GameObject._runDeferredAwakes` `:462`; `Transform.setParent` → `_onParentActiveStateChanged` |
| `ScriptableBehaviour._onEnabledChanged` wakes a never-woken script before its first `onEnable` (every enabling route ends here) | `ScriptableBehaviour.ts:201–216` |
| `_systemAwake` idempotent (`_awakeCalled`) | `ScriptableBehaviour.ts:333` |
| Teardown already pairs with what was received: `onDisable` only if `_wasActiveAndEnabled`; `onDestroy` skipped for a script that never woke | `Behaviour._destroyImmediate` `Behaviour.ts:170`; `ScriptableBehaviour._invokeOnDestroy` `:360` |
| Per-frame script entry points: `_systemUpdate/_systemLateUpdate/_systemFixedUpdate`, `start` on first update via `_started` | `ScriptableBehaviour.ts:375/401/422`, `_runUpdate` |
| The hierarchy walk visits only `ScriptableBehaviour`s; built-ins are driven by static registries from `Application._loop` | `GameObject.ts:1081/1108/1135`; `Application.ts:715–890` |
| Load = build pass, then `_awakeLoaded` (`_awakeComponent` per recorded object, pre-order, list order) | `SceneSerializer.ts:2324` (M0.2a) |
| Built-ins that extend `ScriptableBehaviour`: `CinemachineBrain`, `CinemachineVirtualCamera` (both `@Serializable`); everything else is `Behaviour`/`Component` | `cinemachine/*.ts` |
| `ScenarioBehaviour` is not a component; `Scenario.run` calls `_systemInit` (→ `awake`) and the loop drives it | `scenario/Scenario.ts:519`, `ScenarioBehaviour.ts:303` |
| `Application.isPlaying` (static) exists today and means "an Application's loop is running" (`_instance?.isPlaying ?? false`); the instance field `app.isPlaying` is the loop flag | `Application.ts:169`, `:227`, `run()` `:353` |
| Nobody reads the static `Application.isPlaying`: no engine source, no test, no ScenarioCreator scenario, no virtual-lab or editor code (grep, 2026-11-10). Tests write the *instance* field (`DestroyBeforeRender`, `LoopFrameIntegrity`) | grep |
| During a platform scenario's `awake`, the static reads `false` today (`scenario.run()` precedes `_autoStartAfterLoad()` → `run()`) — a Unity mismatch nobody observes | `Application.ts:411–431` |
| `Time._reset()` exists and has no caller (gap G5) | `Time.ts:280` |
| Decorators are legacy (`experimentalDecorators: true`); `@ExecutionOrder` stores per-constructor in a `Map`, `getExecutionOrder` walks base classes | `reflection/Decorators.ts:105–135`, `tsconfig.json:16` |
| The editor never runs the engine loop in edit mode; it renders `SceneManager.activeScene._internalThreeScene` itself, deletes with `destroyImmediate`, and Play today is a hand-copied loop + JSON snapshot restored on Stop | `WebEngineTSEditor/app/src/app/services/{scene,play-mode}.service.ts`, `viewport.service.ts` |
| **`Scenario.run` → `SceneManager.createScene` → `loadScene(Single)` destroys every loaded scene** | `Scenario.ts:545`, `SceneManager.ts:153–205`, `:295` |
| Global registries (`Animator`, `Animation`, `ParticleSystem`, `AudioSource`, `Canvas`, `LODGroup`, `LayoutGroup`, `Physics`, …) span every loaded scene; the walk covers only `SceneManager.activeScene` | `Application._loop` |

### Consequence for C5 (recorded here, not fixed by C2)

The editor plan §3.1 says Play hands an in-memory ZIP to `loadScenarioFromBuffer` "in its own page;
the loader creates a *new* scene, so the edit scene is not touched". **Not true on `06aeaf5`:**
the loader's Single load destroys the edit scene, and even an additive play scene would share the
global registries with it (the edit scene's Animator, particles and canvases would run during
Play). C5's spike must therefore use the **reload** model (below): serialize the edit scene,
enter play, load; on Stop unload, enter edit, deserialize the snapshot. That is also what makes
"the edit-mode scene is byte-identical after Stop" true by construction. Keeping the edit scene
alive beside a play scene needs per-scene registries and an additive scenario load — a separate
engine task the C5 spike may ask for, not part of C2.

## Unity behaviour (web research, 2026-11-10)

- `[ExecuteAlways]`: "instances of a script always execute, both as part of Play Mode and when
  editing"; recommended over `[ExecuteInEditMode]`, which does not run in Prefab Mode during Play
  Mode. Scripts branch with `Application.isPlaying` (global) or `EditorApplication.IsPlaying(this)`
  (is this object part of the playing world). <https://docs.unity3d.com/ScriptReference/ExecuteAlways.html>
- In edit mode the callbacks are not called constantly: "Update is only called when something in
  the Scene changed" (2022.1 wording); newer docs: on every redraw of the Scene or Game view.
  Continuous updates need `EditorApplication.QueuePlayerLoopUpdate()`.
  <https://docs.unity3d.com/2022.1/Documentation/ScriptReference/ExecuteAlways.html>,
  <https://discussions.unity.com/t/how-to-make-sure-that-function-repeats-every-frame-in-edit-mode-scene-tab/890952>
- Edit-mode callbacks for opted-in scripts: `Awake`, `OnEnable`, `Start`, `Update`/`LateUpdate`
  (on change), `OnDisable`, `OnDestroy`. Physics does not step in edit mode, so `FixedUpdate` and
  collision messages do not run. Scripts without the attribute get nothing in edit mode.
- Entering Play reloads the scenes (domain reload optional); exiting Play destroys the play world
  (`OnDisable`/`OnDestroy` while still playing) and reloads the edit scene. Play-time changes and
  `Time.timeScale` changes are lost on Stop.
- `OnValidate` is editor-only, called for every MonoBehaviour on load and after an inspector edit,
  attribute or not.
- Inheritance of the attribute by subclasses: not settled by the sources found (forum memory says
  it must be repeated on each derived class). Treated as an assumption below.
- Built-ins in the Unity editor: renderers, lights, cameras, transforms, UI layout and LOD are live;
  Animator, ParticleSystem (outside preview), AudioSource and physics do not play. Cinemachine's
  `CinemachineBrain` and virtual cameras are `[ExecuteAlways]`.

## Decisions

**D1 — the mode is global, default play.** A leaf module `src/engine/core/_PlayMode.ts` (same
pattern as `_UpdateWalk.ts`, no imports) holds one boolean `_editMode = false`. Global because
Unity's `Application.isPlaying` is global and the reload model (D6) never has an edit and a play
world loaded together. Every gate reads it through one function, so a later per-scene refinement
(preview scenes, `EditorApplication.IsPlaying(obj)`) changes one place. Default `false` → nothing
changes for any host that never switches.

**D2 — public API on `Application` (static).**
- `Application.isPlaying` (static getter) takes **Unity's meaning**: `false` while the host holds
  the engine in edit mode, `true` otherwise — including before any `Application` exists and during
  a scenario's `awake`. Evidence that this is safe: zero readers anywhere (facts table). The
  **instance** field `app.isPlaying` keeps meaning "this loop is running" (tests and the loop write
  it); its JSDoc says so and points to the static. Recorded under CHANGELOG *Changed*.
- `Application.enterEditMode(): void` and `Application.enterPlayMode(): void` — host calls (the
  editor's Play/Stop), static so a host need not construct an `Application` for edit mode.
  Idempotent: calling the current mode is a no-op.
- `Application.updateEditMode(deltaTime: number): void` — one edit-mode frame (D5). Throws if not
  in edit mode (calling it in play would double-tick the loop).
- Not added now: `Application.isEditor` (no consumer needs it; additive later), an
  `EditorApplication` namespace (the engine has no editor half).

**D3 — opt-in decorators.** `@ExecuteAlways()` and `@ExecuteInEditMode()` in
`reflection/Decorators.ts`, both class decorators (legacy, like `@ExecutionOrder`), both set the
same per-constructor flag; `ExecuteInEditMode`'s JSDoc notes Unity's prefab-mode difference does
not apply here and recommends `ExecuteAlways`. `_executesInEditMode(ctor)` checks **the class
itself only** (not inherited — see Assumptions). A `ScriptableBehaviour` reads it once in its
constructor into a private field (`new.target`), so the per-callback check is two field reads with
no allocation and no map lookup. Applied to a non-`ScriptableBehaviour` class it is harmless (built-ins
are never gated).

**D4 — what runs in edit mode.**

| Component kind | Edit mode | Play mode |
|---|---|---|
| Built-in `Behaviour`/`Component` (Camera, lights, renderers, MeshFilter, LineRenderer, LOD, Canvas + UI graphics + layout, colliders, joints, Rigidbody, Animator, Animation, ParticleSystem, Audio, EventSystem controls, PostProcessVolume) | **unchanged**: `onAwake` at construction, `onEnable`/`onDisable` on transitions (they register themselves in their registries) | unchanged |
| `ScriptableBehaviour` without the decorator | **no** `awake`, `onEnable`, `start`, `update`, `lateUpdate`, `fixedUpdate`, coroutine ticks; `onDisable`/`onDestroy` only if it had received `onEnable`/`awake` earlier (pairing rule, already in the code) | unchanged |
| `ScriptableBehaviour` with `@ExecuteAlways`/`@ExecuteInEditMode` | `awake`, `onEnable`, `start`, `update`, `lateUpdate`, `onDisable`, `onDestroy`; **never `fixedUpdate`** (physics does not step in edit mode) | unchanged |
| `CinemachineBrain`, `CinemachineVirtualCamera` | marked `@ExecuteAlways` (Unity parity) | unchanged (the decorator is inert in play) |
| `ScenarioBehaviour` (entry point) | `Scenario.run()` **throws** in edit mode with a message naming `Application.enterPlayMode()` | unchanged |
| `MissingComponent` | inert as today | inert |

Play-only *simulation* of built-ins (physics step, animation/particle/audio playback, input,
tweens) is not gated by the lifecycle: it lives in loop drivers, and the edit frame (D5) does not
call them. What a built-in does inside `onEnable` today (ParticleSystem `playOnAwake` sets its
state; Animator enters its default state) is unchanged — no simulation advances without its
driver, and the editor already lives with it. Gating those is a later, separate task if C5's
spike finds a visible difference.

**Gate rule (one sentence for the code):** a `ScriptableBehaviour` may *start* a lifecycle step in
edit mode only if its class opted in; a step that ends something it started (`onDisable` after
`onEnable`, `onDestroy` after `awake`) always runs. A script that woke in play and is still alive
in edit mode keeps its normal enable/disable transitions but gets no per-frame calls unless
opted in. `sendMessage`/`broadcastMessage` are direct calls and stay ungated (Unity calls them in
edit mode too).

**D5 — update in edit mode is driven by the host, on change.** The engine does not run a loop in
edit mode. `Application.updateEditMode(dt)` runs one edit frame: `Time._update(dt)`; for the active
scene `_update()` then `_lateUpdate()` (the walk calls only opted-in scripts — the gate lives in the
script entry points, so the M0.3a stamp and M0.3d catch-up are untouched); then the edit-safe
drivers in loop order: `EngineObject._updatePendingDestroys`, `LayoutGroup`, `ContentSizeFitter`,
`AspectRatioFitter`, `Canvas._updateTransforms`, `LODGroup`, `LineRenderer`. Not called:
fixed update, `Physics._step`, `Animator`/`Animation`/`ParticleSystem`, audio, `UITween`,
`EventSystem`/`Selectable`/`ScrollRect`, `TextureStreaming`, render, `Canvas._renderAll`, input
reset. The editor calls it after a change (inspector edit, gizmo drag, hierarchy change, script
reload) — Unity's "on change"; continuous ticking is the editor's choice. No `Application`
instance is needed.

**D6 — transitions.**
- `enterPlayMode()`: flips the flag, `Time._reset()` (play starts at time 0, `timeScale` 1, as in
  Unity), then runs a **wake pass** over every loaded scene's roots: per object in pre-order, the
  same steps a load's `_awakeLoaded` runs (`_awakeComponent` for each component in list order: all
  pending `awake` and `onEnable` for that object), skipping inactive subtrees (they wake on
  activation as today). `start` follows on the first update (`_started`). So "switch in place" and
  "reload" give the same callback order. Scripts that already woke (opted-in ones) are not woken
  twice (`_systemAwake` is idempotent; `_onEnabledChanged` fires only on transitions).
- `enterEditMode()`: flips the flag and `Time._reset()`. Touches no object. The host tears the play
  world down **before** calling it (Unity's order); if it does not, the pairing rule still balances
  every callback when those objects are destroyed later.
- **Recommended host flow (C5), the reload model:** Play = `serializeScene` → clear the scene →
  `enterPlayMode()` → deserialize (or `loadScenarioFromBuffer`). Stop = unload/clear →
  `enterEditMode()` → deserialize the snapshot. Clearing *before* `enterPlayMode()` matters: the
  wake pass would otherwise wake the edit copies. The in-place switch exists for the card's test
  and simple hosts; with it an opted-in script keeps its edit-mode state instead of a fresh `awake`.

**D7 — interaction with M0.2a / M0.2e / M0.3.** The two-pass load is unchanged: the build pass runs
no user code in either mode; the wake pass calls `_awakeComponent`, which is where the edit-mode
gate applies, so a load in edit mode builds and attaches everything and wakes only opted-in
scripts. Reparent activation (M0.2e) and `setActive` route through `_runDeferredAwakes` /
`_onEnabledChanged`, both gated. Destroy timing (M0.3b/c) unchanged; teardown already pairs.
The update walk (M0.3a/d) is unchanged; the gate is inside the script's entry points.

**D8 — backward compatibility.** With the flag at its default, every gate is one boolean read
that is `false`; no callback, order or allocation changes. Checked by: the whole suite unchanged,
a callback-log comparison of play-mode loads against the base, the M0.3a walk bench within noise,
and a grep that no consumer reads the static `Application.isPlaying`. The platform and
ScenarioCreator never call the new API.

**D9 — `OnValidate` is out of C2.** It is an inspector hook (C4's), not a mode question; noted as a
follow-up for C4.

## Owner questions

None. The only public semantic change (static `Application.isPlaying`) has no reader anywhere and
moves the engine to Unity's meaning; it is recorded in the CHANGELOG.

## Assumptions

| Assumption | Fallback if wrong |
|---|---|
| Unity does not inherit `[ExecuteAlways]` to subclasses | flip `_executesInEditMode` to walk base classes like `getExecutionOrder` — one function, one test |
| No consumer reads the static `Application.isPlaying` | re-grep before Phase 1; if one does, keep the name and document the change in its repo |
| CinemachineBrain/VirtualCamera `awake` has no side effect that is wrong in edit mode | drop the decorator from them and note it (they then stay asleep until Play) |

## Risks

- Lifecycle semantics, not typing: the gate touches the hub `GameObject.ts` and every script entry
  point. Full gates with adversarial review; DW items are callback logs, not "code exists".
- Silent change in play mode would hit students. Phase 5 compares callback logs of play-mode loads
  against the base and re-runs the walk bench.
- `Time._reset()` on the switch also resets `frameCount`/`time` for in-place hosts — intended (Unity).
