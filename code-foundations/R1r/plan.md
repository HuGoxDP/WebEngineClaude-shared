# Plan: R1r — close the two untested DWs and document the store (review of R1)
**Created:** 2026-11-12 (W1, from `research.md` beside it)
**Status:** ready
**Complexity:** simple
**Review cadence:** 1
**Gate:** Standard for both phases (no engine or serializer work; the docs phase is Minimal)

## Context
R1 (OPFS project store) was merged on 2026-11-12. Claude's review of it left three findings: two of the
plan's "done when" items were closed by argument rather than by test (DW-2.2 unsupported, DW-2.3 quota), the
repo's guidance files never learnt where projects live, and the recorded e2e count predates B1 phase 1.
Research: `research.md` (D1–D3 are binding).

## Implementation Phases

### Phase 1: The two e2e scenarios (Standard)
**File scope:** `WebEngineTSEditor/app/e2e/run.mjs` (two new scenarios, no change to existing ones)
**Depends on:** none

**Goal:** the unsupported case and the quota case are pinned by tests that fail if the gate or the error
path regresses.

**Scope:**
- IN: scenario "no writer, no store: the browser store is not offered, and nothing is created" —
  `createWritable` hidden on the prototype by `Object.defineProperty` before load (an init script after
  `instrument`): step 3 has no location field (`.wiz-field` count 0), a folder project is still created and
  opens, `opfsEntries(page, "projects")` is empty. Then a second page with the picker **deleted** as well:
  the start screen shows the unsupported alert, the wizard never opens, no project folder exists.
  Scenario "a quota failure surfaces and keeps the edit unsaved" — create a browser-store project
  normally, make one edit, patch `createWritable` in-page so only `main.scene.json`'s writer rejects with
  a `QuotaExceededError`, Ctrl+S: the `scene.saveFailed` dialog names the error, the status is still
  "Unsaved", the dot is still there, and the scene file on disk is byte-identical to before.
- OUT: production code (R1 shipped it; a failure here is a defect to report, not to patch silently).

**Done when:**
- DW-1.1: both scenarios pass under `npm run e2e`, and each fails on purpose when its gate is removed
  (checked once by hand-patching the scenario, recorded in the notes).
- DW-1.2: no existing scenario or check changed (`git diff` on `run.mjs` is additions only).

### Phase 2: The repo learns where projects live (Minimal)
**File scope:** `WebEngineTSEditor/CLAUDE.md` (new), `WebEngineTSEditor/README.md` (testing section),
`WebEngineTSEditor/docs/integration-plan.md` (the R1 top-level note), `.claude-shared/ROADMAP.md` (R1r row),
`.claude-shared/code-foundations/R1r/notes.md` (new)
**Depends on:** Phase 1 (the recorded e2e count includes the new scenarios)

**Goal:** a fresh session (human or agent) can see, without reading R1, where projects live and how the
editor is tested.

**Scope:**
- IN: `CLAUDE.md` — what this repo is, where projects live (OPFS `projects/<id>`, the on-disk layout
  besides it), the `kind: 'disk' | 'browser'` recents with `handle: null` for browser, the Safari < 26
  limit (`createWritable` missing → *unsupported*), no `queryPermission`/`requestPermission` in the
  `ProjectStore` interface, and the checks command.
  `README.md` testing section: the two new scenarios and the manual Firefox/Safari smoke check, plus the
  recorded e2e count.
- OUT: code, i18n, anything under `app/src/`.

**Done when:**
- DW-2.1: `CLAUDE.md` states the four R1 facts (layout, recents `kind`, Safari < 26, no permission calls).
- DW-2.2: `README.md` names the two new scenarios, the manual browser check and the e2e count from this
  branch's run.
- DW-2.3: the ROADMAP row is `✅ <date> W1` with what landed; `notes.md` records the count, the deliberate
  divergence from the review's file names, and the two verifications of DW-1.1.

## Checks
- `WebEngineTSEditor`: `cd app && npm ci && npx ng build && npm run e2e` (with `E2E_PLAYWRIGHT_DIR` /
  `E2E_BROWSER_CHANNEL=chromium`, the build served at `http://localhost:8044/editor/`, inside
  `editor-e2e.lock`); the recorded count goes into the notes.
- `.claude-shared`: markdown only — no build checks; the junk check and the ROADMAP row are the gate.

## Assumptions
| Assumption | Confidence | Verify before | Fallback |
|---|---|---|---|
| Patching `FileSystemFileHandle.prototype.createWritable` from the page affects the editor's write path | high | phase 1 run | stub through the service's own seam (the review's alternative) and record which |
| A scenario's own `addInitScript` runs after `instrument`'s | high | phase 1 run (delete the picker) | set the picker to `undefined` in the init script itself and re-order |
| The e2e count grows by exactly the new checks | medium | phase 1 run | record the measured count and say so |
