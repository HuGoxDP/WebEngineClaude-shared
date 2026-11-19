# M0.2hr1 — MeshFilter self-assign guard: build notes (W3, 2026-11-19)

Branch `M0.2hr1-meshfilter-self-assign` in both repos. Engine worktree
`.workers/W3/WebEngineTS`, shared worktree `.workers/W3/.claude-shared`.
Research `research.md`, plan `plan.md`, report `report.md`.

## Phase 1 — tests first (commit `02d9231`)

`tests/MeshFilterMesh.test.ts` +5 tests (RED before the fix), the 18 existing
M0.2h tests in the file stay green:

1. `mesh = filter.mesh` (self-assign) keeps the owned instance alive and drawn —
   24 vertices stay drawn, `exists()` after `await Promise.resolve()` (zero-delay
   destroys drain in a microtask), `filter.mesh === inst`.
2. `sharedMesh = filter.mesh` keeps the mesh alive and drawn — same pins plus the
   renderer's geometry is the instance's own `_internalGeometry`.
3. The Unity edit idiom: read `filter.mesh`, edit `vertices`, assign back —
   edited x=5 reaches the drawn geometry, instance survives.
4. A second filter holding the instance as `sharedMesh` survives the owner's
   `mesh` self-assign.
5. Same for the owner's `sharedMesh` self-assign (owner then draws it as shared).

RED run on master source: exactly the 5 new tests fail (destroyed instance →
0 drawn vertices, `exists()` false); 18/18 existing pass. File: 18 pass + 5 fail
pre-fix, 23/23 after.

## Phase 2 — fix (commit `0c31c57`)

`src/engine/core/rendering/MeshFilter.ts` (+26/−7):

- `set mesh`: `value !== null && value === this._meshInstance` → keep the
  instance (the getter already returns it — no re-clone, nothing destroyed);
  else the previous path (`_destroyInstance()`, store reference).
  `_notifyRenderer()` unchanged, always.
- `set sharedMesh`: same guard, but self-assign stores the instance as
  `_sharedMesh` and nulls `_meshInstance` — the filter **relinquishes ownership**
  (Unity never auto-destroys an assigned mesh); else previous destroy-then-store.
- JSDoc on both setters: what self-assign keeps and what a swap to a different
  mesh / `null` still destroys.
- Engine `CHANGELOG.md`: corrected "Shared meshes are never destroyed by a
  swap" — appended the self-assign clause (M0.2hr1).

Checks after the fix: file 23/23, full suite **3022/3022 (185 files)**,
`npm run typecheck` exit 0, `npm run build` exit 0.

## Review — adversarial, PASS

Cases a–h checked (self-assign both forms, edit idiom, second-filter holders,
swap-to-different/null still destroys the owned instance, null semantics,
notification path, no re-clone on self-assign). RED re-executed independently on
master source: exactly the 5 new tests fail, nothing else. Serialization pin
**178/178** including the no-instantiation pin (`Serialization.test.ts:2063`);
StaticBatching **6/6**.

Non-blocking review notes:

- Destroyed-instance self-assign keeps a corpse: assigning back an
  already-destroyed instance stores it without reviving it. Pre-existing hazard
  class — on master the getter also returns destroyed instances; not a
  regression of this change. No action.
- Minor JSDoc wording nits only; semantics correct.

## Debug — final full green run (2026-11-19, on the task branch)

`origin/master` still `79a6faf` (no merge needed); `origin/main` (`e800ce1`)
already an ancestor of the shared branch (no merge needed).

```
> WebEngineTS@0.3.0 typecheck
> tsc --noEmit -p tsconfig.build.json && tsc --noEmit -p tsconfig.player.json && tsc --noEmit -p tsconfig.test.json
TYPECHECK_EXIT=0
```

```
 RUN  v4.1.4 E:/Projects/WebstormProjects/WebEngine/.workers/W3/WebEngineTS
 Test Files  185 passed (185)
      Tests  3022 passed (3022)
   Start at  20:45:04
   Duration  75.88s (transform 180.01s, setup 0ms, import 460.42s, tests 125.67s, environment 42ms)
TEST_EXIT=0
```

```
> rollup -c rollup.config.mjs
src/engine/index.ts → dist/WebEngineTS.esm.js, dist/WebEngineTS.cjs.js... created in 17s
src/engine/index.ts → dist/WebEngineTS.standalone.js... created in 27.7s
src/engine/index.ts → dist/WebEngineTS.d.ts... created in 7.4s
src/player/host/index.ts → dist/player-host.js... created in 10.1s
src/player/player/entry.ts → dist/player/player.js... created in 9.9s
src/player/host/index.ts → dist/player-host.d.ts... created in 2.1s
BUILD_EXIT=0
```

Junk check WebEngineTS: `git status --porcelain` empty;
`git diff --name-only origin/master...HEAD` = `CHANGELOG.md`,
`src/engine/core/rendering/MeshFilter.ts`, `tests/MeshFilterMesh.test.ts` — exactly.
