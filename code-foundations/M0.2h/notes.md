# M0.2h — MeshFilter.mesh setter + late mesh assignment: notes (W3, 2026-11-18)

Plan: `plan.md`. Branch `M0.2h-meshrenderer-sharedmesh` (worktree `.workers/W3`).
Research complete; all file:line verified against master @1bc81ff.

## Research summary

**Task.** ROADMAP M0.2h, found during V1 pixel checks (`V1/notes.md:86-113`).
`MeshFilter.mesh` setter + late mesh assignment never drawn. Port Unity
semantics: the renderer follows the filter's current mesh; no per-frame polling
allocation; regression tests for the four V1 cases; CHANGELOG *Fixed*.

**The four V1 cases** (`V1/setters.js`, UnlitMaterial magenta cubes, centre pixel
read through `Application.captureFrame`):

| Assignment | Drawn today |
|---|---|
| `sharedMesh = m` → renderer + `sharedMaterial` | yes (regression guard) |
| `sharedMesh = m` → renderer + `.material` | yes (regression guard) |
| `filter.mesh = m` → renderer | **no** |
| renderer added first → `sharedMesh = m` | **no** |

**Root causes.**
- `MeshFilter.ts:68-78` — `set mesh` clones and nulls `_sharedMesh`;
  `MeshRenderer._syncGeometry` (`MeshRenderer.ts:189`) reads only `sharedMesh`.
- The renderer reads the filter only at `onAwake`/`updateMesh`; `addComponent`
  wakes it immediately on active objects → late assignment invisible. The JSDoc
  admits the deviation (`MeshRenderer.ts:150`).
- `Mesh._syncToThree:583-584` replaces the BufferGeometry → getter edits need a
  geometry re-read.
- The `_syncGeometry` no-mesh branch (`MeshRenderer.ts:184-187`) does not clear
  stale geometry.
- `Renderer.onEnable` is visibility-only → assign-while-inactive + reactivate
  never draws.
- Leaks: `set mesh` / `set sharedMesh` drop the old `_meshInstance` without
  destroying it.

**Correction to the V1 notes.** `V1/notes.md:109` ("none is visible-broken
today") is wrong: Kepler `SweptArea.ts:44-53,91-92` assigns the mesh while
inactive and reactivates — a live broken witness.

**Design.** Lead-approved; D1–D9 in `plan.md`. SceneSerializer order NOT touched
(onAwake-before-fields load-bearing per the M0.2a audit); `resolvePendingAssets`
late writes become visible via the fix. No editor change (no Mesh widget today;
`setRaw` goes through the setters). ScenarioCreator untouched (Kepler fixed by
engine semantics).

**Risks.** Clone lifecycle ownership; `sharedMesh` getter compatibility
(StaticBatching + the `Serialization.test.ts:2063-2074` no-instantiation pin);
the zero-alloc rule; `StaticBatchingUtility` reads `sharedMesh` only →
instance-only filters unbatched (known limitation, follow-up row, no scope
expansion).

## Build log

Engine worktree `.workers/W3/WebEngineTS`, branch `M0.2h-meshrenderer-sharedmesh`,
HEAD `cfe261f`, pushed. Three commits, tests first.

### P1 — tests first, `77df0cb`

`tests/MeshFilterMesh.test.ts`, 18 tests; **14 RED pre-fix**, 4 guards green:

- RED: setter-stores-reference, renderer-first, late sharedMesh, inactive-assign ×2,
  getter-edit, instance isolation, shared-mesh in-place edit, mesh=null undraw,
  sharedMesh=null undraw, 3 leak tests, sharedMesh-swap.
- Green guards: the two V1 `sharedMesh` cases plus the serialization no-instantiation
  pin and existing behaviour they cover.

### P2 — fix, `616829f`

`MeshFilter.ts` / `MeshRenderer.ts` / `Mesh.ts`, **+162/−50**.

- `set mesh` assigns the reference (Unity parity) + destroys the owned instance +
  notifies; `get mesh` clones once + notifies.
- Hook `MeshFilter._findRenderer` installed at the bottom of the `MeshRenderer`
  module (CLAUDE.md load-order convention).
- `_syncGeometry` reads `_effectiveMesh`, binds/unbinds `Mesh` observers; no-mesh →
  static `_emptyGeometry` + bounds reset.
- `onEnable` re-syncs (assign-while-inactive + reactivate draws).
- JSDoc rewritten (the deviation note at `MeshRenderer.ts:150` removed).

**Design deviation from plan #5 (lead-approved in build):** push observers instead
of a version counter — `Mesh._markDirty` replaces the 14 `_needsUpdate` sites and
fans out to a lazy `Set` of observers. Zero per-frame cost, no polling driver
needed; factory/clone sites stay direct.

### P3 — changelog, `cfe261f`

Engine `CHANGELOG.md` *Fixed* bullet; branch pushed.

## Verification

- Full suite **3017/3017** (185 files); typecheck **3 configs exit 0**; rollup build
  **exit 0**.
- Pixel re-verification via the V1 harness against the fixed worktree bundle:
  **5/5 DRAWN** — the 4 original V1 cases + inactiveAssign+reactivate (probe key
  renamed keplerOrder+reactivate by M0.2hr5). Logs
  `C:/Users/HuGox/AppData/Local/Temp/opencode/w3/m02-pixel-run1.txt` / `run2.txt`.
- V1 harness fixes shipped here: `run.mjs` stale-root bug (derives root from
  `import.meta.url`), `setters-m02h.js` added, `V1/notes.md` corrected — Kepler
  `SweptArea` **was** visible-broken (the earlier "none is visible-broken today"
  claim was wrong).

## Adversarial review — PASS, zero issues

11 hunt areas, 14 executed probes: observer lifecycle, `_markDirty` coverage, hook
null-safety, zero-alloc, instance lifecycle/double-destroy, `_emptyGeometry`,
serialization incl. AssetRef late-assign, `onEnable` recursion, test honesty,
scope, StaticBatching.

Non-blocking notes → known limitations / follow-ups (report § Known limitations):

1. Destroyed-mesh observer retention — editing a destroyed mesh re-draws it
   (Unity semantics undefined there; `destroyImmediate` skips the override,
   pre-existing).
2. `removeComponent(filter)` leaves the renderer drawing the last geometry until
   the renderer dies (Unity would undraw).
3. Getter-instance edits don't serialize — only `sharedMesh` is `@SerializedField`;
   Unity serializes the instance. Parity gap, future task.
4. `[...observers]` spread allocates per data write (not per-frame — fine).
5. `StaticBatchingUtility` ignores instance-only filters (pre-existing).

## Open item — release:local NOT run

W1/W2 active on editor branches; consumer delivery coordinated at a quiet window.
The A10b / M1.2 rows own the consumer bumps.
