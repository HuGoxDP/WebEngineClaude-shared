# M0.2h — MeshFilter.mesh setter + late mesh assignment: task report (W3, 2026-11-18)

Objective: `MeshRenderer` drew only a mesh it saw at wake time through `sharedMesh` —
`filter.mesh = m` was never drawn, edits through the `mesh` getter never reached the
screen, and a mesh assigned after `addComponent(MeshRenderer)` on an active object
stayed invisible. Port Unity's semantics: both setters work in any order, the
renderer follows the filter's current mesh, no per-frame polling allocation.
Found by the V1 pixel check (`V1/notes.md` § Found on the way).

Research and plan `plan.md`, build log `notes.md`. Branch `M0.2h-meshrenderer-sharedmesh`
in both repos; engine worktree `.workers/W3/WebEngineTS` HEAD `cfe261f`, pushed.
Pixel logs: `C:/Users/HuGox/AppData/Local/Temp/opencode/w3/m02-pixel-run1.txt` / `run2.txt`.

## What landed

Engine (3 commits, tests first):

- `77df0cb` — phase 1: `tests/MeshFilterMesh.test.ts`, 18 tests, **14 RED pre-fix**
  (setter-stores-reference, renderer-first, late sharedMesh, inactive-assign ×2,
  getter-edit, instance isolation, shared-mesh in-place edit, mesh=null undraw,
  sharedMesh=null undraw, 3 leak tests, sharedMesh-swap), 4 guards green.
- `616829f` — phase 2: the fix, `MeshFilter.ts` / `MeshRenderer.ts` / `Mesh.ts`
  **+162/−50** (design below).
- `cfe261f` — phase 3: engine `CHANGELOG.md` *Fixed* bullet; branch pushed.

Shared repo (this commit): this report, `notes.md` build log, ROADMAP M0.2h ✅,
cross-project CHANGELOG entry, V1 harness fixes (`run.mjs` stale-root bug fixed —
derives root from `import.meta.url`; `setters-m02h.js` added; `V1/notes.md`
corrected — see below).

## Root causes

1. `set mesh` cloned and nulled `_sharedMesh`, while `MeshRenderer._syncGeometry`
   read only `sharedMesh` — setter assignments invisible.
2. The renderer read the filter only at `onAwake`/`updateMesh`; `addComponent` wakes
   immediately on active objects, so late assignment was never seen (the JSDoc
   admitted the deviation).
3. `Mesh._syncToThree` replaces the BufferGeometry — getter edits need a geometry
   re-read, which nothing triggered.
4. The no-mesh branch kept stale geometry; `Renderer.onEnable` was visibility-only,
   so assign-while-inactive + reactivate never drew.
5. `set mesh` / `set sharedMesh` dropped the old `_meshInstance` without destroying
   it — instance leaks.

## Design and the deviation from plan #5

`set mesh` assigns the reference (Unity parity), destroys the owned instance,
notifies; `get mesh` clones once and notifies. `MeshFilter._findRenderer` hook
installed at the bottom of the `MeshRenderer` module (CLAUDE.md load-order
convention). `_syncGeometry` reads `_effectiveMesh`, binds/unbinds `Mesh` observers;
no-mesh → static `_emptyGeometry` + bounds reset; `onEnable` re-syncs. JSDoc rewritten.

Plan #5 proposed a version counter; the build used **push observers** instead
(lead-approved): `Mesh._markDirty` replaces the 14 `_needsUpdate` sites and fans
out to a lazy observer `Set`. Zero per-frame cost — no polling driver needed at
all; factory/clone sites stay direct. The plan's constraint ("no per-frame polling
allocation") is met strictly: the per-frame path allocates nothing.

SceneSerializer order untouched (onAwake-before-fields load-bearing per the M0.2a
audit); `resolvePendingAssets` late writes become visible via the fix. No editor
change (no Mesh widget today; `setRaw` goes through the setters). ScenarioCreator
untouched — Kepler is fixed by the engine semantics.

## The Kepler correction

`V1/notes.md` claimed "none is visible-broken today". Wrong: Kepler `SweptArea.ts`
assigns its mesh while inactive and reactivates — a live broken witness, its swept
sectors silently missing from renders. Corrected in `V1/notes.md`; the new
inactive-assign+reactivate pixel case covers exactly this pattern.

## Verification

- Full suite **3017/3017** (185 files); typecheck **3 configs exit 0**; rollup
  build **exit 0**.
- Pixel re-verification via the V1 harness against the fixed worktree bundle:
  **5/5 DRAWN** — the 4 original V1 cases + inactiveAssign+reactivate (the Kepler
  SweptArea pattern). Logs `w3/m02-pixel-run1.txt` / `run2.txt`.
  (Correction 2026-11-19, M0.2hr5: the parenthetical claim was wrong — case 5
  deactivated the object *before* adding the components, so it was a wake-time-read
  duplicate of case 3's mechanism, not the Kepler order. M0.2hr5 rewrote case 5 in
  the real SweptArea order (components added active, deactivate, `sharedMesh`
  assigned while inactive, reactivate) and re-verified 5/5 DRAWN on the HEAD bundle.
  Coverage proof: the push notify (`set sharedMesh` → `_notifyRenderer` →
  `updateMesh`, no active gate) is load-bearing; the `onEnable` re-sync is a
  redundant second safety net — deleting either alone leaves 5/5 DRAWN, deleting
  **both** fails cases 4+5 only. Report `code-foundations/M0.2hr5/report.md`.)
- Adversarial review: **PASS, zero issues** — 11 hunt areas, 14 executed probes
  (observer lifecycle, `_markDirty` coverage, hook null-safety, zero-alloc,
  instance lifecycle/double-destroy, `_emptyGeometry`, serialization incl. AssetRef
  late-assign, `onEnable` recursion, test honesty, scope, StaticBatching).

## Known limitations / follow-ups (non-blocking, from the review notes)

1. Destroyed-mesh observer retention: editing a destroyed mesh re-draws it. Unity
   semantics are undefined there; `destroyImmediate` skips the override
   (pre-existing).
2. `removeComponent(filter)` leaves the renderer drawing the last geometry until
   the renderer dies; Unity would undraw.
3. Getter-instance edits don't serialize — only `sharedMesh` is `@SerializedField`,
   while Unity serializes the instance. Parity gap, future task.
4. `[...observers]` spread allocates per data write — not per-frame; acceptable.
5. `StaticBatchingUtility` ignores instance-only filters (pre-existing).

## Open item — release:local

NOT run: W1/W2 are active on editor branches; consumer delivery is coordinated at
a quiet window. The A10b / M1.2 ROADMAP rows own the consumer bumps.