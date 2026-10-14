# A1 — Fix the three regressions the E11 fixes introduced, and settle N4–N6 and `path` churn

| | |
|---|---|
| Repo / branch | WebEngineTS · `claude/scenario-platform-architecture-24f9fy` (head `e6a8500`) |
| Model | **Opus** (prefab semantics; N3 needs a small format decision) |
| Size | 1.5–2 days |
| Depends on | — |
| Blocks | A2, A4, A5, A9 |

## Why

The E11 review (20 findings) is fixed except for what the fixes themselves broke. An independent
verifier at `e6a8500` found three **regressions** — each passes at `2dd3207` and fails now — and
three older weaknesses. All six must be settled before `v0.2.0`, because after the release the
link format is frozen and every change to it needs a second readers-first cycle.

## Read first

- `design/prefab-instances-plan.md` — §2.4–2.6 (link mode, paths, placeholders), §6.1 (ids,
  inline assets), §7 (changes: overrides, added/removed children and components), §11 Open.
- `src/engine/core/serialization/Prefab.ts` — `revert` (~378), `applyInstance` (~476),
  `_withChanges` (~521), `_leavesInstance` (~535), `revertOverride` (~593), `_reconnect` (~859).
- `src/engine/core/serialization/SceneSerializer.ts` — `_tableGuidOf` (~772) and its alias map
  (~790), the asset table writer (~700), `_reconnect` (~1613), `_dangling` (~1656).
- `src/engine/core/serialization/PrefabOverride.ts` — `PrefabOverride` type (~22, `path`),
  `applyChanges` added children/components (~500–520), the reordered-children detection (~621),
  where `removedChildren`/`addedChildren` are produced (~1195–1225).
- `tasks/probes/e11/vzw/v_new_findings.test.ts` — N1…N6, one `describe` each. **This is the
  acceptance list.** Also `v_apply_scope`, `v_reconnect`, `v_inline_mat`, `v_cross`,
  `v_fallback2`, `v_dbg4` in the same folder (same cases, more angles).

To run the probes: `cp -r <shared>/tasks/probes/e11/vzw tests/vzw && npx vitest run tests/vzw`.
Delete `tests/vzw` before every commit.

## Do

### N1 — `applyInstance` on a nested instance leaks references out of it (regression, 0f3bde1)
`_withChanges` filters `changes.overrides` with `_leavesInstance`, but applies
`changes.addedChildren[*].node` and `changes.addedComponents[*].component` unfiltered. A
`GameObjectRef`/`ComponentRef` with `scope > 0` inside an added child or component is written into
the nested prefab's own file, and every instance of that prefab then aims outside itself.

- Apply the same rule inside added subtrees: null every reference with `scope > 0` in
  `addedChildren[*].node` (recursively, including a nested link's `prefab.changes`) and in
  `addedComponents[*].component.fields`. One helper, used for overrides and both added kinds.
- JSDoc of `applyInstance` and CHANGELOG ("no reference out of the instance") then hold; reread
  both.
- Tests: an added child and an added component, each holding a reference to the outer instance's
  Hull; after `turret.applyInstance(nested)`: the Turret file contains no `"scope"`, a new Tank's
  Turrets have `target === null` on the added part, and an untouched top-level Turret instance
  reports no changes.

### N2 — reverting a removal overwrites an explicit `null` (regression, 4a192c7)
`SceneSerializer._reconnect` / `Prefab._reconnect` re-point every "dangling" field at the rebuilt
object, and `_dangling` counts `null` as dangling. A field the scene deliberately set to `null` is
silently re-pointed by reverting an unrelated removal.

- Reconnect only fields whose value is a **destroyed** object (`exists() === false`), never `null`.
  The removal itself is what leaves a destroyed object in a field; a `null` cannot be told from an
  explicit override.
- That loses one case the F7 fix covered: a field that became `null` through a save/load after the
  removal. Accept that, and say so in `revertOverride`'s JSDoc and the CHANGELOG ("a reference to a
  removed object that was saved and reloaded in between stays null").
- Tests: the three cases in `v_reconnect.test.ts` (GameObject ref, component ref, after a link round
  trip) plus F7's original case still passing (field holding the destroyed object is reconnected).

### N3 — an expand-saved scene detaches instances from their prefab's inline material (regression, 4417fd2)
Since #13 a prefab's inline asset is written into an expand-mode scene under a scene-local id
(`_tableGuidOf`). Only an in-session alias maps it back. Reopened in a new session, every instance
gets its own copy; `getChanges` reports a phantom `MeshRenderer.sharedMaterial` override; a link
save records it, and the instance stops following the prefab's material. Every scene the editor
writes today is expand mode, so this would hit real projects.

Decision (made here): **record what the copy is a copy of.**
- When the scene's asset table holds a copy of a prefab's inline asset, write `of: { prefab:
  "<prefab guid>", id: "<that asset's id in the prefab's table>" }` on the table entry.
- On load: if that prefab is loaded (`AssetDatabase`) and its inline asset with that id serializes
  deep-equal to the scene's entry, bind the field to the **prefab's live asset object** and do not
  create the copy; otherwise use the scene's copy, as now. Equality is on the serialized form, so a
  prefab edited since keeps the scene's own (now different) copy, which is the honest result.
- `of` is additive and optional: version-1 readers ignore unknown keys in a table entry — confirm
  this in `SceneSerializer`'s table reader and in the `0.1.0-local.1789023160893` bundle
  (`tar -xOzf <consumer>/WebEngineTS-0.1.0.tgz package/dist/WebEngineTS.esm.js`), and state it in
  the plan §6.1. If it is **not** ignored there, stop and report: the field would need a version-2
  marker instead.
- Tests: the `v_inline_mat` case — new session, prefab loaded first, then the scene: `getChanges` is
  `{ overrides: [] }`, a link save carries no assets, and after the prefab's material turns red the
  instance is red. Plus: prefab not loaded → the scene's copy is used and nothing warns; prefab
  loaded but its material changed → the scene's copy is used.

### N4 — overrides that point into a reverted subtree are lost (pre-existing)
`Prefab.revert` destroys and rebuilds the instance. A field elsewhere — in the same outer instance
or anywhere in the scene — that pointed into the rebuilt subtree is left holding a destroyed object
and is saved as `null`. Unity keeps them because its revert keeps identity.

- Before destroying, walk the components of the instance's scene (all roots) and collect every
  field, array slot included, whose value is a GameObject/Component inside the subtree being
  rebuilt. Record the target as its node-id path relative to the instance root (components by
  type + occurrence until A5 lands; A5 switches it to component ids).
- After the rebuild, resolve each record against the new subtree and assign it; if it no longer
  resolves (the prefab does not have that node), leave `null` and warn once naming holder and field.
- Same mechanism for `revertOverride` of a removed child/component: it replaces the "reconnect"
  heuristic for references from **outside** the instance (N2 keeps the inside case honest).
- Tests: N4 in `v_new_findings` and the first test of `v_cross.test.ts`; a scene object (outside any
  instance) pointing at a Barrel inside a reverted Turret keeps pointing at the rebuilt Barrel.

### N5 — a reordered nested instance is reported as two independent changes (introduced by 67cdad3)
`getChanges` reports a reordered nested instance as `removedChildren: [id]` plus an `addedChildren`
copy under the same id. Reverting one half alone gives two live Turrets with one node id, or deletes
the instance outright.

- In `revertOverride`: when the target is a `removedChildren` id X and `addedChildren` holds an
  entry whose `node.id === X` (or the reverse), treat the pair as one change: remove the expanded
  copy and rebuild the nested instance from the prefab once, at the prefab's position.
- Tests: revert each half separately → children are `[Hull, Turret]` with one Turret, `getChanges`
  is empty, a link save writes the link (not expanded) and logs no "reordered" warning.

### N6 — an added child's position is an absolute index (pre-existing; format decision)
After the prefab gains a child in front, an instance's added last child lands between the prefab's
own children. Decision (made here, before the format freezes): **position relative to a prefab
sibling.**
- `PrefabAddedChild` gains `after?: string | null` — the node id of the prefab sibling it follows
  (`null` = first). The writer writes `after` and keeps `index` (old readers and debugging). The
  reader uses `after` when present and the sibling exists, else falls back to `index`.
- Tests: N6 in `v_new_findings` (`[Antenna, Hull, Turret, Turret, Flag]`); an `after` whose sibling
  the prefab removed falls back to `index`; a file with only `index` loads as before.

### Review #10 — override `path` churn (format decision)
An override's informational `path` (position in the prefab's tree) changes whenever the prefab gains
a child in front, so an unchanged scene re-saves with a diff. Decision (made here, before the format
freezes): **do not write `path` where `node` is present.**
- Make `PrefabOverride.path` optional in the exported type; the writer omits it when `node` is set;
  readers keep accepting it (older files). Search every reader of `.path` on overrides
  (`grep -n "\.path" src/engine/core/serialization/*.ts`) and make each work from `node`.
- CHANGELOG *Changed*: the exported `PrefabOverride.path` is optional. Plan §11: move the item from
  Open to done.
- Tests: `zz_probe2` "Turret gains a child before its Barrel" and "Tank gains a child before Hull"
  in `probes/e11/vzw` pass (unchanged scene re-saves byte-identically after the prefab grows).

## Acceptance

- `npx vitest run tests/vzw` (probes copied in): every test in `v_new_findings.test.ts` passes, and
  no probe that passed at `e6a8500` now fails (run the folder at `e6a8500` first and keep the list).
- `npm run typecheck`, `npm test`, `npm run build` exit 0; the test count rises by the new tests.
- A scene with no prefab instance writes the same bytes as at `e6a8500` (pick one from
  `tests/Serialization.test.ts`, save with both builds, `cmp`).
- `CHANGELOG.md [Unreleased]` and `design/prefab-instances-plan.md` describe the new behaviour:
  `of` on table entries, `after` on added children, optional override `path`, N2's remaining limit,
  revert keeping references into the rebuilt subtree.

## Out of scope

The version gate (A4). Component ids (A5) — but leave N4's records easy to switch to them.
Docs/API findings from the conventions review (A2).

## Gotchas

- `Prefab.revert` now uses `destroyImmediate` (da13d7c); collect N4's records before it.
- `_serializeForPrefab` has `outward`, `mintLive`, `match` options; references counted out of an
  instance carry `scope`. Read its JSDoc before touching N1.
- Node ids inside a nested instance belong to the nested prefab and repeat between two instances
  of it; resolve N4 records relative to the reverted root, never globally.

## Commits

One per finding (`fix(serialization): …`), tests in the same commit, then one `docs:` commit for the
plan if it did not fit in them. Push when the full checks are green.

## Report back

For each of N1–N6 and #10: fixed / not fixed (why), the commit, the tests that pin it. The probe
results before and after (counts). Anything in the plan or CHANGELOG you changed.

## Review focus (Opus reviewer)

N3's `of` binding when the prefab is edited between save and load; N4 with the same prefab nested
twice; N6 when the `after` sibling is itself removed in the instance; that no `scope > 0` reference
can reach a prefab file through any `applyInstance` path.
