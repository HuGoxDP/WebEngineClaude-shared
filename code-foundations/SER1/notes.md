# SER1 build notes — W1 (Tier B executor)

Task: serialize `Behaviour.enabled` (D-1…D-6 binding, `research.md`).
Worktree: `.workers/W1/WebEngineTS`, branch `SER1-behaviour-enabled-serialization`.
Base: WebEngineTS `master` **c4a0119691025f1e6ceaaa5cd27aeb5e9fb0918c**.
Coder discipline: **no builds/tests run by the coder** (plan RULES). Correctness argued by
static trace + graphify + reading existing tests; gates belong to the verifier.

## Commits (engine, pushed to origin)

| SHA | Phase | Subject |
|---|---|---|
| `15e1bab` | 1 | fix(SER1): serialize Behaviour.enabled so disabled components survive save/load (D-1) |
| `1158e69` | expectations | test(SER1): enabled is now serialized (D-1) |
| `144e349` | 2 | fix(SER1): prefab diff reads a missing enabled as its default true (D-2) |

Push evidence: `c4a0119..1158e69` then `1158e69..144e349` →
`origin/SER1-behaviour-enabled-serialization`; `git rev-parse HEAD` ==
`git rev-parse origin/SER1-behaviour-enabled-serialization` = `144e3498f9d6f684cd390115a36217ab60243f6c`.

## Phase 1 — `enabled` as a serialized, hidden field (D-1, D-4, D-5)

**What:** `src/engine/core/Behaviour.ts` +12 lines. Imports `SerializedField, HideInInspector`
(`./reflection/Decorators.ts`) and `FieldType` (`./reflection/Types.ts`); decorates the existing
`enabled` getter (:72–73) with `@SerializedField({ type: FieldType.Boolean })` +
`@HideInInspector()`; JSDoc extended (always written, loaded before awake, Unity `m_Enabled`,
old-file default true without setter call). Getter decoration is an established pattern
(`Renderer.sharedMaterial`, Renderer.ts:193).

**Why this shape:** `getAllFields` merges base-first into a Map, and Component/EngineObject
declare no serialized fields → `enabled` is the **first** key of every Behaviour component's
`fields`. `_serializeComponents` (SceneSerializer.ts:1809) writes every `serialize: true` field;
`_applyFields` skips absent keys and `_hasSetter` (:2838) routes through the setter — so an old
file never calls the setter, and a saved `false` lands before `_awakeLoaded` runs awake.
`_clone` (GameObject.ts:1297) routes Instantiate through serialize/deserialize → same path.
PostEffect is not a Behaviour (D-4): its own `enabled` field is untouched.

**Tests:** `tests/BehaviourEnabledSerialization.test.ts` (188 lines, new).
- DW-1.1: `getAllFields(MeshRenderer)` contains `{name:"enabled", serialize:true, hideInInspector:true}`; `BloomEffect` (PostEffect subclass) keeps its own `enabled` without `hideInInspector`.
- DW-1.2: save→load of disabled+enabled twins of `EnabledSpec.Script` (ScriptableBehaviour), `MeshRenderer`, `BoxCollider`, `PointLight` — `[false, true]` per kind (insertion order pinned by `getComponents`, GameObject.ts:803; `_attachAll` folds only `_allowMultiple=false` types = Transform/RectTransform, so twins are legal).
- DW-1.3: same through `EngineObject.Instantiate`.
- DW-1.4: `EnabledSpec.Counter` — loaded disabled → awake 1 / onEnable 0, then enable → onEnable 1; loaded enabled → awake 1 / onEnable 1; inactive-parent variant (load asleep; `setActive(true)` → `_runDeferredAwakes` awake 1, `_onEnabledChanged` sees enabled=false → onEnable 0). Default mode is play (`_PlayMode.ts` `_editMode=false`), same reliance as DeferredAwake.test.ts.
- DW-1.5: hand-written JSON without `enabled` loads `true`; proof via accessor spy `vi.spyOn(Behaviour.prototype, "enabled", "set")` + `not.toHaveBeenCalled()` (cleaner than `_onEnabledChanged`, which the default wake also calls). Precedent: `vi.spyOn(Rect.prototype, "set")` in UI.test.ts.

**Failing-first reasoning:** on base, nothing serializes `enabled` → disabled round-trips come
back `true` (DW-1.2/1.3 red), lifecycle counts wrong (DW-1.4 red), metadata absent (DW-1.1 red).
DW-1.5's setter-spy passes on base trivially (field never written) — it pins the *new* invariant
that adding the field must not start calling the setter for old files.

## Expectation updates (own commit `1158e69`, reason "SER1: enabled is now serialized (D-1)")

Audit method: every whole-component/byte comparison in `tests/*.test.ts` classified
live-vs-live (symmetric — safe), placeholder/unknown-type (no Behaviour fields — safe),
non-Behaviour (safe), or live-vs-hand-written-fixture (needs the key). No vitest snapshots exist
(`toMatchSnapshot`/`toMatchInlineSnapshot` grep empty). Four fixture sites, all **key added only,
no assertion weakened**, `enabled: true` as the leading key (base-first order):

| File:line (post-edit) | Fixture | Components touched |
|---|---|---|
| `tests/CinemachinePostSerialization.test.ts:162` | sorted key list | `CinemachineFollowBody` (→ CinemachineBody → Behaviour): `["damping","offset"]` → `["damping","enabled","offset"]` |
| `tests/Serialization.test.ts:439` | `OLD_SCENE` (:431) vs save at :481 | `FormatSpec.Mark` |
| `tests/Serialization.test.ts:455` | same | `FormatSpec.Route` (nested `FormatSpec.Leg` is a POCO — untouched) |
| `tests/PrefabInstances.test.ts:80` | `expandedScene()` (:72) vs save at :111 | `PrefabSpec.Aim` |
| `tests/PrefabInstances.test.ts:221` | `old` (:213) vs save at :267 | `PrefabSpec.Tag` |
| `tests/PrefabInstances.test.ts:237` | same | `PrefabSpec.Aim` (the `MeshRenderer` fields there are live-probe-generated — already carry enabled) |

These compare full `serializeScene` output against hand-written fixtures byte for byte; the
Phase 2 diff helper does not reach them. They fall under the plan's sanctioned "add the key"
constraint, not "any other failure". An ATTENTION entry records the checkpoint's earlier
misclassification (claimed all byte comparisons symmetric) for Lead visibility.

## Phase 2 — Prefab diff: missing `enabled` means `true` (D-2)

**What:** `src/engine/core/serialization/PrefabOverride.ts` +36/−2.
- Value imports `Behaviour`, `TypeRegistry` (:2–3). **No new runtime cycle:**
  `Behaviour → Component → EngineObject` (leaf, zero imports) `→ Decorators → TypeRegistry`
  (type-only import) — no back-edge into serialization; both used only inside method bodies.
- Private `PrefabDiff._withDefaultEnabled(comp)` (:1591): returns `comp.fields` unchanged when
  `enabled` present, when `TypeRegistry.get(comp.type)` is null, or when the ctor is not a
  Behaviour subclass (`ctor.prototype instanceof Behaviour`); otherwise a **copy**
  `{ enabled: true, ...comp.fields }`. Never mutates the tree; unknown types (MissingComponent
  bytes) untouched.
- Field loop (:1456): prefab side normalized only. Correct for every era mix — the loop iterates
  *instance* keys; a new instance always carries `enabled`, an old instance never surfaces it.
- Added-component match (:570): **both operands normalized** — see design note below.
- Per-field override apply (:534 loop) untouched, per plan OUT. No other diff site touched
  (all other `_equal` call sites verified: link descriptors, override-list dedup, paths).

**Design note — both-operand normalization at :570 (deviation from literal "prefab side" wording,
same named site, for Lead review):** `_equal` compares whole field sets including key counts.
Normalizing only the prefab side would *regress vs base* the both-old case (old prefab tree that
already absorbed an added component + old saved `addedComponents` entry, neither carrying
`enabled`): `{enabled:true,label}` vs `{label}` → key-count mismatch → dedup fails → **duplicate
component inserted on load**. Normalizing both operands preserves old+old dedup, fixes
old+new/new+old, is a no-op for new+new, and cannot fabricate a false dedup (an explicit
`enabled:false` on either side still differs; non-Behaviour/unknown types pass through). Inserted
bytes remain `a.component` unchanged — apply never fabricates fields. This is D-2's intent
("old files read as enabled, do not churn diffs") applied consistently at the plan's named site;
flagged in ATTENTION for Lead confirmation.

**Tests:** `tests/PrefabEnabledOverride.test.ts` (190 lines, new).
- DW-2.1: `Prefab.fromGameObject` of a GameObject with disabled `MeshRenderer` (+ child Tag) →
  instance disabled; untouched instance → `getOverrides` `[]`; enable → exactly one
  `{component:"MeshRenderer", field:"enabled", value:true}` (objectContaining; node/componentId
  keys vary); link-mode save carries exactly that override (`_isDefaultOverride` only filters
  root name/position/rotation, Prefab.ts:1438 — never a component field); reload keeps enabled;
  fresh `prefab.instantiate()` still disabled.
- DW-2.2: `asOld()` strips `enabled` from every component via `toJSON`→`fromJSON` (asserts
  `stripped === 2`, proving a real old tree); instance loads enabled; `getOverrides` `[]`.
- DW-2.3: same old tree, instance renderer disabled → exactly one `enabled:false` override.
- Two supplementary tests pin the :570 design note: both-old added-component change still
  deduplicates (no duplicate insert, no fabricated key in the tree), and a genuinely different
  added component is inserted with its own bytes.

**Failing-first reasoning:** on base (Phase 1 absent) a disabled prefab's instance comes back
enabled → DW-2.1 first assertion red; `getOverrides` never records `enabled` → DW-2.1/2.3 red.
After Phase 1 alone, DW-2.2 is red (spurious `enabled:true` override on every old-tree instance)
— exactly the intermediate state the plan designed Phase 2 to fix. The both-old dedup test is
green on base and after Phase 1 (no enabled anywhere); it goes red only under the rejected
one-sided :570 variant — it pins the regression guard, not the feature.

## DW coverage map

| DW | Pinned by | Status (coder) |
|---|---|---|
| DW-1.1 | BehaviourEnabledSerialization.test.ts (metadata test) | written, static-traced |
| DW-1.2 | same (round-trip twins ×4 kinds) | written, static-traced |
| DW-1.3 | same (Instantiate) | written, static-traced |
| DW-1.4 | same (Counter lifecycle ×3) | written, static-traced |
| DW-1.5 | same (old-file JSON + accessor spy) | written, static-traced |
| DW-1.6 | full `npm test` | **verifier-owned** — coder ran no tests |
| DW-2.1 | PrefabEnabledOverride.test.ts | written, static-traced |
| DW-2.2 | same (asOld, stripped===2) | written, static-traced |
| DW-2.3 | same | written, static-traced |
| DW-2.4 | `tests/Prefab*.test.ts` + ModelSubAssets unchanged-green; typecheck/test/build; counts before/after | **verifier-owned** — coder ran no gates; note: PrefabInstances.test.ts received sanctioned key-only fixture additions (commit 1158e69), so "unchanged" holds for assertions, not bytes |
| DW-3.1 | CHANGELOG + report.md | **Phase 3, docs worker — not done here** |

## Verification performed by the coder (no builds/tests)

- Static traces: serializer write/read paths, lifecycle ordering, `_attachAll` folding,
  `getComponents` order, `_clone` Instantiate path, `_isDefaultOverride`, `compare` flat
  overrides, `Prefab.toJSON/fromJSON/ensureIds`, `AssetDatabase._bindGuid/clear`.
- Import-cycle analysis for the two new value imports (chain has no serialization back-edge).
- Expectation audit across all `tests/*.test.ts` (classification above).
- Junk checks per commit (no `.only/.skip/console/debugger`, no AI trailers) — all clean.
- graphify used for structural questions during research (see build report).

## Remaining

- Phase 3 (CHANGELOG, report.md, ROADMAP untouched) — docs worker per plan.
- Verifier gates: DW-1.6, DW-2.4 (full gate on Phase 2), counts before/after.
- Lead review: :570 both-operand design note (ATTENTION).