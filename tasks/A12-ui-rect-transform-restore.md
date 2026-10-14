# A12 — A UI object loads with one RectTransform, the saved one

| | |
|---|---|
| Repo / branch | WebEngineTS · `claude/scenario-platform-architecture-24f9fy` (head `85496dc`) |
| Model | **Sonnet + Opus review** (restore order touches every component) |
| Size | 1 day |
| Depends on | — |
| Blocks | A5 (component ids change what a component list looks like after load; settle the list first) |

## Why

Found by the review of A3 (2026-10-14); present at `31c7793`, so pre-existing. The common way to make
a UI object — `go.addComponent(UIImage)` — gives the component order `[UIImage, RectTransform]`: the
UIImage's `awake` auto-adds the `RectTransform`. On load, the restore adds the UIImage first; its
`awake` auto-adds a **fresh** `RectTransform`; then the saved one is added as a **second**. The UIImage
binds to the first, which has default values, so **the saved layout is lost** (probe: `sizeDelta`
(321, 45) set, saved, reloaded → the bound one is (100, 100), and the object has two RectTransforms).
`Prefab.getChanges` of such an instance then reports a spurious `addedComponents: [RectTransform]`
after the UIImage is removed. Existing tests (`tests/Serialization.test.ts` ~809) add the
RectTransform explicitly first, which is why none caught it. Every Canvas UI scene the editor saves is
affected.

## Read first

- `tasks/probes/cards-a3-a6/zz_review_rt.test.ts` and `zz_review_a3c.test.ts` — the reproductions.
- `src/engine/core/serialization/SceneSerializer.ts` — where a GameObject's components are restored
  (search `_deserializeGO` / the component loop), and how `awake` is triggered relative to that loop.
- `src/engine/core/ui/UIBehaviour.ts` (or wherever the auto-add lives: `grep -rn "addComponent(RectTransform)" src/engine/core/ui`).
- `src/engine/core/GameObject.ts` — `addComponent` and when it calls `_systemAwake`.
- Unity's behaviour for reference: `[RequireComponent]` adds the required component when the
  component is added in the editor, but loading a scene restores the serialized component list as it
  is, and `Awake` runs after all components of the object exist.

## Do

Choose one approach with evidence (write the choice and why into the commit message):

1. **Restore all of an object's components before any `awake` runs** (Unity's order). The restore
   creates every component, assigns fields, and only then lets the lifecycle start. Most robust; check
   it does not change the order of `awake`/`onEnable` that existing lifecycle tests pin
   (`tests/GameObjectLifecycle.test.ts`, `tests/*Lifecycle*`), and that `MissingComponent` still works.
2. **A restored RectTransform takes over one auto-added earlier in the same restore**: when the
   restore is about to add a `RectTransform` and the object already has one that was auto-added during
   this restore and not yet assigned from the file, assign the saved fields to that one instead of
   adding a second. Narrower; leaves other required-component pairs with the same latent issue —
   list any others (`grep -rn "requireComponent\|addComponent(" src/engine/core/ui src/engine/core/rendering`).

Prefer 1 unless it breaks lifecycle order that consumers rely on; if it does, do 2 and record 1 as
the follow-up.

## Tests (`tests/UIRestore.test.ts`, new)

For both component orders (`[UIImage, RectTransform]` from auto-add and `[RectTransform, UIImage]`
added explicitly), through `SceneSerializer.deserializeScene`, `Prefab.instantiate` and
`EngineObject.Instantiate`: exactly one RectTransform after load; its fields are the saved ones;
`uiImage.rectTransform` is it; `Prefab.getChanges` of an untouched instance is empty and stays empty
after removing and reverting the UIImage. Plus: a scene saved at `31c7793` with the doubled list (two
RectTransforms written) loads with one, the saved values winning (write the fixture by hand).

## Acceptance

`npm run typecheck`, `npm test`, `npm run build` green; both probes pass; CHANGELOG *Fixed* entry
("a UI object reloaded with two RectTransforms and lost its saved layout"); lifecycle test counts
unchanged.

## Commits

`fix(serialization): a UI object keeps one RectTransform, the saved one, through a load`.

## Review focus (Opus reviewer)

Lifecycle order after the change (awake/onEnable/start of every component of a restored object);
`MissingComponent` between restored components; a prefab instance's component indices before and
after (A5 will pin component ids to them).
