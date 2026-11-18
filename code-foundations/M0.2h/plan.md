# M0.2h — MeshFilter.mesh setter + late mesh assignment never drawn: plan (W3, 2026-11-18)

Research: `notes.md` § Research summary (file:line verified against master
@1bc81ff; found during V1 pixel checks, `code-foundations/V1/notes.md:86-113`).
Branch `M0.2h-meshrenderer-sharedmesh` in `WebEngineTS` (+ `.claude-shared`,
worktree `.workers/W3`). Repos: engine + shared docs. Commits at phase gates by
the lead; this plan's workers do not commit.

## Deliverables

1. Engine fix: `MeshFilter.mesh`/`sharedMesh` setters + `MeshRenderer` follows the
   filter's current mesh (design D1–D9). No per-frame polling allocation.
2. `WebEngineTS/tests/MeshFilterMesh.test.ts` — regression tests: the four V1
   cases (`V1/setters.js`) + getter-edit + null-undraw + inactive-reactivate +
   leak checks.
3. CHANGELOG *Fixed* bullet (Kepler sectors now draw; existing content unaffected).
4. `code-foundations/M0.2h/` plan + notes; adversarial review; pixel
   re-verification via `V1/run.mjs` + `setters.js`.

## Design (lead-approved)

- **D1** `set mesh` assigns the reference (no clone), stores it as shared,
  destroys the owned instance first.
- **D2** `get mesh` unchanged (instantiate once); the renderer reads the effective
  mesh (`_meshInstance ?? _sharedMesh`) via an internal accessor. Public
  `sharedMesh` getter unchanged — StaticBatching and the no-instantiation pin
  (`Serialization.test.ts:2063-2074`) depend on it.
- **D3** `set sharedMesh` destroys the owned instance, notifies.
- **D4** Filter→renderer push notification or version compare; zero per-frame
  allocation (LineRenderer dirty-set pattern acceptable).
- **D5** Mesh geometry-replacement version/identity check
  (`Mesh._syncToThree:583-584` replaces the BufferGeometry) so getter edits re-sync.
- **D6** The `_syncGeometry` no-mesh branch (`MeshRenderer.ts:184-187`) clears
  stale geometry.
- **D7** `onEnable` re-syncs geometry (assign-while-inactive + reactivate draws).
- **D8** `updateMesh()`/`forceUpdate` stay.
- **D9** The JSDoc deviation note (`MeshRenderer.ts:150`) rewritten.

Out of scope: SceneSerializer order (onAwake-before-fields load-bearing per the
M0.2a audit; `resolvePendingAssets` late writes become visible via the fix);
editor (no Mesh widget today, `setRaw` goes through the setters); ScenarioCreator
(Kepler fixed by engine semantics).

## Phase 1 — tests first (RED)

**File scope:** `WebEngineTS/tests/MeshFilterMesh.test.ts` (new). **Model:** this
worker. **Gate:** Standard.

Tests, each naming the contract it pins:
1. `sharedMesh = m` → renderer + `sharedMaterial` drawn (V1 row 1, regression guard).
2. `sharedMesh = m` → renderer + `.material` drawn (V1 row 2, regression guard).
3. `filter.mesh = m` → renderer drawn (V1 row 3, RED today).
4. renderer added first → `sharedMesh = m` drawn (V1 row 4, RED today).
5. getter edit (`filter.mesh` vertex edit) reaches the screen (geometry re-sync).
6. `mesh = null` / `sharedMesh = null` clears stale geometry (undraw).
7. assign while inactive + reactivate drawn (Kepler SweptArea pattern).
8. leak checks: old owned instance destroyed on `set mesh` / `set sharedMesh`
   reassignment.

**DW:** the new tests run; the RED list recorded in `notes.md` (rows 3–4 confirmed
RED by V1; cases 5–8 expected RED from the root causes — confirm at run time);
the existing suite untouched and green; commit at the gate.

## Phase 2 — the fix

**File scope:** `MeshFilter.ts`, `MeshRenderer.ts`, `Mesh.ts` (version/identity if
needed), the internal effective-mesh accessor. **Depends on:** phase 1.
**Model:** this worker. **Gate:** Standard.

- Implement D1–D9. Effective-mesh accessor internal; public `sharedMesh` getter
  behaviour unchanged.
- Zero per-frame allocation: push notification or version compare only.
- Both setters destroy the owned `_meshInstance` before replacing it (leak fix);
  never destroy a shared asset.

**DW:** full `npm test` green (the phase-1 RED list now passes), typecheck green,
build green. An existing-test failure = STOP, escalate to the lead, do not patch
around it. Commit at the gate.

## Phase 3 — report + push (Minimal)

**File scope:** `.claude-shared/CHANGELOG.md` (*Fixed* bullet), `notes.md`.
**Depends on:** phase 2.

- CHANGELOG *Fixed*: `MeshFilter.mesh` setter and late mesh assignment now draw;
  Kepler sectors now draw; existing content unaffected.
- ROADMAP row at merge (lead).
- Push the branch.

**DW:** the bullet written; the branch pushed; notes updated.

## Review + verification (after P3)

- Adversarial review (read-only subagent): clone lifecycle ownership, `sharedMesh`
  getter compatibility, the serialization no-instantiation pin, the zero-alloc rule.
- Pixel re-verification: `V1/run.mjs` + `setters.js`, all four rows drawn.
  Prerequisite: `run.mjs:7` stale path `C:/Users/HuGox/WebstormProjects/WebEngine`
  → `E:/Projects/WebstormProjects/WebEngine` — the file is in `.claude-shared`,
  the lead handles it.
- `release:local` decision at merge: consumers get the fix only through it;
  W1/W2 active on the editor — coordinate, do not run it unilaterally.

## Risks / known limitations

- Clone lifecycle ownership: D1–D3 destroy owned instances only, never shared assets.
- `sharedMesh` getter compatibility: StaticBatching + the serialization pin (D2).
- Zero-alloc rule: no per-frame polling allocation (D4).
- `StaticBatchingUtility` reads `sharedMesh` only → instance-only filters stay
  unbatched. Known limitation; effective-mesh follow-up row, no scope expansion here.
