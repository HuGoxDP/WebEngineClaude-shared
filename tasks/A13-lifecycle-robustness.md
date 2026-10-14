# A13 — Destroy is robust: a throwing onDestroy, self-destroy, children destroyed mid-update

| | |
|---|---|
| Repo / branch | WebEngineTS · `claude/scenario-platform-architecture-24f9fy` |
| Model | **Sonnet + Opus review** |
| Size | 1 day |
| Depends on | — (A3 landed) |
| Blocks | — (should land before `v0.2.0`; C5 Play relies on it) |

## Why

Three pre-existing hazards found while doing and reviewing A3 (2026-10-14). All are in the destroy
path, all are reachable from ordinary scenario scripts, and Play inside the editor (stage 13) will
hit them first.

1. **A component whose `onDestroy` throws becomes a zombie.** `EngineObject._destroyImmediate` marks
   the object destroyed and unregisters it only after `onDestroy` returns. Since A3 the component
   leaves its object's list in a `finally`, so after its GameObject is destroyed it is still
   `exists() === true`, found by `FindObjectsOfType`, and nothing will ever destroy it (probe P2 in
   `tasks/probes/cards-a3-a6/zz_review_a3.test.ts`). **Decision (made here):** a throwing `onDestroy`
   still ends destroyed, as in Unity — Unity logs the exception and destroys the object anyway.
2. **`destroyImmediate` on oneself from inside one's own `onDestroy`** (or two components destroying
   each other there) recurses without bound, because `exists()` is still true during `onDestroy`
   (A3's report: 50 nested calls with a cap of 50, before and after A3).
3. **A child destroyed during its parent's update loop throws.** `GameObject._systemUpdate` /
   `_systemFixedUpdate` / `_systemLateUpdate` capture `childCount` and call `getChild(i)`; a child
   whose `update` calls `destroyImmediate` on a later sibling makes the loop throw `RangeError
   'Transform.getChild: index 2 out of range [0, 2)'`. Present since D1 (`02a183f`).

## Read first

`src/engine/core/EngineObject.ts` (`destroy`, `destroyImmediate`, `_destroyImmediate`, the registry
and `_persistentObjects`), `src/engine/core/Component.ts` and `Behaviour.ts` (`_destroyImmediate`
overrides, A3's `finally`), `src/engine/core/GameObject.ts` (`_system*` loops, `_detachComponent`,
`onDestroy`), `src/engine/core/Transform.ts` (`_children`, how D1 removes a child),
`tests/ComponentDestroy.test.ts` and `tests/GameObjectLifecycle.test.ts`.

## Do

1. `EngineObject._destroyImmediate`: set the destroyed flag **before** calling `onDestroy` is wrong
   (Unity's `OnDestroy` can still read the object), so: mark "being destroyed" first (a private flag
   that makes a second `destroyImmediate`/`destroy` a no-op), run `onDestroy` in a `try`, and in the
   `finally` set `_isDestroyed`, unregister from the registry and `_persistentObjects`; rethrow the
   error after cleanup (callers that want to swallow it — `removeComponent` — already catch).
   This fixes 1 and 2 together.
2. Transform child loops: iterate a snapshot of the children (`[...this.transform._internalChildren]`,
   or copy-on-write on `Transform._children` as A3 did for components), skip entries that no longer
   exist. Keep zero allocation per frame where the engine's rule demands it: copy-on-write (copy only
   on removal) satisfies both.
3. Update the D5 CHANGELOG paragraph if its wording about a throwing `onDestroy` changes meaning, and
   add *Fixed* entries for 1–3.

## Tests

- A component whose `onDestroy` throws: `destroyImmediate` rethrows; afterwards `exists()` false, not
  found by `FindObjectsOfType`, not in its object's list; destroying its GameObject does not throw and
  leaves nothing alive.
- `destroyImmediate(this)` inside `onDestroy`: `onDestroy` runs once. Two components destroying each
  other in `onDestroy`: each runs once.
- A child destroying a later sibling (and an earlier one, and itself) from `update`: no throw; the
  destroyed sibling does not update afterwards; the others update once each that frame.
- `onDestroy` can still read `this.gameObject` and its own fields (pin current behaviour).

## Acceptance

`npm run typecheck`, `npm test`, `npm run build` green; the A3 probes in
`tasks/probes/cards-a3-a6/` that this card targets pass; lifecycle tests unchanged in count.

## Commits

`fix(core): a throwing onDestroy still destroys`, `fix(core): a child destroyed during its parent's
update loop does not break the loop`.
