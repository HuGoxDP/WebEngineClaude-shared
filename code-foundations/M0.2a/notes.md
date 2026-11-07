# M0.2a + M0.2d: a load builds the whole tree before any script wakes

Engine branch `M0.2a-restore-order`, commits:

- `6bd9f4c` `refactor(core): split a component's wake into initialise and awake halves`
- `17c408a` `fix(serialization): build the whole loaded tree before any script wakes`

Sources: `code-foundations/M0.2/review.md` (A12 review, "What a script can now see": a write
from A's `awake` into B's saved field is lost in `[A, B]` and kept in `[B, A]`) and
`code-foundations/M0.2c/notes.md` ("Children wake as roots, before they are parented").

## Target: Unity's load contract

Unity deserializes the whole object, and the whole hierarchy, first: objects, components, field
values, references, parent links. Only then do `Awake` and `OnEnable` run (per script, `Awake`
then `OnEnable`). A script on an object that is inactive, or under an inactive ancestor, gets no
`Awake` until the object is activated. `OnDestroy` reaches only scripts that woke.

## Reproduction (before the fix)

`tests/LoadBeforeWake.test.ts` was written first, against the unchanged engine. All 29 cases
failed. Each case runs through four paths: scene load, `Prefab.instantiate`,
`EngineObject.Instantiate` and a prefab instance saved as a link. One more case covers a
component restored by a prefab revert (`_restoreComponent`). What the old engine did:

| Case | Old engine | Now (Unity) |
|---|---|---|
| `awake` reads its own saved `n = 5` | `n=1`, the default: fields came after `awake` and `onEnable` | `n=5` |
| `[Writer, Target]`: Writer's `awake` sets `target.n = 42` | `7`: the saved value overwrote the write | `42`; Target's own `awake` sees 42 |
| `[Target, Writer]`, same write | `42`, but Target's `awake` saw `n=1` | `42`; Target's `awake` sees its saved 7 |
| Saved GameObject/component references in `awake` | `null` (resolved at the end of the load) | resolved |
| `Holder > Child`: Child's `awake` | `parent=none` (woke as a scene root); Holder's `awake` saw `children=0` | `parent=Holder`; Holder sees `children=1` |
| `Holder (inactive) > Child [script]` | `Child.awake` and `onEnable` during the load, and no `onDisable` after it was parented | nothing until `Holder.setActive(true)`, then `awake`, `onEnable` |
| `[LightReader, DirectionalLight{shadowDistance: 75}]` | the script saw the default | the script sees 75; the light keeps 75 |

## The fix

**`GameObject`.** `_wakeComponent` is split into two halves. `addComponent` is unchanged.

- `_initializeComponent`: a built-in Behaviour's `onAwake`, which creates its Three.js objects.
  It runs whether or not the object is active, as before.
- `_awakeComponent`: a script's `awake` and every Behaviour's `onEnable`, each only when the object
  is active in the hierarchy.

**`SceneSerializer`.** A load now runs in two passes.

1. **Build** (`_deserializeGO` → `_buildContents`). Each object is created directly under its parent
   (`_createUnder`, `setParent(parent, false)`), so it is never a scene root. Then:
   - all of its components are attached (A12's `_attachAll`, with the fold);
   - in list order, each built-in runs `onAwake` and then takes its fields, and each script takes
     its fields;
   - its children are built the same way.

   Each object is recorded in `LoadCtx.toAwake` in pre-order. Then the GameObject and component
   references are resolved (`_resolveObjectRefs`).
2. **Wake** (`_awakeLoaded`): `_awakeComponent` for every recorded object, parents before children
   and each object's components in list order. A dead object is skipped.

Pending asset references are published (`_publishPending`) after the wake. A load nested in an
`awake` (an `Instantiate`) therefore does not replace the outer load's list, which was already the
case before. The same two passes run for `deserializeScene`, `deserializeGameObject` / `Instantiate`,
`_instantiatePrefab`, prefab links (`_deserializeLink`, `_placeholder`) and the prefab-revert
helpers (`_restore`, `_restoreChild`, `_restoreComponent`).

`LoadCtx.building` and `_attachLoaded` (from M0.2c) are removed. No user code runs in the build
pass, so nothing can be destroyed there. Destruction can only happen in the wake pass. Children are
attached by then, so an object destroyed there takes its children with it, and they never wake.

### The one deliberate difference from Unity

A built-in's internal `onAwake` still runs **before** its own fields are written. That is where the
built-in creates its Three.js objects, and some setters write into them. No script runs between the
two steps, so no script can observe the difference. It is construction, not lifecycle.

## Setter audit (built-ins whose setters write into what `onAwake` creates)

The probe was a scratch test, not committed. Every registered non-script component type was tested,
51 types in all (AudioSource is excluded: no `AudioContext` in Node; MissingComponent is excluded
too). For each type:

- a default instance was serialized;
- every numeric, boolean and numeric-object field was perturbed;
- the type was loaded twice: once with `onAwake` before its fields (as landed) and once with the
  fields before `onAwake` (the naive Unity order);
- both results were re-serialized and compared.

| Result | Types |
|---|---|
| **Loses saved values if fields come first** | `DirectionalLight`: `shadowDistance` (saved 401.25, read back 200), `shadowFrustumSize` (saved 41.25, read back 20). Both setters write into `_internalThreeLight.shadow.camera` and return early while it is `null` |
| Keep every value either way | AmbientLight, Animation, Animator, AspectRatioFitter, AudioListener, BoxCollider, Button, Camera, Canvas, CanvasGroup, CanvasScaler, CapsuleCollider, CinemachineFlyBody, CinemachineFollowBody, CinemachineHardLookAtAim, CinemachineOrbitalAim, CinemachineOrbitalBody, CinemachinePOVAim, ContentSizeFitter, Dropdown, FixedJoint, GridLayoutGroup, HingeJoint, HorizontalLayoutGroup, InputField, InstancedMeshRenderer, LODGroup, LayoutElement, LineRenderer, MeshFilter, MeshRenderer, ParticleSystem, PointLight, PostProcessVolume, RectMask2D, RectTransform, Rigidbody, ScrollRect, Scrollbar, Slider, SphereCollider, SpotLight, SpringJoint, SpriteRenderer, Toggle, ToggleGroup, UIImage, UIText, VerticalLayoutGroup, VirtualJoystick |

A static scan of every `public set x(...)` in `src/engine` turned up the same two setters and no
others. The scan looked for setters that return early when a backing object is missing (`=== null)
return`, `if (!this._x) return`, `this._x?.y = `).

Limits of the probe:

- It compares serialized getters, so it would miss a setter that stores the value but fails to
  push it into a Three.js object.
- Asset and reference fields were not perturbed.

Because the landed design keeps `onAwake` before fields for every built-in, neither limit matters
for this change. They would matter if a later task moved built-ins to "fields first".

## Changed test expectations (each one pinned the old order)

- `RestoreOrder.test.ts`:
  - "each component wakes, enables and takes its fields in list order" is now "every component
    takes its fields, then each wakes and enables in list order". The new sequence is `A.v=9`, then
    `A.awake n=5`, `A.onEnable`, `B.awake n=7`, `B.onEnable`.
  - "an awake can find a sibling listed after it" now finds the awake line by prefix, because
    `log[0]` is now the setter.
- `DestroyedDuringLoad.test.ts`:
  - **A saved reference to a child that destroys itself in its own `awake`** now holds the
    destroyed object (`exists()` is false) instead of `null`. References resolve before any `awake`,
    as in Unity, where such a field is a destroyed object that compares equal to null.
  - **An ancestor destroyed by a descendant's `awake`.** Grandchild's `Log` no longer wakes after
    its ancestor dies, so the log loses `Grandchild.awake`, `Grandchild.onEnable` and
    `Grandchild.onDestroy`. Before, Grandchild was still a scene root at that point; now it is
    attached and dies with the ancestor. `Late` and `Later` are now built and then destroyed
    without waking, where before they were never built. Neither is observable.
  - The four "builds none of its children" tests are renamed "wakes none of its children". Their
    assertions are unchanged.
- `Serialization.test.ts`, "no scope stack": it called the private `_resolveRefs`, which is now
  `_resolveObjectRefs` plus `_publishPending`. The test calls `_resolveObjectRefs`; its behaviour
  is identical.

`GameObjectLifecycle`, `UIRestore`, and every other lifecycle test pass unchanged.

## Checks (engine worktree)

- `npm run typecheck`: exit 0.
- `npm test`: 155 files passed and 1 skipped; 2727 tests passed and 9 skipped.
- `npm run build`: exit 0.

## Follow-ups

- **M0.2e (new row): re-parenting does not re-evaluate active state.** Probe on this branch, at run
  time with no load involved:
  - `C [script]` moved under an inactive `P`: `activeInHierarchy` becomes false, but `onDisable`
    does not fire;
  - `D [script]`, added under an inactive `P` (so not woken) and then moved under an active `Q`:
    `activeInHierarchy` becomes true, but `awake` and `onEnable` do not fire.

  Unity fires `OnDisable`, and `Awake`/`OnEnable`, on such a move. `Transform.setParent` does not
  call `_onParentActiveStateChanged`. Loads no longer depend on this, because they parent before
  waking. It is a runtime lifecycle bug of its own.
