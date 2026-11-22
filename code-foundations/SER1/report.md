# SER1 — `Behaviour.enabled` survives save, load, `Instantiate` and prefabs: task report (W1, 2026-11-22)

Task: SER1 (ROADMAP M0, ½ d, Claude review 2026-11-21). `Behaviour.enabled` was never
serialized: the serializer had no `enabled` anywhere and `Behaviour._enabled` carried no
`@SerializedField`, so a component switched off in a scene or prefab came back on after
save/load **and after `Instantiate`** — including the source renderers
`StaticBatchingUtility.combine` disables. Unity serializes `m_Enabled` per Behaviour; this
task makes `enabled` an ordinary serialized, hidden field with a missing value read as `true`
(old files) and correct prefab-override behaviour.

Plan `plan.md` (research `research.md`, decisions D-1…D-6 binding). Three phases: Phase 1
(the field), Phase 2 (prefab diff, Full gate), Phase 3 (docs).

Branch `SER1-behaviour-enabled-serialization` in WebEngineTS and `.claude-shared`.
Worktrees: `.workers/W1/WebEngineTS`, `.workers/W1/.claude-shared`.
Base: WebEngineTS `master` `c4a0119`.

Status: **DONE, ready to merge.** Full gate PASS pinned on the merged tip
`124995777c99e001e585da3f8d0ef2d123143880` (`.workers/logs/SER1-verify-1249957.md`); Phase 3
docs commit `3b71fb3` is CHANGELOG only (docs-only, below).

## What landed

- **Phase 1 — `15e1bab`** (engine): `src/engine/core/Behaviour.ts` +12. The existing `enabled`
  getter (:72–73) is decorated `@SerializedField({ type: FieldType.Boolean })` +
  `@HideInInspector()` (D-1, D-4); JSDoc states it is saved with the scene, loaded before
  `awake`, Unity's `m_Enabled`, and that an old file reads `true` without calling the setter
  (D-5). Because `getAllFields` merges base-first and `Component`/`EngineObject` declare no
  serialized fields, `enabled` is the first key of every Behaviour component's `fields`;
  `_serializeComponents` (SceneSerializer.ts:1809) writes it, `_applyFields` skips absent keys
  and routes through the setter via `_hasSetter` (:2838), and `_clone`
  (GameObject.ts:1297) routes `Instantiate` through the same path. `PostEffect` is not a
  `Behaviour`, so its own `enabled` is untouched (D-4). New test file
  `tests/BehaviourEnabledSerialization.test.ts` (189 lines).
- **Expectation updates — `1158e69`** (engine): the sanctioned key-only additions of
  `enabled: true` to six hand-written fixtures (below), no assertion weakened, in their own
  commit with reason "SER1: enabled is now serialized (D-1)".
- **Phase 2 — `144e349`** (engine): `src/engine/core/serialization/PrefabOverride.ts` +38/−2.
  Private `PrefabDiff._withDefaultEnabled(comp)` (:1591) treats a missing prefab-side
  `enabled` as `true` for a component whose registered type is a `Behaviour` subclass, and
  returns the fields untouched for unknown types and non-Behaviours; never mutates the tree.
  Used at the field-loop comparison (:1456, prefab side only — correct for every era mix) and
  at the added-component match (:570). Per-field apply (:534) untouched (plan OUT). New test
  file `tests/PrefabEnabledOverride.test.ts` (190 lines).
- **Merge-forward — `1249957`**: `git merge origin/master` of six incoming M0.2hr4
  mesh-alias commits (base `c4a0119` → master `73c96a6`), clean, only
  `tests/Serialization.test.ts` auto-merged; both SER1 fixture keys and the incoming mesh
  tests coexist; verified by the full green suite.
- **Phase 3 — `3b71fb3`** (engine): CHANGELOG *Fixed* entry (DW-3.1) naming save/load,
  `Instantiate`, prefab overrides and the old-file default, plus the lifecycle parity
  (`awake` without `onEnable`, as in Unity) and the unchanged hidden inspector field. This
  report plus the shared docs.

Engine commits (`git log --oneline origin/master..HEAD`):

```
3b71fb3 docs(SER1): changelog - Behaviour.enabled survives save, load, Instantiate and prefabs (DW-3.1)
1249957 Merge remote-tracking branch 'origin/master' into SER1-behaviour-enabled-serialization
144e349 fix(SER1): prefab diff reads a missing enabled as its default true (D-2)
1158e69 test(SER1): enabled is now serialized (D-1)
15e1bab fix(SER1): serialize Behaviour.enabled so disabled components survive save/load (D-1)
```

Engine diffstat (`git diff --stat origin/master...HEAD`):

```
 CHANGELOG.md                                    |  10 ++
 src/engine/core/Behaviour.ts                    |  12 ++
 src/engine/core/serialization/PrefabOverride.ts |  38 ++++-
 tests/BehaviourEnabledSerialization.test.ts     | 189 +++++++++++++++++++++++
 tests/CinemachinePostSerialization.test.ts      |   2 +-
 tests/PrefabEnabledOverride.test.ts             | 190 ++++++++++++++++++++++++
 tests/PrefabInstances.test.ts                   |   6 +-
 tests/Serialization.test.ts                     |   3 +-
 8 files changed, 443 insertions(+), 7 deletions(-)
```

Shared commits (`git log --oneline origin/main..HEAD`):

```
(this commit) docs(SER1): report
02404a8 docs(SER1): verifier counts — full gate PASS on merged tip 1249957 (3084/3084, +14)
fd1dc70 docs(SER1): build notes
5e180f4 Claim SER1 (W1)
```

Shared diffstat (`git diff --stat origin/main...HEAD`): `ROADMAP.md` (this task's row only)
and `code-foundations/SER1/{notes.md,report.md}`.

## Done-when coverage — every DW, its evidence and the exact test names

Full gate was run by the verifier on merged tip `1249957`
(`.workers/logs/SER1-verify-1249957.md`); Phase 3 `3b71fb3` adds only CHANGELOG.md, so the
gate result carries over unchanged (docs-only delta proven at the end of this section).

**DW-1.1** — `getAllFields(MeshRenderer)` contains
`{ name: "enabled", serialize: true, hideInInspector: true }`; `getAllFields(PostEffect
subclass)` keeps its own `enabled` without `hideInInspector`. Proving tests
(`tests/BehaviourEnabledSerialization.test.ts`):
- `enabled as a field (DW-1.1) > a Behaviour subclass carries enabled: serialized, hidden from the inspector`
- `enabled as a field (DW-1.1) > every kind tested reads the same field from Behaviour`
- `enabled as a field (DW-1.1) > a PostEffect keeps its own enabled, visible: it is not a Behaviour`

**DW-1.2** — save→load of a disabled `ScriptableBehaviour` (`EnabledSpec.Script`),
`MeshRenderer`, `BoxCollider` and `PointLight` each gives `enabled === false`; each enabled
twin stays `true`. Proving test:
- `save and load (DW-1.2) > every disabled component comes back disabled; its enabled twin stays enabled`

**DW-1.3** — the same through `EngineObject.Instantiate(go)`. Proving test:
- `Instantiate (DW-1.3) > a copy of a disabled component is disabled; its enabled twin stays enabled`

**DW-1.4** — lifecycle with the counting script `EnabledSpec.Counter`: loaded disabled →
`awake` 1 / `onEnable` 0, then `enabled = true` → `onEnable` 1; loaded enabled → `awake` 1 /
`onEnable` 1; loaded disabled under an inactive parent then the parent activated → `awake` 1 /
`onEnable` 0. Proving tests:
- `lifecycle of a loaded script (DW-1.4) > loaded disabled: awake once, onEnable never; switching on enables once`
- `lifecycle of a loaded script (DW-1.4) > loaded enabled: awake once, onEnable once`
- `lifecycle of a loaded script (DW-1.4) > loaded disabled under an inactive parent: activation wakes it without enabling it`

**DW-1.5** — a hand-written JSON component without `enabled` (an old file) loads with
`enabled === true` and its setter was not called (`vi.spyOn(Behaviour.prototype, "enabled",
"set")` + `not.toHaveBeenCalled()`). Proving test:
- `an old file without enabled (DW-1.5) > loads enabled, and the setter is never called`

**DW-1.6** — full `npm test` green. Evidence: full suite **188 files / 3084 tests passed, 0
failed**, exit 0 (gate b below). Expectation updates per Constraints are listed below with
`file:line`, and in `notes.md` §Expectation updates.

**DW-2.1** — a prefab from `Prefab.fromGameObject` with a disabled `MeshRenderer` gives a
disabled instance; `enabled = true` on the instance makes `prefab.getOverrides(instance)`
hold exactly one override `{ component: "MeshRenderer", field: "enabled", value: true }`; a
link-mode save→load keeps it enabled while the prefab stays disabled. Proving test:
- `DW-2.1: a disabled MeshRenderer prefab gives disabled instances; enabling one records one override that survives a link round trip`

**DW-2.2** — an "old" prefab tree (every component's `fields.enabled` stripped via
`toJSON`→`fromJSON`, `stripped === 2` asserted), its instance re-snapshotted →
`prefab.getOverrides(instance)` contains **no** `enabled` override. Proving test:
- `DW-2.2: an instance of a tree with enabled stripped has no enabled override`

**DW-2.3** — the same old tree with the instance's component disabled → exactly one
`enabled: false` override. Proving test:
- `DW-2.3: the same old tree with the instance's renderer disabled records exactly one enabled:false override`

**DW-2.4** — the existing prefab test files green unchanged (`tests/Prefab*.test.ts`: 
PrefabEnabledOverride 5, PrefabEditing 64, PrefabIdentity 20, PrefabReferences 16,
PrefabComponentIds 4, PrefabRevertUnderHolder 4, PrefabInstances 54; `tests/ModelSubAssets.test.ts`
14 — byte-identical), then `npm run typecheck`, `npm test`, `npm run build` green, counts
before/after in `notes.md`. Evidence: gates a/b/c below; per-file audit in the verifier file
§DW-2.4. Counts: before **186 files / 3070 tests**, after **188 files / 3084 tests**
(Δ +2 files / +14 tests = BehaviourEnabledSerialization 9 + PrefabEnabledOverride 5, exactly
accounted).

**DW-3.1** — the CHANGELOG entry names save/load, `Instantiate`, prefab overrides and the
old-file default; `report.md` lists every DW with its evidence. Evidence: commit `3b71fb3`
CHANGELOG *Fixed* entry — the paragraph opens "A disabled component stays disabled through
save/load, `Instantiate` and prefabs", states "Switching one on records an ordinary `enabled`
override that survives a link-mode save and load", "Old files without the key load enabled
and produce no new prefab overrides", and the `awake`-without-`onEnable` parity; this report.

### Sanctioned expectation sites — all six key-only (commit `1158e69`, +6/−5)

| # | File:line | Fixture | Change |
|---|---|---|---|
| 1 | `tests/CinemachinePostSerialization.test.ts:162` | sorted key list | `["damping","offset"]` → `["damping","enabled","offset"]` |
| 2 | `tests/Serialization.test.ts:439` | `OLD_SCENE` `FormatSpec.Mark` | `fields: { label: "home" }` → `fields: { enabled: true, label: "home" }` |
| 3 | `tests/Serialization.test.ts:455` | `OLD_SCENE` `FormatSpec.Route` | `+ enabled: true,` (nested `FormatSpec.Leg` POCO untouched) |
| 4 | `tests/PrefabInstances.test.ts:80` | `expandedScene()` `PrefabSpec.Aim` | `+ enabled: true,` leading key |
| 5 | `tests/PrefabInstances.test.ts:221` | `old` `PrefabSpec.Tag` | `+ enabled: true,` leading key |
| 6 | `tests/PrefabInstances.test.ts:237` | `old` `PrefabSpec.Aim` (MeshRenderer fields live-probe-generated) | `+ enabled: true,` leading key |

Each pair differs solely by the inserted `enabled` key; no assertion, value, matcher or
test-name edit anywhere. No test weakened, skipped or deleted. Audit method and the
checkpoint's earlier misclassification are in `notes.md` §Expectation updates.

### Lead rulings applied

1. **`:570` both-operand normalization — approved.** The plan said the helper defaults a
   missing prefab-side `enabled` at the field loop (:1454) and the added-component match
   (:568); the implementation normalizes **both operands** at the added-component match
   (:570) because `_equal` compares key counts — one-sided would regress the both-old case
   into a duplicate insert (silent legacy corruption). Old+old dedup preserved, mixed eras
   fixed both ways, new+new a no-op, explicit `enabled:false` still differs, unknown types
   pass through. Lead ruling: approved. Verifier pins: two committed tests (both-old dedup
   keeps tree bytes untouched; a genuinely different added component is inserted with its own
   bytes) plus a deleted scratch run proving mixed eras both directions and explicit
   `enabled:false` on either side still differs (5/5). See `notes.md` §Phase 2 design note.
2. **DW-2.4 "unchanged" read as assertions-unchanged.** `PrefabInstances.test.ts` carries
   the three sanctioned key-only fixture additions above, so "unchanged" holds for
   assertions, not bytes; `ModelSubAssets.test.ts` is byte-identical. Recorded in `notes.md`
   DW map and verified in the verifier file §DW-2.4.

### Docs-only proof for Phase 3 (no re-gate needed)

The Phase 3 engine commit touches documentation only — `git diff 1249957 --stat` before the
commit showed `CHANGELOG.md | 10 ++++++++++`, `1 file changed, 10 insertions(+)`, nothing
under `src/` or `tests/`. The PASS gate on `1249957` therefore still stands for `3b71fb3`.

## Check results

`.workers/W1/WebEngineTS` on merged tip `1249957` (verifier, `.workers/logs/SER1-verify-1249957.md`):

- `npm run typecheck` — **exit 0** (build + player + test tsconfigs).
- `npm test` — **exit 0**, `Test Files 188 passed (188)`, `Tests 3084 passed (3084)`, 0
  failed, 0 skipped.
- `npm run build` — **exit 0** (`dist/WebEngineTS.d.ts`, `dist/player-host.js`,
  `dist/player/player.js` all created; `dist/` git-ignored, worktree clean).

Per-file (targeted run, all exit 0): BehaviourEnabledSerialization 9/9, PrefabEnabledOverride
5/5, Serialization 158/158, PrefabInstances 54/54, CinemachinePostSerialization 18/18,
ModelSubAssets 14/14, plus the rest of `Prefab*` (PrefabEditing 64, PrefabIdentity 20,
PrefabReferences 16, PrefabComponentIds 4, PrefabRevertUnderHolder 4).

Counts DW-1.6/DW-2.4: before **186 files / 3070 tests** (origin/master `73c96a6`, recorded in
`.workers/logs/M0.2hr4-verify-e494ea1.md`, same suite content), after **188 / 3084**, 0 failed.

## Deviations and their records

- **`:570` both-operand normalization** (same named site, wider than the literal
  "prefab side"): approved by the Lead; rationale, era analysis and the verifier's 5/5
  scratch proofs in `notes.md` §Phase 2 design note and the verifier file §Lead ruling (1).
- **Expectation misclassification, corrected:** three of the six fixture sites were first
  classified as symmetric live-vs-live and are in fact live-vs-hand-written-fixture; the
  Phase 2 helper does not reach them, so they belong to the plan's sanctioned "add the key"
  path. Recorded in `notes.md` §Expectation updates.
- **ENGINE-GAPS.md: no SER1 entry.** Neither `plan.md` nor `research.md` names a gap in
  `ENGINE-GAPS.md`, and the registry has no row about `enabled` serialization, so nothing was
  updated there (left as found).
- **Plan wording `:1454`/`:568`** vs the code's post-merge line numbers `:1456`/`:570` —
  same two call sites, shifted by the merge-forward; no behavioural difference.

## What remains

- Merge into `master` (engine first, then `.claude-shared`), post-merge gate on the merged
  default branch, ROADMAP row → ✅, graphify refresh, practice bundle.
- No follow-up rows added: the plan's success criteria are fully covered.

## Junk check

`git status --porcelain` empty in both worktrees before the docs commit and after it; no
`.only`/`.skip`/`debugger` in changed code; no AI trailers; `dist/` ignored. Engine
`git diff --name-only origin/master...HEAD` lists exactly the eight files the task meant to
change (CHANGELOG, `Behaviour.ts`, `PrefabOverride.ts`, the two new test files, the three
sanctioned fixture files).

## Debug result

Debug is the verifier's full gate (RULES step 7), run on the merged tip: one fully green run
of every check — typecheck, 188/3084 tests, build — with no failing test to fix. The only
fixed-during-verification item was the verifier's own scratch-test index mistake (engine
behaviour was correct; scratch fixed, 5/5, deleted). No engine bug found after the gate.

**Merge into `master`?** — Yes, pre-authorized: full gate PASS pinned `1249957`, Phase 3
docs-only `3b71fb3`.
