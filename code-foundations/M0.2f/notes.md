# M0.2f: `Prefab.revert` under an inactive holder no longer wakes as a root

Worker **W3**, 2026-11-10. Engine branch `M0.2f-prefab-revert-inactive-holder`.
Source: the follow-up named at the end of `code-foundations/M0.2e/notes.md` ("Prefab.revert under an inactive
parent wakes the fresh top-level instance as a root before placing it. Fix: build it under the holder before
the wake pass, as M0.2a does for loads."). ROADMAP row **M0.2f** (M1).

## Defect

`Prefab.revert` of a **top-level instance sitting under a plain holder** took the non-nested branch of `revert`
(`Prefab.ts`, the `around === null` path). It destroyed the old instance, then `this.instantiate(scene)` — which
builds and wakes the fresh instance **as a scene root** — and only afterwards `fresh.transform.setParent(parent,
false)`. Two observable wrongs, both pre-existing (since the A3/D5 design), now that M0.2e makes the move fire:

- **Under an inactive holder**: the fresh instance woke as a root (`awake` seeing the *scene root*, `onEnable`)
  and was then disabled (`onDisable`). It woke and immediately un-woke. **Unity never wakes a script that ends up
  under an inactive parent at all.**
- **Under an active holder**: the fresh instance's `awake` saw the *scene root* rather than its real parent —
  the same wake-as-root-then-move shape every load and nested instance stopped doing in M0.2a/M0.2d.

Nested instances (`around !== null`, built with `SceneSerializer._restoreChild(… under holder, index)`) were
already correct — the load contract places them under the parent before the wake pass. Only the top-level branch
was wrong.

## Reproduction (before the fix)

Scratch probe `tests/zz_probe_m02f.test.ts` (a `@Serializable ScriptableBehaviour` `Src` logging
`awake`/`onEnable`/`onDisable`/`onDestroy`; a prefab whose root carries it; an instance placed under a holder, then
`prefab.revert`). On unchanged `master`:

| Case | log after `revert` | `activeInHierarchy` | fresh root's `awake` parent |
|---|---|---|---|
| holder **inactive** | `Src.onDestroy, Src.awake@root, Src.onEnable, Src.onDisable` | false | root |
| holder **active** | `Src.onDisable, Src.onDestroy, Src.awake@root, Src.onEnable` | true | root |

## Fix

Build the fresh instance **under the holder before the wake pass**, exactly as M0.2a does for a load and
`_restoreChild` does for a nested instance, so its wake pass judges it by the parent's active state:

- `SceneSerializer._deserializeTree` gained optional `parent` / `index` parameters; the root is created with
  `_deserializeGO(json, ctx, parent)` (created under the parent — "never a scene root, not even for a moment") and
  only then do refs resolve and `_awakeLoaded` wake it.
- New `SceneSerializer._instantiatePrefabUnderParent(json, parent, index, scene, guid)` wraps it as the public seam.
- `Prefab._instantiateUnder(parent, index, scene)` stamps and calls it; `revert`'s top-level branch now uses it when
  the instance has a parent (`parent !== null`) and keeps `instantiate()` when it is a true scene root
  (`parent === null`, e.g. the "revert replaces the instance at once" case).

No change to `GameObject`, `Transform`, the wake pass or the activation path — the instance simply starts dormant
when its holder is inactive, and the existing "waits for activation" behaviour takes over.

## Reproduction after the fix (same probe)

| Case | log after `revert` | `activeInHierarchy` | fresh root's `awake` parent |
|---|---|---|---|
| holder **inactive** | `Src.onDestroy` | false | (not woken) |
| holder **active** | `Src.onDisable, Src.onDestroy, Src.awake@Holder, Src.onEnable` | true | **Holder** |

The inactive-holder fresh instance is only **deferred, not lost**: `holder.setActive(true)` then wakes it under the
holder (`Src.awake@Holder, Src.onEnable`), and deactivating fires `Src.onDisable`.

## Tests

`tests/PrefabRevertUnderHolder.test.ts` (new, kept): 4 tests pinning the inactive-holder never-wakes case (root and
a whole subtree, plus wake-on-activation), the active-holder awake-sees-parent order, and sibling-index/override
preservation under an inactive holder. These fail on unchanged `master` (the log above is the red) and pass here.

## Behaviour change recorded

Engine `CHANGELOG.md` under *Fixed*. **Changes observable lifecycle order** for a top-level `Prefab.revert` under a
parent: the fresh instance's `awake` now sees its parent, and under an inactive holder it does not wake until
activation. Aligns revert with loads and nested instances (M0.2a/M0.2e); no existing test depended on the old shape.

## Checks

`npm run typecheck` exit 0 · `npm test` · `npm run build` exit 0 (see the run log; final numbers in the Report).

## Follow-ups considered, not changed

- `Prefab.revert` of an instance whose *holder* is a **nested** holder already goes through `_restoreChild` and is
  unaffected — a probe confirmed the inactive case there stays dormant too.
- The mid-pass Unity activation timing left by M0.2e is unchanged (out of scope here).

## Final run (W3, 2026-11-10, resumed after the previous fire's worktree was taken over)

The previous fire's implementation was verified as-is against the row and the M0.2e follow-up (it is the
fix described above; the probe was renamed to the kept test) and finished here:

- Committed as `20e6603` on engine branch `M0.2f-prefab-revert-inactive-holder`: the fix
  (`Prefab.ts`, `SceneSerializer.ts`), the engine `CHANGELOG.md` entry and
  `tests/PrefabRevertUnderHolder.test.ts` in one commit, per repo convention.
- Full checks on the task branch (after merging origin/master, which carried W2's merged M0.3b):
  `npm run typecheck` exit 0 · `npm test` **163 files / 2833 tests, all passed** (161/2826 on
  origin/master before the task: +1 file/+4 tests M0.2f, +2 files/+3 tests M0.3b) ·
  `npm run build` exit 0. No failures, so no extra regression tests beyond the task's own.
- Deviations: none against the row; the notes, the CHANGELOG entry and the entry above were already
  written by the previous fire and kept verbatim (only this section and the final numbers added).
