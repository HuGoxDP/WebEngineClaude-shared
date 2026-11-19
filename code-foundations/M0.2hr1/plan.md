# M0.2hr1 plan — MeshFilter self-assign guard

Branch `M0.2hr1-meshfilter-self-assign` (WebEngineTS + .claude-shared). Model: build (sonnet-class), gates review. Research: `research.md`.

## Phase 1 — tests first (RED)
File scope: `tests/MeshFilterMesh.test.ts` (WebEngineTS).
Add tests (additive, existing 18 untouched):
1. `filter.mesh = filter.mesh` after getter-edit keeps 24 drawn vertices, `inst.exists()` true after `await Promise.resolve()`, `filter.mesh === inst`.
2. `filter.sharedMesh = filter.mesh` keeps 24 drawn vertices, `inst.exists()` true after microtask, `filter.sharedMesh === inst`; renderer draws inst geometry.
3. Unity edit idiom end-to-end: `const m = filter.mesh; m.vertices = edited; filter.mesh = m;` → edited data still drawn (posCount 24, edited coordinate visible).
4. Cross-filter: filterB.sharedMesh = filterA.mesh (the instance); filterA self-assigns (`filterA.mesh = inst` and separately `filterA.sharedMesh = inst`) → filterB still draws 24, inst.exists() true.
Gate: Standard. DW: new tests FAIL on origin/master code (run `npx vitest run tests/MeshFilterMesh.test.ts`, capture the failing list); existing tests pass.

## Phase 2 — fix + docs
File scope: `src/engine/core/rendering/MeshFilter.ts`, `CHANGELOG.md` (WebEngineTS).
- Both setters: self-assign guard per research D1/D2, then `_notifyRenderer()`.
- JSDoc both setters: what a swap still destroys + self-assign exception (D3).
- CHANGELOG.md:89: replace "Shared meshes are never destroyed by a swap." with a sentence that is true: swaps never destroy shared assets, and assigning the filter's own instance back (either setter) keeps it alive; a swap to a different mesh or null still destroys the owned instance.
Gate: Standard. DW: full `npm test` green (3017 + new), `npm run typecheck` 0, `npm run build` 0.

## Phase 3 — report + ROADMAP (Minimal)
File scope: .claude-shared: ROADMAP.md (M0.2hr1 row → ✅ date W3 + what landed), code-foundations/M0.2hr1/{research,plan,notes,report}.md, CHANGELOG.md entry.
Gate: Minimal. Junk check both repos; push both branches.

## Review + merge
Adversarial review of phases 1-2 (review agent) before merge; full Debug (typecheck + test + build) on synced branch; merge engine first, .claude-shared last, per RULES step 9.
