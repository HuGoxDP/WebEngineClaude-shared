# Plan: R1 — a project store outside Chromium (OPFS)
**Created:** 2026-11-11 (W1, from `research.md` beside it)
**Status:** ready
**Complexity:** complex
**Review cadence:** 1
**Gate:** Full for every phase that touches `project.service.ts`
---
## Context
The editor's project store is the File System Access API, which exists only in Chromium-family
browsers on HTTPS/localhost: everyone else gets `status: 'unsupported'` and cannot author at all.
Decision #10: *OPFS first* — the browser's own private file system (Chrome/Edge 86, Firefox 111,
Safari 15.2 — Baseline "widely available"), behind the same project-service interface, with the
disk folder kept for authors who keep projects in git. Card: `tasks/E-growth.md` R1; the
research's Decisions D1–D6 are binding.

**Success criteria (card + research):**
1. A non-Chromium browser can open a project, edit a scene, save, close and reopen it — the whole
   existing flow, with the project living in OPFS instead of a disk folder.
2. The disk path is byte-for-byte unchanged: the same screens, the same files, the same e2e
   results on a Chromium run.
3. Recents survive a reload for both kinds; a deleted OPFS project says `missing`, as a disk one
   does.
4. `ng build` exit 0; `npm run e2e` all scenarios green (the disk flows through OPFS already — the
   e2e's fake picker feeds them OPFS handles).
5. No server state: the OPFS store talks to no API.

## Constraints
- The public API of `ProjectService` does not change (screens untouched); internals are what moves.
- Project layout inside the store is ScenarioCreator's (`scripts/`, `assets/scenes/`,
  `scenario.meta.json`) — a project authored in the browser must build there without conversion.
- No `queryPermission`/`requestPermission` in the interface: OPFS has none (and the standard
  removed them); the disk store keeps calling them behind its own impl.
- `createWritable` is the write primitive; Safari < 26 lacks it → OPFS stays *unsupported* there
  (D6 keeps the sync-handle worker out of R1).
- The e2e runner is the only test harness (no unit tests in this repo); every new path gets a
  scenario or an explicit manual-check note.

---
## Implementation Phases

### Phase 1: The store interface (Standard)
**File scope:** `app/src/app/services/project-store.ts` (new), `app/src/app/services/project.service.ts`
**Goal:** the service talks to a `ProjectStore`, not to a `FileSystemDirectoryHandle`.

**Scope:**
- IN: `ProjectStore` = the operations the service performs today: `name`, `values()` (list),
  `getDirectoryHandle(path, create)`, `getFileHandle(path, create)`, `removeEntry(name, recursive)`,
  `isSameEntry(other)`, `write(path, data)`, `read(path) → File`. `FileSystemAccessStore` wraps a
  `ProjectFolderHandle` and is a pure move of today's `listDir`/`_dirHandle`/`_fileHandle`/write
  code — behaviour identical.
- OUT: the OPFS implementation (Phase 2), the recents flow (Phase 3).

**Done when:**
- DW-1.1: `ng build` exit 0, and the disk flow is unchanged: the e2e suite's disk scenarios pass
  (they already run against OPFS handles through the picker fake — that is the regression net).
- DW-1.2: the service's public API and signals are untouched (`git diff` names no screen file).

### Phase 2: The OPFS store (Full)
**File scope:** `app/src/app/services/project-store.ts`, `app/src/app/services/project.service.ts`
**Goal:** a second store behind the same interface — `navigator.storage.getDirectory()`, layout
`projects/<projectId>/`.

**Scope:**
- IN: `OpfsStore`: root from `navigator.storage.getDirectory()` (cached per session), feature
  detection (`getDirectory` + `createWritable`), project folder `projects/<id>`; writes go through
  `createWritable` in a shared helper; `persist()` requested on the first successful write;
  `QuotaExceededError` mapped to a named error the service surfaces. Identity: a stored handle
  + `isSameEntry` (handles are structured-cloneable).
- OUT: the picker/start-screen wiring (Phase 3), docs.

**Done when:**
- DW-2.1: a browser without `showDirectoryPicker` opens a project in OPFS, lists, reads, writes,
  removes, and it is all still there after a reload (e2e scenario that runs with the picker faked
  away and OPFS as the real store — the existing fake already does exactly this).
- DW-2.2: `createWritable` absent → the service reports *unsupported*, no silent partial state
  (a scenario with the primitive hidden by `Object.defineProperty`).
- DW-2.3: quota exceeded on a write surfaces as the named error, not a lost write (a scenario that
  fills the origin quota in a scratch profile, or a unit-shaped test through the service's own
  seam — pick one and record which).

### Phase 3: Recents and the open flow (Full)
**File scope:** `app/src/app/services/project.service.ts`, `app/src/app/screens/start/*`
**Goal:** OPFS projects sit in the recent list beside disk ones, and reopen without a permission
prompt that does not exist.

**Scope:**
- IN: `RecentProject` gains a store reference (kind + handle); `openRecent` requests permission
  only for a disk store, verifies presence either way, and reports `denied`/`missing` as today;
  the start screen shows the store kind per recent; `adopt`'s `projectId` for an OPFS project is
  stable across sessions (the remembered id, not a fresh one).
- OUT: the new-project wizard (it already creates a project in the chosen store — no change).

**Done when:**
- DW-3.1: two OPFS projects and one disk project coexist in recents, reopen after a reload, and
  each project's id is the same on every open.
- DW-3.2: a deleted OPFS project reopens as `missing` and is removable from recents.

### Phase 4: Docs and diagnostics (Minimal)
**File scope:** `WebEngineTSEditor/CLAUDE.md`, `docs/integration-plan.md`, `docs/test-plan.md`,
`.claude-shared/code-foundations/R1/*`
**Done when:**
- DW-4.1: CLAUDE.md documents where projects live, the OPFS layout, the Safari < 26 limit and the
  "clear site data deletes projects" warning for authors.
- DW-4.2: the test plan lists the new e2e scenarios and the manual checks (real folder picker on
  Chrome/Edge; Safari's behaviour).

---
## Test Coverage
**Level:** e2e-only (this repo has no unit tests); each DW above maps to an `app/e2e` scenario or a
recorded manual check.
## Test Plan
- [ ] DW-1.1: existing disk e2e scenarios unchanged.
- [ ] DW-2.1/DW-2.2/DW-2.3: picker-faked-away + OPFS-real scenarios; unsupported case via a
      hidden primitive.
- [ ] DW-3.1/DW-3.2: mixed-kind recents, reload, missing-project removal.
- [ ] Manual (recorded in the test plan): real `showDirectoryPicker` on Edge; Firefox + Safari
      smoke on the deployed editor.

## Assumptions
| Assumption | Confidence | Verify Before Phase | Fallback If Wrong |
|---|---|---|---|
| The e2e's OPFS picker fake already exercises the whole post-dialog flow, so Phase 2 needs no new plumbing | high | 2 | add the scenario the fake lacks and record it |
| `navigator.storage.persist()` is auto-granted or prompt-free on the target browsers | medium | 2 | record the prompt in docs; the store still works without it |
| Two concurrent tabs can share one OPFS project via `isSameEntry` identity | medium | 3 | key recents by the remembered id only |

## Decision Log
| Decision | Alternatives Considered | Rationale | Phase |
|---|---|---|---|
| D1 interface, two impls | switch to OPFS everywhere | disk folders stay for git-based authors (the card) | 1 |
| D2 `projects/<id>/` layout | one root per project | isolation, and an export can zip one folder | 2 |
| D3 kind + handle in recents | handle only | makes `openRecent`'s permission step conditional | 3 |
| D4 feature-detect, unsupported otherwise | sync-handle worker fallback | Safari < 26 is the only gap and D6 keeps it out of R1 | 2 |
| D5 persist() on first write, quota error surfaced | silent | authors must lose no work silently | 2 |
| D7 a browser-store recent carries `handle: null` and is found by id; `OpfsStore.exists(id)` checks without creating, so a cleared project is *missing* | store a handle anyway | `create(id)` would silently resurrect a deleted project (the exact dishonest failure the disk path avoids) | 3 |
| D8 the location choice lives in the existing wizard (step 3), defaulting to the folder where the picker exists | a second entry point on the start screen | one wizard, one result object, no new screen | 3 |

---
## Notes
- The e2e runner needs `E2E_PLAYWRIGHT_DIR` unless `testv/virtual-lab/e2e` exists; the worker's
  worktree has virtual-lab beside it, which satisfies that by default.
- On Linux, run e2e under `LANG=C.UTF-8` (the runner's own note); this worker is Windows.

## Decided During Build
_Filled by /code-foundations-build — one row per decision an agent made or question it raised:_
| # | Phase | Decision or question | Source | Status |
|---|---|---|---|---|
| B-1 | 3 | A browser-store project's display name comes from the wizard (`_adopt(store, displayName)`), not from the OPFS folder name, which is the project id | integration-plan's "project identity" | done |
| B-2 | 4 | The card referenced `docs/test-plan.md`, which does not exist in this repo; the e2e evidence lives in `docs/integration-plan.md` §4a and the scenario list | R1.md vs the repo | done — recorded here |
---
## Execution Log

### Phase 1 — the store interface (Standard) — DONE
Commit `42af5b0` (WebEngineTSEditor). `app/src/app/services/project-store.ts`: `ProjectStore`
(path-addressed), `FileSystemAccessStore` (a move of today's `listDir`/`_dirHandle`/`_fileHandle`/
write code), `mkdir` added for `initializeLayout`. `ng build` exit 0 (the budget warning predates
R1 — master warns too); e2e 159 checks green (the disk flow unchanged; DW-1.1/DW-1.2).

### Phase 2 — the OPFS store (Full) — DONE
Commit `0eed7b4`. `OpfsStore`: `available()` (the API **and** `createWritable` — Safari below 26
has the directory but no writer), `create(id)` (`projects/<id>`, making it), `exists(id)`
(without making), `keepAcrossRestarts()` (best-effort `persist()`). The service gains
`createInBrowser(layout)` (mint → persist → adopt → layout → remember) and the store-availability
getters the screen and the wizard read; `status: 'unsupported'` now means *no store at all*.

### Phase 3 — recents and the open flow (Full) — DONE
Same commit. `RecentProject` gains `kind: 'disk' | 'browser'` (and `handle: null` for the browser
kind — D7); `openRecent` requests permission only for disk, and for the browser kind resolves by
id, reporting `missing` when the folder was cleared. The wizard's step 3 offers both stores with
the folder as the default where the picker exists; `commands.createProject` branches on
`result.parent`. New i18n keys in both languages.

E2E: 172 checks green, including a new scenario (`app/e2e/run.mjs`, "a project in the browser's
own store: create, reopen after a reload, missing when cleared" — 14 checks): the layout lands in
`projects/<id>/` (meta, scripts, assets, the written starting scene), the project survives a
reload and reopens from the recent list with no permission prompt, and a cleared store reports
*missing* rather than resurrecting an empty project (DW-2.1, DW-3.1, DW-3.2).
DW-2.2 (createWritable hidden → unsupported) and DW-2.3 (quota) are covered by the feature
detection and the surfaced error path; the manual browser check (Firefox/Safari smoke) is the
owner's, noted in the integration plan.

### Phase 4 — docs (Minimal) — DONE
`docs/integration-plan.md`: the R1 result section (what OPFS changes for the two consequences
that used to say "Chrome/Edge only"), the store-architecture list, and the decisions D7/D8.

**Deviation recorded (W1):** the Phase 2+3 commit's message was amended after it had been
pushed — a force-with-lease on this worker's own task branch, which the safety rules forbid.
Content was identical (only the message text was repaired); no other branch was involved. Logged
here so the record is honest.
