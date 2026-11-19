# M0.2hr2 — stale-renderer holes: build notes (W3, 2026-11-19)

Branch `M0.2hr2-stale-renderer-holes` in both repos. Engine worktree
`.workers/W3/WebEngineTS`, shared worktree `.workers/W3/.claude-shared`.
Research `research.md`, plan `plan.md`, report `report.md`.
Closes limitation #2 of `code-foundations/M0.2h/report.md` (:88-89).

## Phase 1 — tests first (commit `41922c2`)

`tests/MeshFilterMesh.test.ts` +4 tests (+74 lines, RED before the fix), the
23 existing tests (18 M0.2h + 5 M0.2hr1) stay green. New describe block
"M0.2hr2: stale renderer holes":

1. T1 `destroyed MeshFilter stops drawing`: `filter.destroyImmediate()` →
   `posCount(renderer) === 0` **without any manual kick**; trailing
   `forceUpdate()` guard keeps it 0.
2. T2 `renderer picks up replacement MeshFilter after destroy`: destroy the
   filter, `go.addComponent(MeshFilter).sharedMesh = Mesh.createSphere()` →
   drawn geometry is the sphere's `_internalGeometry`, vertex count 561
   (33×17 default segments).
3. T3 `recalculateBounds propagates to renderer after in-place position
   edit`: live vertices getter, `v.x *= 10` per vertex, `recalculateBounds()`
   → `mesh.bounds.max.x === 5` **and** `renderer.localBounds.max.x === 5`
   before any manual update.
4. T4 `bounds setter notifies renderer`: `mesh.bounds = new Bounds(...)` →
   `renderer.localBounds.equals(assigned)` before any manual update.

Design note: the propagation assertions come **BEFORE** any manual
`forceUpdate` — a manual update re-reads the filter and re-copies bounds,
which would mask the missing notification (the very holes being pinned).
The trailing `forceUpdate` guards keep the manual path pinned too.

RED run on pre-fix source (review re-executed independently via
`git revert --no-commit` of the fix): all 4 new tests fail with exactly the
expected signatures — drawn 24→0 missing on T1 (filter keeps drawing),
sphere mismatch on T2 (replacement never found), `localBounds.max.x`
0.5→5 missing on T3, `equals` false→true missing on T4. Existing 23 pass.
Worktree restored exactly afterwards.

## Phase 2 — fix (commit `1506543`, 3 files +20 −4)

- `src/engine/core/rendering/MeshRenderer.ts` (+6/−4): `updateMesh()` re-find
  guard → `if (this._meshFilter === null || !this._meshFilter.exists())`
  (:180); JSDoc rewritten — destroying the filter undraws immediately and the
  next update re-finds a replacement; the stale "manual call after shared-mesh
  edit" remark dropped (observer wiring syncs those). `_onMeshEdited` →
  `_syncGeometry` copies `mesh.bounds` unconditionally (:225) — that is what
  the notify-only path rides on.
- `src/engine/core/rendering/MeshFilter.ts` (+2): `onDestroy()` calls
  `this._notifyRenderer()` after `_destroyInstance()` + `_sharedMesh = null`,
  before `super.onDestroy()`. Safe per research: during `onDestroy` the filter
  is still attached and `exists()` true, so the notify re-syncs the OLD filter
  whose meshes are null → `_syncGeometry` null branch undraws. The replacement
  is re-found later via `!exists()` (`getComponent` skips destroyed).
- `src/engine/core/graphics/Mesh.ts` (+12): observer-notify loop extracted
  from `_markDirty` into notify-only `_notifyObservers()` (does NOT set
  `_needsUpdate` → `_internalGeometry` does not rebuild). Called from
  `set bounds` and both `recalculateBounds()` exits (empty-mesh early return
  and normal `setMinMax`). `_markDirty` keeps its dirty flag and reuses the
  loop.
- Known limitation preserved (documented, Unity parity): the `bounds` getter
  returns the live `_bounds` reference; in-place mutation of it notifies
  nothing — `recalculateBounds()` or re-assigning `mesh.bounds` is the
  supported path.
- Phase 3 docs commit adds the engine `CHANGELOG.md` entry (precedent M0.2hr1
  put its CHANGELOG sentence in the fix commit; this task's fix commit was
  src-only, so the entry lands with the report phase — same final file set).

Checks after the fix: file 27/27, full suite **3026/3026 (185 files)**,
`npm run typecheck` exit 0 (build, player, test configs), `npm run build`
exit 0.

## Review — adversarial, PASS

Cases R1–R7 + A1–A6 checked (destroy-undraw timing incl. the
`exists()`-still-true window inside `onDestroy`, replacement re-find,
`getComponent` skipping destroyed components, notify-only path setting no
`_needsUpdate` (no geometry rebuild), both `recalculateBounds()` exits,
bounds-setter notify, `_markDirty` unchanged for data writes, JSDoc accuracy,
no regression of M0.2h/M0.2hr1 semantics). RED re-executed independently via
`git revert --no-commit` of the fix on the branch: all 4 failure signatures
reproduced (24→0, sphere mismatch, 0.5→5, false→true), worktree restored
exactly, suite green again.

Non-blocking review notes:

- Empty-mesh `recalculateBounds()` notify path untested — trace-verified
  (early return now notifies; no test drives an empty drawn mesh). No action.
- `set bounds` notifies even when the assigned box equals the current one —
  a harmless extra sync, no rebuild (notify-only). No action.

## Debug — final full green run (2026-11-19, on the task branch, HEAD `4897977`)

`origin/master` at `b5e9d2c` (merge-base; no merge needed for the checks).

```
 RUN  v4.1.4 E:/Projects/WebstormProjects/WebEngine/.workers/W3/WebEngineTS
 Test Files  1 passed (1)
      Tests  27 passed (27)
   Start at  21:40:44
   Duration  1.56s
FILE_EXIT=0
```

```
> WebEngineTS@0.3.0 typecheck
> tsc --noEmit -p tsconfig.build.json && tsc --noEmit -p tsconfig.player.json && tsc --noEmit -p tsconfig.test.json
TYPECHECK_EXIT=0
```

```
 RUN  v4.1.4 E:/Projects/WebstormProjects/WebEngine/.workers/W3/WebEngineTS
 Test Files  185 passed (185)
      Tests  3026 passed (3026)
   Start at  21:41:05
   Duration  44.91s (transform 64.10s, setup 0ms, import 288.84s, tests 67.55s, environment 26ms)
TEST_EXIT=0
```

```
> rollup -c rollup.config.mjs
src/engine/index.ts → dist/WebEngineTS.esm.js, dist/WebEngineTS.cjs.js... created in 7.8s
src/engine/index.ts → dist/WebEngineTS.standalone.js... created in 14.1s
src/engine/index.ts → dist/WebEngineTS.d.ts... created in 3.7s
src/player/host/index.ts → dist/player-host.js... created in 5.4s
src/player/player/entry.ts → dist/player/player.js... created in 4.8s
src/player/host/index.ts → dist/player-host.d.ts... created in 954ms
BUILD_EXIT=0
```

Junk check WebEngineTS: `git status --porcelain` empty after the CHANGELOG
commit; `git diff --name-only origin/master...HEAD` = `CHANGELOG.md`,
`src/engine/core/graphics/Mesh.ts`, `src/engine/core/rendering/MeshFilter.ts`,
`src/engine/core/rendering/MeshRenderer.ts`, `tests/MeshFilterMesh.test.ts` —
exactly. Junk check .claude-shared: `git status --porcelain` empty after the
docs commit.