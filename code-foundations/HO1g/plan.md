# Plan: MS-1 — the gated root suite runs the `backup/` tests (HO1g)
**Created:** 2026-11-23
**Status:** ready
**Complexity:** simple
**Review cadence:** 3
**Check-ins:** quiet
---
## Context
`backup/restore.test.mjs` (4 tests) and `backup/test/unit/retention.test.js` (8 tests) run nowhere — not in CI, not
in `gate.sh` (root runs only `test:scripts` = `node --test --test-concurrency=1 "scripts/test/*.test.mjs"`). AC-6:
`npm run test:scripts` must execute them (names visible) and pass. Research: `code-foundations/HO1b/research.md`
(D8, HO1g facts). Independent of HO1b/HO1e (no shared file); land in any order.

## Constraints
- No existing test file or `test*` script modified/deleted/renamed (gate test guard); the root glob stays as is
  (spec); root `package.json` is not touched (nothing needs adding).
- No `skip`/`todo`.

---
## Implementation Phases

### Phase 1: HO1g — one new test file imports the backup tests
**Skills:** none -- a two-line test entry file; no design, error handling or control flow involved
**Model:** haiku
**Gate:** Minimal
**Depends on:** none
**File scope:** virtual-lab: scripts/test/backup-suite.test.mjs
**AC:** AC-6 · **Risk:** normal

**Goal:** `npm run test:scripts` runs and passes the 12 `backup/` tests.

**Scope:**
- IN: `scripts/test/backup-suite.test.mjs` = a header comment + `import '../../backup/restore.test.mjs';` +
  `import '../../backup/test/unit/retention.test.js';` (side-effect imports register their tests in this file's run).
- OUT: editing the backup tests, `package.json`, `gate.sh`, CI.

**Edge cases:** `retention.test.js` is ESM in a typeless `.js` → Node prints a one-time
`MODULE_TYPELESS_PACKAGE_JSON` warning and runs it (Node ≥ 20.19/22.12; the gate runs 24) — accepted, do not
"fix" it by adding `"type"` to the root `package.json`.

**Done when:**
- [ ] DW-1.1: `npm run test:scripts` output lists `a backup without the verified marker is refused on a dry run, named`
  and `keepDays must be a number` as passing, and its `tests` count is the base count + 12, `fail 0`, `skipped 0`.
- [ ] DW-1.2: `git diff --name-only --diff-filter=MDR origin/ms/1... -- scripts/test backup package.json` prints nothing.

---
## Test Coverage
**Level:** Per-phase (the file is itself the test entry; DW-1.1 is its check).
## Test Plan
- [ ] DW-1.1, DW-1.2 as above.
- [ ] Dirty: temporarily break one assertion locally in a scratch copy (not committed) → `npm run test:scripts`
  fails naming `backup/restore.test.mjs` — proves the tests really execute, not just import.
---
## Notes
- The lead updates ROADMAP row HO1g at landing.
- Once landed, every later gate run of HO1b/HO1e executes `backup/restore.test.mjs` — their hint change must keep it
  green (HO1b plan, Phase 2).
---
## Decided During Build
_Filled by /code-foundations:build — one row per decision an agent made or question it raised:_
| # | Phase | Decision or question | Source | Status |
---
## Execution Log
_To be filled during /code-foundations:build_
