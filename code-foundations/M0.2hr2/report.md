# M0.2hr2 — two stale-renderer holes (destroyed filter, silent bounds): task report (W3, 2026-11-19)

Task: M0.2hr2 — Claude review finding on M0.2h (ROADMAP M1, ½ d). Two holes
left the renderer showing stale state: (1) a destroyed `MeshFilter` kept being
drawn and a replacement filter was never found — `updateMesh()` re-found the
filter only when its cache was `null`, not destroyed; (2) `mesh.bounds = ...`
and `mesh.recalculateBounds()` notified no observer, so
`renderer.localBounds`/`bounds` kept the extents of the last data write
(measured: getter edit ×10 + `recalculateBounds()` → mesh max.x 5, renderer
0.5). Closes limitation #2 of `code-foundations/M0.2h/report.md` (:88-89).

Branch `M0.2hr2-stale-renderer-holes` in both repos.
Worktrees: `.workers/W3/WebEngineTS` (engine HEAD `1506543` + CHANGELOG
commit), `.workers/W3/.claude-shared` (docs, this commit).
Research `research.md`, plan `plan.md`, build log `notes.md`.

## What landed

- **Phase 1 — `41922c2`** (engine): `tests/MeshFilterMesh.test.ts` +4 tests
  (+74), RED before the fix (23 existing pass). Destroying the filter undraws
  without a manual kick; a replacement filter with a sphere mesh draws the
  sphere (561 vertices); `recalculateBounds()` after an in-place getter edit
  and the `bounds` setter both reach `renderer.localBounds` automatically.
  The propagation assertions come **before** any manual `forceUpdate` — a
  manual update would mask the holes; trailing `forceUpdate` guards keep the
  manual path pinned.
- **Phase 2 — `1506543`** (engine, 3 files +20 −4): `MeshRenderer.updateMesh()`
  re-find guard → `_meshFilter === null || !_meshFilter.exists()` (:180),
  JSDoc rewritten; `MeshFilter.onDestroy` notifies the renderer after nulling
  its meshes → immediate undraw (safe: still attached, `exists()` true during
  `onDestroy`, meshes already null → undraw branch); replacement re-found via
  `getComponent` (skips destroyed). `Mesh`: notify-only `_notifyObservers()`
  extracted from `_markDirty` (no `_needsUpdate` → no geometry rebuild),
  called from `set bounds` and both `recalculateBounds()` exits;
  `_syncGeometry` copies `mesh.bounds` unconditionally. Known limitation
  preserved (Unity parity): in-place mutation via the live `bounds` getter
  needs explicit `recalculateBounds()`/re-assign.
- **Phase 3 — docs (this commit + engine CHANGELOG commit)**: ROADMAP row ✅,
  cross-project CHANGELOG entry, engine CHANGELOG entry, this report +
  `notes.md`.

Engine commits (`git log --oneline origin/master..HEAD`):

```
4897977 docs(M0.2hr2): CHANGELOG entry for stale-renderer fixes
1506543 fix(M0.2hr2): re-find destroyed MeshFilter; notify renderer on bounds changes
41922c2 test(M0.2hr2): RED tests for destroyed-filter and stale-bounds renderer holes
```

Engine diffstat (`git diff --stat origin/master...HEAD`):

```
 CHANGELOG.md                              |  2 ++
 src/engine/core/graphics/Mesh.ts          | 12 ++++++++++++
 src/engine/core/rendering/MeshFilter.ts   |  2 ++
 src/engine/core/rendering/MeshRenderer.ts | 10 ++++++----
 tests/MeshFilterMesh.test.ts              | 74 +++++++++++++++++++++++++++++++
 5 files changed, 96 insertions(+), 4 deletions(-)
```

## Checks (final full run on the task branch, 2026-11-19, HEAD `4897977`)

- `npx vitest run tests/MeshFilterMesh.test.ts` — **27/27**, exit 0 (1.56s).
- `npm run typecheck` — exit 0 (build, player, test configs).
- `npm test` — **Test Files 185 passed (185), Tests 3026 passed (3026)**,
  duration 44.91s, exit 0. (Build-phase gate run: 40.5s — same counts.)
- `npm run build` — all 6 rollup bundles created (esm/cjs, standalone, engine
  d.ts, player-host js + d.ts, player js), exit 0.
- No merge needed for the checks: merge-base with `origin/master` is
  `b5e9d2c` (the M0.2hr1 merge); shared `origin/main` (`6ea1939`) already an
  ancestor.

## Review verdict

Adversarial review **PASS** — cases R1–R7 + A1–A6 (destroy-undraw timing incl.
the `exists()`-still-true window in `onDestroy`, replacement re-find,
`getComponent` skipping destroyed, notify-only path with no `_needsUpdate`
and no rebuild, both `recalculateBounds()` exits, bounds-setter notify,
`_markDirty` unchanged for data writes, JSDoc, no M0.2h/M0.2hr1 regression).
RED re-executed independently via `git revert --no-commit` of the fix: all 4
failure signatures reproduced (drawn 24→0, sphere mismatch, `localBounds.max.x`
0.5→5, `equals` false→true), worktree restored exactly. Non-blocking notes
(empty-mesh `recalculateBounds()` notify path untested — trace-verified;
`set bounds` notifies even when equal — harmless extra sync) in `notes.md`.

## Junk checks

- WebEngineTS: `git status --porcelain` empty;
  `git diff --name-only origin/master...HEAD` = exactly `CHANGELOG.md`,
  `src/engine/core/graphics/Mesh.ts`, `src/engine/core/rendering/MeshFilter.ts`,
  `src/engine/core/rendering/MeshRenderer.ts`, `tests/MeshFilterMesh.test.ts`.
- .claude-shared: `git status --porcelain` empty after the docs commit;
  `git diff --name-only origin/main...HEAD` = `ROADMAP.md`, `CHANGELOG.md`,
  `code-foundations/M0.2hr2/plan.md`, `code-foundations/M0.2hr2/research.md`,
  `code-foundations/M0.2hr2/notes.md`, `code-foundations/M0.2hr2/report.md` only.

## ROADMAP row (new text)

> ✅ 2026-11-19 W3 — destroying a MeshFilter undraws immediately and a replacement filter is re-found (updateMesh guard `null || !exists()`, onDestroy notify); `set bounds` + `recalculateBounds()` (both exits) notify via notify-only `_notifyObservers()` (no geometry rebuild) and the renderer copies bounds; live-getter in-place mutation stays manual (Unity parity, documented); closes M0.2h limitation #2; 4 new tests (RED→GREEN), suite 3026/3026, typecheck + build clean; adversarial review PASS with independent RED re-execution. Report code-foundations/M0.2hr2/report.md

## Open items

None blocking. Non-blocking review notes in `notes.md` (empty-mesh notify
path untested; equal-bounds notify is a harmless extra sync).

Merge into master?