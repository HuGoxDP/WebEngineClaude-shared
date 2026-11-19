# M0.2hr1 — MeshFilter self-assign destroys the assigned mesh: task report (W3, 2026-11-19)

Task: M0.2hr1 — Claude review finding on M0.2h. Both `MeshFilter` setters
destroyed the mesh being assigned when it was the filter's own instance
(`filter.mesh = filter.mesh` / the Unity edit idiom, and
`filter.sharedMesh = filter.mesh`): `_destroyInstance()` ran before storing
`value`, clearing the very mesh stored — the object undrew (24 → 0 drawn
vertices) and `sharedMesh` held a destroyed empty mesh; a second filter holding
the copy as its `sharedMesh` lost it too when the owner swapped.

Branch `M0.2hr1-meshfilter-self-assign` in both repos.
Worktrees: `.workers/W3/WebEngineTS` (engine HEAD `0c31c57`),
`.workers/W3/.claude-shared` (docs, this commit).
Research `research.md`, plan `plan.md`, build log `notes.md`.

## What landed

- **Phase 1 — `02d9231`** (engine): `tests/MeshFilterMesh.test.ts` +5 tests,
  RED before the fix (18 existing pass). Both self-assign forms keep 24 drawn
  vertices and `exists()` after a microtask drain; the Unity edit idiom
  (read → edit → assign back) keeps the edited geometry drawn; a second filter
  holding the instance as `sharedMesh` survives either self-assign form.
- **Phase 2 — `0c31c57`** (engine): guard in both setters —
  `value !== null && value === this._meshInstance` skips the destroy:
  `mesh =` keeps ownership (getter returns the instance, no re-clone);
  `sharedMesh =` stores it as `_sharedMesh` and relinquishes ownership
  (Unity parity: an assigned mesh is never auto-destroyed). Swap to a different
  mesh or to `null` still destroys the owned instance. JSDoc on both setters
  documents the semantics; engine CHANGELOG sentence corrected. +26/−7
  `MeshFilter.ts`, +83 tests, 1-line CHANGELOG fix.
- **Phase 3 — docs (this commit)**: ROADMAP row ✅, cross-project CHANGELOG
  entry, this report + `notes.md`.

Engine commits (`git log --oneline origin/master..HEAD`):

```
0c31c57 fix: MeshFilter self-assign keeps the assigned instance alive (M0.2hr1 phase 2)
02d9231 test: pin MeshFilter self-assign destruction (M0.2hr1 phase 1, RED)
```

Engine diffstat (`git diff --stat origin/master...HEAD`):

```
 CHANGELOG.md                            |  2 +-
 src/engine/core/rendering/MeshFilter.ts | 33 ++++++++++---
 tests/MeshFilterMesh.test.ts            | 83 +++++++++++++++++++++++++++++++++
 3 files changed, 110 insertions(+), 8 deletions(-)
```

## Checks (final full run on the task branch, 2026-11-19)

- `npm run typecheck` — exit 0 (build, player, test configs).
- `npm test` — **Test Files 185 passed (185), Tests 3022 passed (3022)**,
  duration 75.88s, exit 0.
- `npm run build` — all 6 rollup bundles created (esm/cjs, standalone, engine
  d.ts, player-host js + d.ts, player js), exit 0.
- No merge needed: `origin/master` still `79a6faf`; shared `origin/main`
  (`e800ce1`) already an ancestor.

## Review verdict

Adversarial review **PASS** — cases a–h (both self-assign forms, edit idiom,
second-filter holders both forms, swap-to-different/null still destroys, null
semantics, notification path, no re-clone). RED re-executed independently on
master source: exactly the 5 new tests fail. Serialization pin **178/178**
incl. the no-instantiation pin; StaticBatching **6/6**. Non-blocking notes
(destroyed-instance self-assign keeps a corpse — pre-existing hazard class;
minor JSDoc wording) in `notes.md`.

## Junk checks

- WebEngineTS: `git status --porcelain` empty;
  `git diff --name-only origin/master...HEAD` = exactly `CHANGELOG.md`,
  `src/engine/core/rendering/MeshFilter.ts`, `tests/MeshFilterMesh.test.ts`.
- .claude-shared: `git status --porcelain` empty after the docs commit;
  `git diff --name-only origin/main...HEAD` = `ROADMAP.md`, `CHANGELOG.md`,
  `code-foundations/M0.2hr1/plan.md`, `code-foundations/M0.2hr1/research.md`,
  `code-foundations/M0.2hr1/notes.md`, `code-foundations/M0.2hr1/report.md` only.

## ROADMAP row (new text)

> ✅ 2026-11-19 W3 — both MeshFilter setters keep the assigned instance alive on self-assign (mesh = keeps ownership; sharedMesh = relinquishes it, Unity parity); swap-to-different/null still destroys the owned instance; JSDoc + CHANGELOG corrected; 5 new tests (RED→GREEN), suite 3022/3022, typecheck + build clean; adversarial review PASS. Report code-foundations/M0.2hr1/report.md

## Open items

None.

Merge into master?
