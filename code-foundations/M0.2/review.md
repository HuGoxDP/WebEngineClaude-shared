# M0.2: Opus review of A12 ("A UI object loads with one RectTransform, the saved one")

- **Reviewed:** `05811fb` (split `addComponent` into `_attachComponent` and `_wakeComponent`) and
  `6e84c2a` (a load attaches every component before the first one wakes; `_allowMultiple` fold;
  `Collider._reattach` guard). The engine was at `03b640f`.
- **Branch:** `M0.2-a12-review` (WebEngineTS and .claude-shared).
- **Date:** 2026-11-07.
- **Verdict:** A12 does what the card asks, and the lifecycle sequence is unchanged. One real
  defect was in scope: a prefab *file* with the doubled rect was never folded. It is fixed in
  `a60e548` with pinning tests. Two behaviours are acceptable but are now documented. One question
  goes to the owner. Three follow-ups are opened.

## How the evidence was produced

The probes were scratch tests, deleted before commit. Three engine trees were used:

- **old:** `git archive 05811fb^`, unpacked under `%TEMP%`.
- **A12:** `git archive 6e84c2a`, unpacked under `%TEMP%`.
- **review branch:** the worktree.

The old engine generated "files as the old engine wrote them": a scene reloaded once and twice, a
reloaded scene whose bound rect the user then edited, a prefab made from a reloaded object,
instance links of a clean prefab and of a doubled prefab. The A12 engine then read those files.

## Review focus 1: lifecycle order (awake / onEnable / start of every component of a restored object)

**Verdict: unchanged. Verified.**

- **Pairwise events.** For every ordered pair of the 53 constructible registered component types
  (2809 pairs), `Behaviour._internalInitialize` and `_onEnabledChanged` transitions were logged
  during `deserializeScene`. The old and A12 sequences are identical for 2809 of 2809 pairs.
- **Pairwise state.** The same pairs were round-tripped as built, saved, loaded and saved again.
  There were no throws in either tree.
  - 951 pairs differ between the trees.
  - 940 of them are the doubling A12 fixes: the old engine loaded e.g.
    `[Button, RectTransform, RectTransform, RectTransform]`, A12 loads `[Button, RectTransform]`
    and the round trip is identical.
  - The other 11 pairs are objects that *code* gave two RectTransforms
    (`addComponent(UIImage); addComponent(RectTransform)`). A12 folds them on load. See
    follow-up M0.2b.
- **`start`** still waits for the first update. This is pinned by `RestoreOrder.test.ts`
  ("start still waits for the first update").
- **Unwoken components are safe to touch.** For all 54 registered types except `AudioSource`
  (which has no `AudioContext` in Node), a component attached but not woken was tested:
  - every public getter that works on a woken instance also works on it, with no throws;
  - `destroyImmediate` on the component, and on its GameObject, throws nothing.

  This matters because an earlier awake can now reach such a component and destroy it.
- **What a script can now see.** This is the second point named in the README row. It is
  acceptable, and is now documented in the CHANGELOG. Saved list `[A, B]`, where A's `awake` does
  `b = getComponent(B); b.n = 42; b.enabled = false`:

  | | A.awake sees B | B.n after load (saved 7) | B.enabled |
  |---|---|---|---|
  | old engine | `null` | 7 | true |
  | A12 | B, not woken (`ready=false`) | **7**: A's 42 is replaced when B takes its fields (B's own `awake` saw 42) | false |
  | `[B, A]`, both engines | B, woken | 42 | false |

  A write into a *later* sibling's saved field is lost; a write into an earlier one stays. Unity
  keeps the write in both orders, because it writes the fields before any `Awake`. Before A12
  that code found `null`, so this is not a regression. It is a trap, though, and the CHANGELOG
  entry did not mention it; `a60e548` adds the sentence. The real fix is "fields before wake",
  which the A12 commit already names as deferred. That is follow-up M0.2a.
- **Destroying the object from an earlier awake.** This is a probe of the singleton pattern
  (`destroyImmediate` or `Destroy` on the object). A12 is *better* than the old engine:
  - old: the later components were still added and woken on the dead object (`B.awake`,
    `B.onEnable`);
  - A12: they are skipped (`_wakeComponent` checks `exists()`).

  In **both** engines the object's children are still built, woken and enabled under the
  destroyed parent (`SceneSerializer.ts` `_buildContents`, the children loop). This is
  pre-existing and is follow-up M0.2c.
- **Physics.** `Collider._reattach` now skips a collider with no shape yet. Both orders of
  `[BoxCollider, Rigidbody]` end with one shape on the body; this is pinned by `RestoreOrder.test.ts`.
  `Joint._rebuild` with `[Joint, Rigidbody]` now finds the unwoken Rigidbody's `_body`; it no longer
  warns "needs a Rigidbody". This is an improvement and was not probed further.

## Review focus 2: `MissingComponent` between restored components

**Verdict: correct.**

- `_attachComponent` attaches the placeholder in place, and `_applyFields` skips it. It keeps its
  position and data, and is written back in place. This is pinned by `RestoreOrder.test.ts`
  ("a placeholder between restored components").
- Probe on a prefab instance:
  - file `[UIImage, Ghost, RectTransform, UIText]` gives instance
    `[UIImage, MissingComponent, RectTransform, UIText]`; the graphic is bound to the saved rect,
    and the link round trip is stable;
  - file `[UIImage, RT, Ghost, RT]` folds to `[UIImage, RT, MissingComponent]`, with the
    placeholder after the kept rect.
- An unknown type never takes part in the fold. `TypeRegistry.get` returns `null`, so
  `_isSingleCopy` is false.

## Review focus 3: a prefab instance's component indices, before and after (input for A5)

**Verdict: after A12 an instance's list equals its prefab's list, both by absolute position and by
the per-type index that `componentIndex` and `ComponentRef.index` use.** Before A12 it did not.

| Prefab `[UIImage, RT, UIText]` | instance list | RT the graphic used | `getChanges` |
|---|---|---|---|
| old engine | `[UIImage, RT(default), RT(saved), UIText]` | RT#0, the default | overrides on RT#0 with the default values, plus `addedComponents: [{index: 2, RectTransform(saved)}]` |
| A12 | `[UIImage, RT, UIText]` | RT#0, the saved one | `{ overrides: [] }` |

Old link files load correctly under A12. The old instance link carries `RT#0` overrides with
defaults plus an added `RectTransform` at absolute index 2. `PrefabDiff.applyChanges` puts both
into the tree, `_attachAll` folds them, and the added copy wins: layout 321x45, no changes. Saving
again writes a clean link, so one load and one save migrate the file.

**Defect found and fixed (in A12's scope): a prefab file made from a doubled object.**

- **Before the fix:** such a file held `[UIImage, RT, RT, UIText]`. A12 folded the instance, but
  not the prefab's tree, so:
  - every instance, even an untouched one, reported `overrides` on RT#0 and
    `removedComponents: [RectTransform #1]`;
  - `revertOverride` of that removal put the second rect back on the live object;
  - `revert()` left the overrides in place.

  Only `applyInstance` cleaned the prefab.
- **Fix (`a60e548`):** `Prefab.fromJSON` calls the new `SceneSerializer._foldSingleCopies(tree)`.
  The first copy keeps its position, and every copy's fields are merged into it in file order, the
  later values winning, as a load does. The fold skips nested-instance link nodes, whose own
  prefab is folded when it is read. `_attachAll` and the new fold share `_isSingleCopy` and
  `_warnFolded`. The warning now fires once per object and type, not once per extra copy; the A12
  test name "says so, once for the object" already promised that.
- **Pinned in `tests/UIRestore.test.ts`, describe "a prefab saved while a load added a second
  RectTransform":**
  - reads as one rect with the later values;
  - an untouched instance has no changes;
  - remove the graphic and revert it: still one rect, no changes;
  - one warning naming the object;
  - no warning for a clean prefab.

  Also in that file: "says so once for the object however many copies it folds". Four of these
  fail without the fix and pass with it. The fifth, the clean prefab, guards against warning when
  there is nothing to fold.
- **After the fix,** with the old engine's files: a fresh instance and the old instance link of the
  doubled prefab both load with 321x45 and `{ overrides: [] }`. The old link's overrides addressed
  to `RectTransform #1` find no target and are kept as `unused`, with the existing "N change(s)
  address objects its prefab no longer has" warning. That is harmless; `removeUnusedOverrides`
  drops them.

**For A5** (not fixed here: it touches A5's design):

1. `componentIndex` is per type, so the fold changes the address of nothing except
   `RectTransform #k` for k ≥ 1. `addedComponents[].index` is an absolute position. Old links put
   an added `RectTransform` at absolute index 2 or 3. A5's id migration should treat "an added
   `RectTransform` on a node whose prefab already has one", and any change addressed to
   `RectTransform #k≥1`, as belonging to RT#0. Otherwise it mints ids for components the load
   folds away.
2. A `ComponentRef` with `component: "RectTransform", index ≥ 1` resolves to `null` after the
   fold (`_findComponent`). In every old-engine file generated here, refs pointed at index 0,
   because they are assigned through `getComponent`. This is theoretical, but A5's ref migration
   can map such a ref to 0 for free.
3. Mint ids after the fold. Otherwise a folded copy's id becomes a dangling address.

## Acceptance of the card, re-checked

- `tests/UIRestore.test.ts` covers:
  - both orders, through `deserializeScene`, `Prefab.instantiate` and `EngineObject.Instantiate`;
  - one rect, with the saved fields;
  - the graphic bound to that rect;
  - empty `getChanges`, before and after remove-and-revert;
  - a hand-written doubled scene loading with one rect, later values winning.

  All pass (34 tests with the additions).
- **The card's probes** (`tasks/probes/cards-a3-a6/zz_review_rt.test.ts`, `zz_review_a3c.test.ts`)
  were run against the engine. `zz_review_rt` shows `auto=UIImage,RectTransform`, sizeDelta
  321x45, bound to the first rect. Its last line, `deserializeGameObject(auto) =>` with an empty
  list, is a probe artifact: it serializes an already-destroyed object. A live object gives
  `UIImage,RectTransform`, 321x45, bound. `zz_review_a3c` reports `removedComponents` for the
  removed component only.
- **CHANGELOG** has the *Fixed* entry ("A UI object reloaded with two RectTransforms and lost its
  saved layout"), extended in `a60e548`.
- **Lifecycle test counts:** `tests/GameObjectLifecycle.test.ts` has 17 tests at `05811fb^`,
  `6e84c2a` and `HEAD`. A12 changed no existing test file and only added `RestoreOrder.test.ts`
  and `UIRestore.test.ts`.
- **Checks on the review branch:**
  - `npm run typecheck`: exit 0;
  - `npm test`: 150 files passed, 1 skipped; 2631 tests passed, 9 skipped;
  - `npm run build`: exit 0.
- **Commit trailers:** both A12 commits carry `Co-Authored-By`/`Claude-Session` trailers. They are
  already on `origin/master` and cannot be rewritten without a force-push, so they are recorded
  here only.

## Question for the owner: which copy of a doubled rect wins

A12 lets the **later** copy win. In a file written by the old engine that copy is the author's
original layout. The earlier copy is the default the graphic bound to, and it is the copy the user
saw and could edit. Evidence from the old engine:

- **No edit after the reload:** `[UIImage, RT(100x100), RT(321x45)]`. Later-wins gives the right
  answer.
- **The user fixed the visibly broken layout after the reload:** the bound rect was edited to
  500x60, so the file holds `[UIImage, RT(500x60), RT(321x45)]`.
  - A12 loads **321x45**, and the 500x60 edit is lost.
  - The same holds for an instance link: the overrides on RT#0 say 500x60 and the added RT says
    321x45, and A12 loads 321x45.
  - In the old engine that edit was also invisible after the next reload, because a fresh default
    rect was bound again.

The alternative is "the first copy wins unless it still holds the defaults". It would keep such
edits, but it is a heuristic. Keeping later-wins is defensible; the owner should decide whether
any real saved project has post-reload edits worth recovering.

## Follow-ups

| ID | What | Size |
|---|---|---|
| M0.2a | **Fields before wake** (Unity's order): write every component's saved fields before the first sibling wakes. A write from an earlier `awake` into a later sibling then stays, and `awake` sees saved values, not defaults. Needs an audit of every built-in setter that writes to an object `onAwake` creates (`DirectionalLight.shadowDistance` came back as 200 for a saved 75). Opus. | 1–2 d |
| M0.2b | **Enforce one-per-object at add time** (Unity's `[DisallowMultipleComponent]`). `_allowMultiple = false` is read only by a load. `addComponent(RectTransform)` on an object that has one (code, or the editor's Add Component) silently makes a second, and the next load folds it away: 11 pairs in the pairwise probe. This changes `addComponent`'s contract (return the existing component, or null plus a warning), so the owner decides; best done before A5 mints ids. | ½ d |
| M0.2c | **Children of an object destroyed during its own load are still built.** An earlier `awake` that destroys the object (the singleton pattern) leaves `_buildContents` building, waking and enabling the children under a dead parent. This is pre-existing in the old engine too. | ½ d |
