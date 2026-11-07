# M0.2c — children of an object destroyed during its own load

Engine branch `M0.2c-dead-parent-children`, commit `4a1e922`
(`fix(serialization): stop building the children of an object destroyed during its own load`).
Source: `code-foundations/M0.2/review.md`, "Destroying the object from an earlier awake".

## Reproduction

`tests/DestroyedDuringLoad.test.ts` was written first, against the unchanged engine. 7 of its 8 first
cases failed. The deferred-`destroy()` case passed, which confirms that behaviour was already right.
On a scene load with `Holder [Singleton, Log] > Child [Log] > Grandchild [Log]`, where
`Singleton.awake` calls `this.gameObject.destroyImmediate()`, the log was:

    Holder.dies, Child.awake, Child.onEnable, Grandchild.awake, Grandchild.onEnable

`Child` stayed alive with its parent dead. `EngineObject.FindObjectsOfType(GameObject, true)` still
found it, and it was parented under the destroyed Transform. `Prefab.instantiate`,
`EngineObject.Instantiate` and a prefab instance saved as a link (`_deserializeLink`) all showed
the same result, because all of them go through `SceneSerializer._buildContents`.

## Semantics

| Case | Behaviour now | Evidence |
|---|---|---|
| The object is destroyed immediately while its components wake (singleton) | None of its children are built: they get no `awake`, `onEnable` or `onDestroy` | Unity deserializes the whole hierarchy before the first `Awake`. `DestroyImmediate(gameObject)` therefore removes the children before any of them wakes, and `OnDestroy` only reaches scripts that woke. This engine builds children *after* the parent's components wake, so "never built" gives the same observable result. Engine rule: `GameObject.onDestroy` destroys every child; A12 already skips the later components of a dead object (`_wakeComponent` checks `exists()`). |
| A child is destroyed during its own load | It is not attached to the parent. Siblings after it still load. A saved reference to it reads `null`, and references to later siblings still resolve to those siblings | Before the fix, a destroyed Transform was pushed into the parent's child list. Paths count children in saved order (the writer emits every child in order, so a path index equals the `json.children` index). |
| A descendant's `awake` destroys an ancestor | What was built goes with the ancestor: the part not yet attached is destroyed, so `onDestroy` reaches the scripts that woke. Nothing more is built under it | Unity: the hierarchy already exists, so the ancestor's destruction cascades to it. |
| `destroy()` (deferred) in `awake` | Unchanged. The object stays alive for the rest of the load and its children load as usual. The whole tree goes at the end of the frame (a microtask) | Unity docs, `Object.Destroy`: "Actual object destruction is always delayed until after the current Update loop". `EngineObject.Destroy` queues a microtask. |

## What changed (`SceneSerializer.ts`)

- `_buildContents` returns before the children loop when `go` no longer exists. Before building each
  child it checks every object whose children are being built (`LoadCtx.building`). A child is built
  as a root and attached only afterwards, so a destroyed ancestor cannot reach it through the
  hierarchy.
- New `_attachLoaded(child, parent)`. If the parent is dead, it destroys the child. If the child is
  dead, it leaves it unattached. Otherwise it calls `setParent(parent, false)` as before.
  `_restoreChild` uses the same helper.
- `LoadCtx.loadedChildren`: for each object built by this load, the children in saved order, dead
  ones included. `_resolveObjectRefs` → `_lookupScoped` → `_lookupByPath` → `_step` (and
  `_warnIfIntoPlaceholder`) count a numeric segment against it, and a dead child reads `null`.
  `_resolveSaved` (live instances, no load) still counts live children.
- `CHANGELOG.md` has a *Fixed* entry.

## Tests

`tests/DestroyedDuringLoad.test.ts`, 9 cases:

- the singleton on a scene load, `Prefab.instantiate`, `EngineObject.Instantiate` and a link
  instance;
- other roots still load, and a reference into the dead tree reads as gone;
- a self-destroyed child is not attached and its siblings load;
- saved references keep the dead child's slot;
- an ancestor destroyed by a grandchild;
- deferred `destroy()` is unchanged.

Checks on the branch: `npm run typecheck` 0, `npm test` 152 files passed / 1 skipped, 2667 tests
passed / 9 skipped, `npm run build` 0.

## Found on the way (not fixed: out of scope)

**Children wake as roots, before they are parented.** `_buildContents` builds each child with
`_deserializeGO`, which wakes it as a scene root, and only then attaches it. A probe with
`P (inactive) > C [script]` logged `C.awake parent=none`, `C.onEnable`, and no `onDisable` after the
attach. In Unity, a child of an inactive parent does not `Awake` during load, and a child's `Awake`
sees its parent. Fixing it means attaching before building the contents. That changes
`activeInHierarchy` during the wake, and so the lifecycle order of every nested load. It should be
its own card (Opus); it is next to M0.2a ("fields before wake").
