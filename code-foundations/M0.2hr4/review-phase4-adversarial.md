# Review: M0.2hr4 Phase 4 — adversarial review (W3)

**Pinned engine tip:** `e494ea1de8deb9999387b086cae3009cf4d3d4ed` (branch `M0.2hr4-mesh-alias-instantiate`,
worktree `.workers/W3/WebEngineTS`, clean, == `origin/M0.2hr4-mesh-alias-instantiate`;
base `c4a0119` == `origin/master`, verified via rev-parse/merge-base).
Commits: `a921920` (P1) → `15788f5` (P2) → `8034e67` (P3) → `e494ea1` (DW-3.2 pin).

## Executed Results (Step 0 — by dispatch constraint, NOT run)

The dispatch forbids builds/tests (coder discipline; Full-gate verifier runs after this review).
No test/typecheck/lint executed here. Evidence below is static TRACE against the pinned code plus
git evidence (diff numstat, byte-comparison of pin regions, test-name set diff). The gate suite
(DW-1.6 / DW-2.6 / DW-3.8) remains the verifier's window; this verdict does not pre-empt it.
Graphify queried (base graph) for destroy/serialize call topology; branch deltas read directly.

## Per-attack verdicts (plan Phase 4 list + dispatch additions)

### A1. Use-count lifecycle — leak / under-count / double-free across all destroy paths — PASS

Only retain/release sites in the whole tree are `MeshFilter._store` (`MeshFilter.ts:159,161`)
and direct test calls; `grep _retainByFilter|_releaseByFilter|_filterUses|_autoDestroy src/` = Mesh.ts
declarations + MeshFilter._store + disown (`:65`) + getter (`:98`). `_store` is reached from
sharedMesh setter (`:69`), mesh setter (`:114`), getter (`:99`), onDestroy (`:176`) — every
storage mutation funnels through it.

- **Self-assign**: `mesh = m` same slot → early return, no count change (`:108-111`);
  `sharedMesh = own instance` → disown branch, no retain/release (`:61-68`); count stays 1,
  correct (the filter still holds it). Disown clears `_autoDestroy` globally (`:65`) — D-2 contract.
- **Component destroy**: every route (`destroy` deferred, `destroyImmediate`,
  `GameObject.removeComponent` `GameObject.ts:706-717`, GameObject.onDestroy walking components
  `GameObject.ts:1226-1247`) ends in `Component._destroyImmediate` (`Component.ts:310-316`), which
  is re-entrancy-guarded (`_destroyStarted`, `EngineObject.ts:301-312`). `onDestroy` runs exactly
  once → exactly one release. No double-release.
- **Scene teardown / unload**: `Scene.destroy` (`Scene.ts:524-546`) destroys every root
  immediately; `SceneManager.loadScene`/`unloadScene` call it (`SceneManager.ts:193,233`).
  Each GameObject destroys its components → MeshFilter releases. `Application.dispose`
  (`Application.ts:720+`) → `unloadScenario` → `Scenario.unload` (`Scenario.ts:754+`) →
  SceneManager unload/loadScene → same path. `_clearPendingDestroys` (`EngineObject.ts:471`)
  only drops *timed* destroys; zero-delay releases already ran inside onDestroy. No filter
  that ever stored a mesh skips onDestroy on any of these paths.
- **Double destroy / destroy-then-reuse**: `EngineObject.Destroy` checks `exists()`
  (`:382`), `_destroyImmediate` checks `_isDestroyed||_isDestroying` (`:302`); a queued destroy
  of an already-dead mesh is skipped (`_updatePendingDestroys :435,449`). Two filters releasing
  to 0 then destroy: second release cannot occur because each filter releases once (slot becomes
  null in `_store` before notify). Release-at-0 clamps and errors once per call
  (`Mesh.ts:249-252`) — no negative drift.
- **Retain-before-release ordering** in `_store` (`:159` before `:161`): swapping a filter to a
  *different* mesh can never destroy the new value; swapping to the same object takes the
  no-op branch. No free-then-reuse window: `old.destroy()` is deferred (microtask/end-of-frame)
  but the slot no longer references it, and no path re-stores a released-to-0 mesh without a
  fresh retain (`_store` retains any non-null new value first).
- **User `mesh.destroy()` on a shared instance** (plan-listed): destroy is deferred; filters
  still hold their retain, count stays >0, mesh exists until drain, then `clear()` + dispose.
  Surviving filters hold a cleared mesh — same class of hazard as user-destroying an asset
  pre-change; the engine's own auto-free never fires while a use remains (release returns true
  only at 0, `Mesh.ts:254`). No engine-side double-free: Mesh has no onDestroy override, and
  `Mesh.destroy` → `super.destroy` → guarded `_destroyImmediate`. Editor swap = plain setter
  path, covered above.

TRACE (worst case tried): a.mesh (uses 1, auto) → b.sharedMesh=a.mesh (uses 2) →
a.destroyImmediate → a.onDestroy → _store(null) → release→1, false → mesh alive;
b.destroyImmediate → release→0 && auto → destroy queued → microtask drains → exists() false.
Matches DW-2.3 test (`MeshFilterMesh.test.ts` "an instance shared by two filters…") exactly.
No leak or premature-free path found.

### A2. Stale recipe — writer coverage, bounds exemption, null consumers — PASS

`_markDirty` sets `_recipeStale` iff `_primitive !== null` (`Mesh.ts:264`). Grep of Mesh.ts:
all 14 DW-1.1 writers route through it (`:310,321,332,343,354,365,376,387,398,429,482,528,618,668`);
`recalculateTangents` ends at `_markDirty` (`:618`) and its internal `recalculateNormals` also does.
Bounds paths notify-only (`set bounds :409`, `recalculateBounds :627,648`) — never stale, plan
constraint held. Factories set `_primitive` after geometry (`:850,919,989,1105,1221,1369`) →
never stale at birth; `clone()` copies both recipe and staleness (`:1397-1400`) → stale-clone-of-clone
stays stale; editing a clone cannot touch the original (separate objects).

- **Escapes probed**: direct in-place array mutation (`verts[0].x = 5`) bypasses `_markDirty` —
  but that is the pre-existing live-array contract (pinned by M0.2hr2 test "recalculateBounds
  propagates … in-place position edit", `MeshFilterMesh.test.ts:514-528`); not a new hole and not
  a DW-listed writer. `setSubMesh` covered; index swap = `triangles`/`indexFormat`, covered.
  No morph-target API exists (grep morph = 0). `subMeshCount` setter (`:437-448`) does not mark
  dirty — pre-existing, not a DW-1.1 writer; recorded as Note N2.
- **`primitive` null consumers**: only reader in src/ is the codec (`ValueSerializer.ts:369-371`),
  which null-checks and falls through to the honest-null branch. Type unchanged
  (`MeshPrimitive | null` was already nullable). No regression surface elsewhere.

### A3. sharedMesh alias semantics vs old clone-on-read — PASS

One slot + `_ownsShared`; `_meshInstance` private getter preserves the `:2072` probe semantics
(`MeshFilter.ts:28-30`). Getter: owned → same object; else clone once, mark auto, `_store(c,true)`
(`:89-105`); empty → null (no create-when-empty branch added — plan). Setter semantics verified
against every pre-existing test by trace: destroy-on-replace (`:157-163` release→destroy),
disown-keeps-alive (`:61-68`), Unity edit idiom (`mesh` self-assign no-op `:108-111`). All 27
pre-existing MeshFilterMesh tests traced green under the new semantics — notably "editing an
instanced mesh leaves other users alone" (second filter still holds original since the slot
swap is per-filter), "swapping meshes never destroys the shared asset" (non-auto meshes release
to 0 → false → never destroyed), the two M0.2hr1 second-filter tests (disown clears auto flag;
self-assign through mesh is a no-op). No double-free: destroy-on-replace only fires on the
auto flag which only the getter sets and disown clears.

### A4. LiveMesh codec — table scoping, index reuse, warn-once — PASS

- Serialize branch is inside `type === FieldType.Mesh`, after the null guard
  (`ValueSerializer.ts:257` returns null for null first), before guid/recipe (`:356-364`);
  `indexOf` reuse gives one entry per object → nested/duplicate references in one tree resolve
  to the same index and the same object. Arrays route through serialize with elementType
  (`:267-269`), nested structs via `ctx.nestedValue` closure carrying the same ctx
  (`SceneSerializer.ts:991`) — all inside the table's scope.
- Deserialize `case "LiveMesh"` (`:563-575`): with ctx table → `table[+(index ?? -1)] ?? null`
  (malformed/out-of-range index -> undefined -> null; NaN -> null); without -> null + module-flag
  warn once per process. Flag never reset — per-process semantics as planned; vitest default
  per-file isolation keeps it fresh per file (vitest.config.ts sets no pool override).
- **Table leakage**: `grep liveMeshes src/` = ValueSerializer + SceneSerializer only. Every
  `_buildSerializeCtx` call site audited (`SceneSerializer.ts:385,440,469,512,537,594,600,699,1251,1366`):
  only `_cloneGameObject` (`:469`) passes `liveMeshes`. Prefab paths (`_serializeForPrefab :512`,
  `_nameForPrefab :537`, `getOverrides`/`applyInstance` via `_serializeForPrefab`, `_enclosingCtx :594,600`,
  `_serializeInstance` local ctx `:1366`, `_assetFields :1251`, `serializeAsset :699`,
  `serializeScene :385`, `serializeGameObject :440`) — no table. Deserialize side: `_newContext`
  call sites `:418` (scene), `:660` (tree — table only from `_cloneGameObject`), `:730` (asset),
  `:2392` (`_restore` for prefab revert/restore) — all table-less except the clone. Prefab
  instantiate (`_deserializeTree` via `_instantiatePrefabUnderParent`, no 6th arg) — unchanged.
- **Nested Instantiate**: an Awake script calling Instantiate during `_awakeLoaded` opens its
  own local table in a fresh `_cloneGameObject` call — no shared mutable state, no index bleed.
- **Prefab-linked copy**: `_cloneGameObject` -> `_serializeGO` with `ctx.link=false` ->
  `_serializeExpanded` (full tree, all fields through the table) -> `_deserializeGO` takes the
  non-link branch (`prefab.changes` undefined) -> same identity path; `_prefabInfo` re-attached
  from `json.prefab.guid`. Plan edge case holds.
- **Warn-once unstorable**: module `WeakSet<Mesh>` keyed by object (`:17-18,377-383`), fires only
  when `vertexCount > 0` and no guid/recipe — exact D-4 text. Across Instantiate loops: the table
  branch returns before the warn branch, so Instantiate never warns; repeated saves of the same
  edited mesh warn once; a fresh object warns again (correct per-mesh semantics). The `:2024`
  handmade mesh has 0 vertices -> silent drop preserved.
- **Null propagation**: null from a table-less LiveMesh read lands via `_assign` -> sharedMesh
  setter -> `_store(null,false)` -> undraw; InstancedMeshRenderer.mesh setter accepts null. No
  component dereferences the value unguarded.

### A5. SceneSerializer threading / public API — PASS

`_cloneGameObject` is new `@internal` (`SceneSerializer.ts:466-472`); table threaded via optional
trailing params on the three **private** builders (`_deserializeTree :652`, `_newContext :877`,
`_buildSerializeCtx options.liveMeshes :917`). `serializeGameObject`/`serializeScene`/
`deserializeGameObject`/`deserializeScene`/`serialize`/`deserialize` signatures byte-identical
(diff shows no signature change on public members). `GameObject._clone` calls the new entry
(`GameObject.ts:1313`); the unserializable-types warning above it kept verbatim, one comment
sentence added. `import type { Mesh }` — type-only, no runtime cycle. No path bypasses the table
inside `_cloneGameObject`: `_serializeGO` covers children/components recursively with the same
ctx; `_materializeAssets` during deserialize uses the same LoadCtx (`:661`). Asset-table
attach (`json.assets`) mirrors `serializeGameObject:443`. No bypass found.

### A6. Test integrity — PASS

- `git diff --numstat c4a0119..e494ea1 -- tests/`: InstantiateGameObject 155/0, MeshRecipeStale
  196/0, Serialization 92/0, StaticBatching 23/0; MeshFilterMesh 80/1 — the single removed line
  is the vitest import gaining `vi`, not a test line. Zero removed/weakened assertions anywhere.
- Pins `:1976-2074` byte-compared base vs tip (`sed | diff`): **identical**. Serialization diff
  is one pure-append hunk at `@@ -2074,0 +2075,92`.
- Test-name set diff base vs tip for MeshFilterMesh: exactly +4 names (DW-2.1..2.4), none removed
  or renamed. Counts verified: MeshFilterMesh 27->31, StaticBatching 6->7, Instantiate 11->17,
  Serialization 155->158, MeshRecipeStale 30 cases (14 writers + 6 factories + 2 bounds + 4 clone
  + 4 use-count). Total +44. Matches the build report.
- **Failing-first DW-2.5 by construction**: on c4a0119 the getter stored the clone in
  `_meshInstance` and left `_sharedMesh` = original (base MeshFilter.ts:67-83); combine reads
  `filter.sharedMesh` (StaticBatchingUtility.ts:67) -> unedited cube -> bounds.max.x = 0.5; test
  demands `toBeCloseTo(5,3)` -> fails. On tip the alias makes it 5 (`Mesh.combine` ->
  `_fromThreeGeometry` -> `recalculateBounds`, Mesh.ts:1613,1541). Genuine pin.
- **Failing-first DW-3.1 by construction**: on c4a0119 `_clone` round-tripped
  `serializeGameObject` which wrote the ORIGINAL's PrimitiveMesh recipe (instance invisible to
  codec) -> copy = fresh cube, different object, x = -0.5; test demands `toBe(m)` and x ~ 5 ->
  fails on both assertions. Genuine pin.
- **False-pin hunt**: DW-3.6 clone-spy is installed after the getter read, so it pins the save
  path only — and `_meshInstance === inst` would fail under old clone-on-save behaviour;
  DW-3.5 warn-count 1 fails on base (no warn existed) and null-vs-recipe fails on base;
  DW-3.4 smuggled-JSON warn fails on base (unknown `$type` fell through without warning);
  DW-2.2 spy-count-1 fails if the getter re-cloned. No assertion found that passes without its fix.

### A7. DW-3.2 deviation ruling — FAITHFUL, not a scope cut

Plan wording "the original instance is untouched" after the copy's own `mesh` read is
internally inconsistent with binding D-2 + D-1: the copy's getter must clone and `_store` the
clone, which releases the shared instance (uses 1->0, auto) -> deferred destroy. "Untouched"
cannot hold literally without violating D-2's last-use free or D-1's alias. The resolution
splits the DW into its two consistent halves and pins BOTH: survivor test
(`InstantiateGameObject.test.ts` "the copy keeps drawing after the original is destroyed...":
exists + 24 vertices while a use remains, own read = new object carrying x ~ 5) and release pin
(commit e494ea1, "the shared instance is freed once its last user lets go": exists() false after
one microtask). Every observable consequence of the plan's Done-when that is compatible with
the binding decisions is asserted; nothing was dropped silently — the deviation is recorded in
notes.md and the build report. **Ruling: faithful implementation of the plan's intent under its
binding decisions; no behaviour left unpinned.** (The plan text itself should be corrected at
Report time — non-blocking, docs lane.)

### A8. Scope bounds — PASS

Diff touches exactly the 5 planned source files + 5 test files. No Material/sharedMaterial
change (D-7). No public API removed: `_destroyInstance` was private; `_meshInstance` was
private, kept as private getter; `hasMesh` simplified but public behaviour identical (one slot).
New members all `@internal` `_`-prefixed (`_filterUses`, `_autoDestroy`, `_retainByFilter`,
`_releaseByFilter`, `_recipeStale` private, `_ownsShared` private, `liveMeshes?` @internal on
both contexts, `SceneSerializer._cloneGameObject` @internal). MeshRenderer, StaticBatchingUtility,
Prefab paths untouched (D-5 held; grep confirms). InstantiateGameObject.test.ts new imports
each Prefab-free at top level; hook-side guard test intact.

## Loaded-Skill Criteria (aposd-verifying-correctness)

| Criterion | Status | Evidence |
|---|---|---|
| RC-1..4 requirements coverage | PASS | A1-A8 map every plan Phase-4 attack + dispatch item to code; no code without requirement found (only the planned members) |
| CS-1..4 concurrency | PASS | Single-threaded JS; shared state = module WeakSet/flag (A4) and per-call local table; nested Instantiate re-entrancy creates fresh tables; no TOCTOU in _store (retain before release, synchronous) |
| EH-1..5 error handling | PASS | Malformed LiveMesh index -> null (`:568`); release-at-0 -> console.error, clamped (`Mesh.ts:249`); unstorable mesh -> warn + null, observable; no swallowed path |
| RM-1..5 resources | PASS | Every retain paired with release via the single _store funnel + onDestroy (A1); WeakSet bounded by object lifetime; live table is call-local, GC'd after clone |
| BC-1..5 boundaries | PASS | count 0 clamp; empty mesh (0 vertices) silent drop; null/undefined value guard before table push; index -1/NaN/out-of-range -> null; single vs N filters traced |
| SE-1..5 security | N/A | No untrusted input beyond scene JSON, which the codec already treats as data; smuggled LiveMesh handled (A4); no secrets/paths/SQL surface |

26 items checked, 21 pass, 5 n/a (SE-1..5).

## Dead Code

None found in the diff (no unreachable code, no debug statements, no commented-out blocks).

## Notes (non-blocking)

1. **N1 — warn-once is per-realm, not per-save-session.** `liveMeshWarned` never resets; a host
   reusing one JS realm across scenario loads warns only on the first smuggled LiveMesh ever.
   That is exactly the planned "once per process" semantics, but a future `Application.dispose`
   reset could be considered. Not a defect against the plan.
2. **N2 — `subMeshCount` setter neither marks dirty nor stales** (`Mesh.ts:437-448`): changing
   submesh layout leaves the recipe "valid" though geometry interpretation changed. Pre-existing
   (base also skipped `_markDirty`), not a DW-1.1 writer; flagged for a future row, not this task.
3. **N3 — in-place array mutation escapes staleness** (`m.vertices[0].x = 5` without re-assign):
   pre-existing live-array contract pinned by M0.2hr2 tests; D-4 covers setter writes only, as
   the plan's writer list states. No action in this task.
4. **N4 — user `destroy()` of a shared auto-instance while other filters hold it** leaves those
   filters drawing a cleared mesh until they swap. Unity-parity hazard (destroying a still-shared
   mesh is user error); engine never initiates it.
5. **N5 — plan DW-3.2 wording** should be corrected at Report (see A7) so future readers don't
   re-litigate the deviation.
6. **N6 — `_releaseByFilter` logs on every release-at-0 call** (not literally "once" per mesh);
   DW-1.5 pins one call -> one error, which the code satisfies; repeated misuse would repeat the
   error. Matches the plan's test, harmless.

## Issues (blocking)

None.

---

**VERDICT: PASS** — pinned SHA `e494ea1de8deb9999387b086cae3009cf4d3d4ed`.
No demonstrated defect on any traced attack path; DW-3.2 deviation ruled faithful to binding
D-2; test integrity verified byte-level; 6 non-blocking notes. Full gate (typecheck/test/build,
DW-3.8) remains with the verifier per dispatch.
