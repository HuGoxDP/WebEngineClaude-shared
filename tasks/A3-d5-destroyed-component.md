# A3 — D5: a destroyed component leaves its object's component list

| | |
|---|---|
| Repo / branch | WebEngineTS · `claude/scenario-platform-architecture-24f9fy` |
| Model | **Sonnet + Opus review** (lifecycle code; small diff, wide reach) |
| Size | ½–1 day |
| Depends on | — (can run before or after A1; touches different files) |
| Blocks | A5 |

## Why

`component.destroy()` / `destroyImmediate()` leaves the component in `GameObject._components`. The
serializer then writes the dead component into the file plus any `ComponentRef` to it, and both come
back **alive** on load. Present at `bde23fc` too (pre-existing), found by the E11 verifier. It is the
component twin of D1 (a destroyed child stayed in its parent's child list), fixed in `02a183f`. For
prefabs it means a component deleted with `destroyImmediate` is never reported in
`removedComponents` and reappears on the next save or undo.

Probe (from the verifier): two `UIImage` on one object, `Button.targetGraphic` = the second;
`second.destroyImmediate()` → `exists()` false, but `getComponents(UIImage).length` is still 2, the
saved components are `[UIImage, RectTransform, UIImage, Button]`, `targetGraphic` is
`{"$type":"ComponentRef","path":[0],"component":"UIImage","index":1}`, and the reload has 2 UIImages.
`removeComponent` behaves correctly.

## Read first

- `git show 02a183f` — how D1 was fixed (the pattern to follow) and its test.
- `src/engine/core/GameObject.ts` — `_components` (~82), `addComponent` (~460),
  `removeComponent` (~500–512), `getComponents` (~562), the loops at ~387/412/435/525/544.
- `src/engine/core/EngineObject.ts` — `destroy` (~222), `destroyImmediate` (~235),
  `_destroyImmediate` (~270), the deferred queue (~330–410).
- `src/engine/core/Component.ts` — its destroy/`onDestroy` path and how it reaches its GameObject.
- `src/engine/core/serialization/ValueSerializer.ts` — `componentIndex` (D4 returns -1 when the
  component is not on its object).

## Do

1. When a component is destroyed (immediately, or when the deferred destroy runs), remove it from
   its GameObject's `_components` — through the same internal path `removeComponent` uses, after its
   `OnDisable`/`OnDestroy` have run, exactly once. Destroying the GameObject itself destroys its
   components; make sure that path does not try to splice each one out of a list it is iterating
   (iterate a copy, or skip the splice when the owner is being destroyed — follow what D1 did for
   children).
2. A deferred `destroy()` keeps Unity semantics: the component is still in the list until the end of
   the frame/microtask in which it is destroyed, then gone. `exists()` stays as it is today.
3. `Transform` cannot be destroyed (it is not in `_components`); leave that untouched.
4. Then `componentIndex` returning -1 for a destroyed component becomes true. If A2 has already
   narrowed its JSDoc to "removed with removeComponent", widen it back to "removed or destroyed".

## Tests (`tests/Component*.test.ts` or a new `tests/ComponentDestroy.test.ts`)

- `destroyImmediate` on one of two same-type components: `getComponents` has one; the saved scene has
  one; a `ComponentRef` that pointed at the destroyed one is saved as `null`; reload has one.
- `destroy()` then await the deferred destroy: same results. Before it runs: still listed.
- Destroying the GameObject with three components destroys all three once (`onDestroy` called once
  each), and no error from mutating the list during iteration.
- Prefab: an instance whose component was destroyed reports it in `getChanges().removedComponents`,
  and `revertOverride` brings it back.
- Run the whole suite: lifecycle tests (`tests/*Lifecycle*`, `tests/GameObject*`) must stay green.

## Acceptance

`npm run typecheck`, `npm test`, `npm run build` green. CHANGELOG `[Unreleased]` *Fixed*: "D5 — a
destroyed component left its object's component list only when removed with `removeComponent`; a
saved scene kept it and brought it back to life." Plan §4.6: add D5 next to D1–D4.

## Commits

`fix(core): a destroyed component leaves its object's component list` (code + tests + CHANGELOG),
`docs(serialization): record D5` if the plan edit is separate.

## Report back

What path removes it now, the tests, and whether any existing test had to change (it should not;
if one did, say why it encoded the defect).

## Review focus (Opus reviewer)

Order of `OnDisable`/`OnDestroy` vs removal; re-entrancy (a component that destroys a sibling in its
own `onDestroy`); `Behaviour.enabled` bookkeeping in any per-frame registries (LODGroup, Animation,
ParticleSystem, UI drivers) that hold the component.
