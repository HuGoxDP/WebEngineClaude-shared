# M0.2e: re-parenting re-evaluates active state

Engine branch `M0.2e-reparent-activation`, commit `f9acc91`
`fix(core): re-evaluate activity when an object changes parent`.

Source: the follow-up probe in `code-foundations/M0.2a/notes.md`.

## Target: Unity

Changing a parent can change `activeInHierarchy` without any `SetActive`. Unity handles it as an
activation change of the moved subtree: moved under an inactive parent, every enabled behaviour
gets `OnDisable`; moved out from under one, every script that never woke gets `Awake`, then every
enabled behaviour `OnEnable`. The engine already does exactly this for `setActive` on an ancestor
(`GameObject._onParentActiveStateChanged`), so the fix reuses that path.

## Reproduction (before the fix)

`WebEngineTS/tests/ReparentActivation.test.ts`, written against the unchanged engine: 26 of 29
cases failed. The three that passed pin moves that must stay silent: between active parents and
sibling reorder, between inactive parents, and an object inactive on its own.

| Case | Before | Now |
|---|---|---|
| active `C [script]` moved under inactive `P` | `activeInHierarchy` false, nothing fired | `C.onDisable` |
| `C > D > E`, `C > F`, `C` moved under inactive `P` | nothing | `onDisable` C, D, E, F (parents first, pre-order) |
| under an active `Mid` whose `Top` is inactive | nothing | `onDisable` |
| `D [script]` added under inactive `P` (never woke), moved under active `Q` | nothing | `D.awake`, `D.onEnable` |
| never-woken subtree moved out | nothing | per object `awake` then `onEnable`, parents first |
| two scripts on one object | — | both `awake` before either `onEnable` (as `setActive`) |
| disabled script moved out | nothing | `awake` only |
| child inactive on its own | — | stays asleep; wakes on its own `setActive(true)` |
| `detachChildren` of an inactive parent | nothing | each child wakes/enables (last child first: the method walks backwards) |
| graphic moved under an inactive panel | stays registered in the Canvas | unregistered; re-registered when moved back |
| graphic built under an inactive panel, moved into a canvas | never registered | registered |
| Canvas GO moved under an inactive object | still in `Canvas._sortedInstances()` | removed; back on the way out |

Callbacks run **after** the move is complete: `onDisable`, `awake` and `onEnable` see the new
parent and `activeInHierarchy` already updated, the world pose restored, and the hierarchy
version bumped (UI caches keyed on it are already invalid). Re-entrant moves are safe because
`Behaviour._onEnabledChanged` only fires on a real transition of `isActiveAndEnabled`: an
`onDisable` that moves its object back out ends with `onDisable`, `onEnable` and the script
enabled; an `awake` that moves a sibling under an inactive object leaves that sibling disabled.

## The fix

`Transform.setParent` (the `parent` setter and `detachChildren` go through it):

- reads `go.activeInHierarchy` before detaching;
- at the very end, if `activeInHierarchy` changed and the object exists, calls
  `go._onParentActiveStateChanged()` — deferred awakes for the object, then
  `_onEnabledChanged` on every Behaviour, recursing into live children.

`setSiblingIndex` / `setAsFirstSibling` / `setAsLastSibling` cannot change activity and are
untouched. `GameObject.ts` is not edited (M0.2b and M0.3c touch it in parallel).

Loads are unaffected: the build pass creates each child under its parent before it has
components, so a flip there notifies nothing, and a flip to *active* cannot happen in the build
pass (a fresh object starts active; parents are built before children). Full suite unchanged.

## Update walk decision (with M0.3a/M0.3d)

Question: an object activated mid-pass by a move — does it run this pass?

Evidence in the engine, measured with the new tests before deciding:

- `setActive(true)` mid-pass on an object under a root the walk has already left: `onEnable` at
  once, `start`/`update` **next pass** (no catch-up exists for `setActive`).
- The same object activated by a move under that root (first version of the fix): the M0.3d
  catch-up picked it up and ran `start`/`update` **this pass** — the two routes disagreed.
- M0.3d's justification for the catch-up is Unity's "a behaviour that existed when the pass
  began runs in it once". An object inactive at the start of the pass is not in that set.

Decision: **an object activated by a move behaves as one activated by `setActive(true)` at the
same point.** `setParent` only reports the move to the walk (`_noteMoved`) when the object was
active before the move. So: `awake`/`onEnable` immediately; `start`/`update` this pass if the walk
still reaches the new place (hierarchy walk, same as `setActive`), otherwise next pass. Objects
that were active and moved keep the M0.3d catch-up unchanged (its 39 tests pass). Pinned by the
four "activated by a move during an update pass" tests, including one that runs both routes and
compares their logs over two passes.

Unity cross-check, stated honestly: Unity's native behaviour manager is understood to add a
behaviour enabled mid-pass to a pending list merged when the next pass starts, i.e. "next pass"
regardless of hierarchy position. That was not verified against a Unity runtime here. If it is
confirmed, the remaining gap (an object activated *ahead* of the walk still runs this pass, by
`setActive` and by a move alike) is one rule for both routes — see follow-ups.

`start` still runs on the first update after enable (unchanged `_started` flag).

## Debug pass

- Full checks after the build: `npm run typecheck` exit 0, `npm test` 159 files / 2805 tests
  passed, `npm run build` exit 0. No failures, so no regression tests were needed beyond the
  task's own.
- Adversarial probes (scratch test, deleted, not committed):
  - `onEnable` that destroys its own object during a reparent activation: object and child
    destroyed, the child's script never woke, no error.
  - `Prefab.revert` of a top-level instance sitting under an inactive holder: log
    `Src.onDestroy, Src.awake, Src.onEnable, Src.onDisable`. The fresh instance is built and
    woken as a scene root, then moved under the holder. Before this fix it ended woken and
    *enabled* under an inactive parent; now it ends disabled (balanced), but Unity would not have
    woken it at all. Pre-existing, in `Prefab.revert` (`fresh.transform.setParent(parent,false)`
    after `instantiate(scene)`) — follow-up, not changed here.

## Follow-ups

- **Prefab.revert under an inactive parent** wakes the fresh top-level instance as a root before
  placing it (above). Fix: build it under the holder before the wake pass, as M0.2a does for loads.
- **Mid-pass activation timing**: if a Unity probe confirms "enabled mid-pass → next pass"
  regardless of position, apply it to `setActive` and moves together (e.g. a creation-style
  stamp on activation, as `_createdAfterWalk` does for new objects).
- Unity logs "Cannot change GameObject hierarchy while activating or deactivating the parent"
  for a reparent from inside `OnEnable`/`OnDisable` of that activation; the engine allows it
  (and stays consistent). Not mirrored.
