# Plan: C4r7 — keep unsaved Code-tab edits
**Created:** 2026-11-25
**Status:** ready
**Complexity:** medium
**Review cadence:** 2
**Check-ins:** quiet
---
## Context
**Problem.** Unsaved script edits are lost when the Code tab unmounts (the panel re-seeds the model from disk
on every mount), `open()` replaces a dirty file silently, the unload prompt ignores a dirty script, and
`save()` clears the dirty mark even if the buffer moved during the write. Research: `research.md` (D1-D8).
**Success (AC-15):** edit -> Project/Console -> Code keeps text and dot; open B while A dirty asks (cancel
keeps buffer); reload/close with a dirty script prompts; Save writes the buffer; dot clears only when
buffer == written text.
## Constraints
- Serial file: `code-editor.service.ts` C4r18 -> C4r7. Build on the merged C4r18 file; do not touch
  `_changedOnDisk` / `checkOutsideEdits`.
- Existing files under `app/e2e/` are frozen; the proof is a NEW `app/e2e/checks/C4r7.mjs` on the EdE2E
  harness (`app/e2e/lib/harness.mjs`, run by `npm run e2e:checks`), inside `editor-e2e.lock`
  (`bash R/.workers/wk.sh lock editor-e2e W<n> C4r7`, then `unlock`); Playwright from
  `E2E_PLAYWRIGHT_DIR=<worktree>/virtual-lab/e2e`, `E2E_BROWSER_CHANNEL=chromium`.
- No unit harness in the editor (CLAUDE.md): proof is e2e. No `package.json`/lock edits.
- `commands.service.ts` is out of scope (C4r12/C4r13 serial); `workspace.component.ts` unchanged.
## Chosen Approach
**Model is the source of truth** — the panel forces disk text into the Monaco model only on a real open, a
diskReload bump, or a clean mount; the service owns ask-before-replace and the equal-buffer dirty clear;
DocumentService adds the dirty script to the unload guard. **Fallback:** if Monaco cannot keep the model
across a dirty mount, mirror the buffer text in the service on every edit and restore it on mount.
## Rejected Approaches
- **Keep `<app-code>` alive with `[hidden]`:** changes the workspace template and Monaco layout cost.
- **Always mirror text in the service:** two truths to keep equal.
- **Editing `_confirmDiscard` now:** collides with the C4r12 -> C4r13 serial file; not needed for AC-15.
---
## Implementation Phases

### Phase 1: Integrator — i18n keys
**Skills:** none -- two string keys in two dictionaries
**Model:** haiku
**Gate:** Minimal
**Depends on:** none
**File scope:** WebEngineTSEditor: app/src/app/i18n/en.ts, app/src/app/i18n/uk.ts
**AC:** AC-15 (wording of the ask-before-replace dialog)
**Risk:** normal

**Goal:** Add `code.discardTitle` and `code.discardMessage` (`{name}` = dirty file, `{path}` = file to open)
to both dictionaries; shared-file edit, only this phase touches them.

**Scope:**
- IN: two keys each in `en.ts` and `uk.ts`, beside `code.overwriteTitle`. Reuse `scene.replace` (confirm) and
  `dialog.cancel` (cancel).
- OUT: any other key, any component.

**Edge cases:** the Ukrainian dictionary carries the same key set and the same placeholders (a missing key
renders the raw key).

**Produces:** keys `code.discardTitle` ("Discard unsaved changes?") and `code.discardMessage`
("{name} has unsaved changes. Opening {path} replaces them.") used by Phase 2.

**Done when:**
- [ ] DW-1.1: both files contain both keys with identical `{name}`/`{path}` placeholders.
- [ ] DW-1.2: `cd app && npm run build` exits 0.

### Phase 2: Model-as-truth in the Code panel and service
**Skills:** code-foundations:cc-defensive-programming, code-foundations:cc-routine-and-class-design
**Model:** sonnet
**Gate:** Standard
**Depends on:** Phase 1 (and C4r18 merged)
**File scope:** WebEngineTSEditor: app/src/app/services/code-editor.service.ts, app/src/app/panels/code/code.component.ts
**AC:** AC-15
**Risk:** normal (serial file; core editing flow)

**Goal:** The buffer survives tab switches, a dirty file is never replaced unasked, and the dirty mark clears
only when the buffer equals what was written.

**Scope:**
- IN:
  - Service `open(path)`: same path as the open file -> return true, nothing else. Different path while
    dirty -> `_dialog.confirm` (`code.discardTitle/Message`, `scene.replace`, `dialog.cancel`, `danger: true`);
    declined -> return false before any state change. After setting the file and clearing dirty, bump
    `diskReload` so the panel force-syncs from disk.
  - Service `reveal(path,line)`: `if (!await this.open(path)) return;` before `jumpTo`/`showRequest`.
  - Service `save(text, current?: () => string)`: after the write, `_dirty.set(false)` only when `current` is
    undefined or `current() === text`; revision bump and stamp stay.
  - Panel `_sync(file, force)`: finds or creates the model; `setValue` only when `force` and the text differs.
    `_mount` passes `force = !this.code.dirty()`; the `diskReload`/file effect passes `force = true`. Panel
    `save`/`_saveFromEditor` pass `() => model.getValue()` (model captured; valid after editor disposal).
- OUT: `_changedOnDisk`, `checkOutsideEdits` (C4r18), `markEdited`, workspace, commands.service,
  document.service, any e2e file.

**Edge cases:**
- Dirty A, user confirms opening B: A's stale model must be overwritten on a later reopen (open always bumps
  diskReload).
- Dirty file, Console row for the same file: no ask, buffer intact, jump still applies.
- Typing during an in-flight save: dot stays; a second Save works once `_saving` ends.
- Save failure path unchanged (returns false, buffer stays dirty).
- Mount while dirty with the model missing: disk text, a console warning.

**Produces:** `open(path): Promise<boolean>` (false = declined or read failure);
`save(text: string, current?: () => string): Promise<boolean>`; panel behaviour consumed by Phase 4.

**Done when:**
- [ ] DW-2.1: `cd app && npm run build` exits 0 and lint (if a script exists) exits 0.
- [ ] DW-2.2: the phase diff touches only the two scoped files and leaves `_changedOnDisk` and
  `checkOutsideEdits` identical to the merged C4r18 version.
- [ ] DW-2.3: Phase 4's tab-switch, open-ask and save-equality checks pass.

### Phase 3: Unload guard includes the dirty script
**Skills:** code-foundations:cc-defensive-programming
**Model:** haiku
**Gate:** Standard
**Depends on:** none
**File scope:** WebEngineTSEditor: app/src/app/services/document.service.ts
**AC:** AC-15
**Risk:** normal

**Goal:** `beforeunload` prompts when either the scene or the open script buffer is dirty.

**Scope:**
- IN: inject `Injector`; in the listener, return only when `!this.dirty()` and the lazily resolved
  `CodeEditorService.dirty()` is false (resolved at event time, so no constructor cycle).
- OUT: tab title dot, autosave, `_confirmDiscard`.

**Edge cases:** `Injector.get` throws -> try/catch, treat the script as clean; scene dirty alone still
prompts (unchanged); neither dirty -> no prompt.

**Produces:** nothing downstream.

**Done when:**
- [ ] DW-3.1: `cd app && npm run build` exits 0 with no circular-dependency warning.
- [ ] DW-3.2: Phase 4's unload check passes (dirty script -> beforeunload dialog; clean -> none).

### Phase 4: e2e check `C4r7.mjs`
**Skills:** code-foundations:cc-quality-practices
**Model:** sonnet
**Gate:** Standard
**Depends on:** Phase 2, Phase 3 (and EdE2E merged)
**File scope:** WebEngineTSEditor: app/e2e/checks/C4r7.mjs
**AC:** AC-15
**Risk:** normal (browser run inside `editor-e2e.lock`)

**Goal:** A new check on `lib/harness.mjs` (`runCheck`, `check`, `newPage`, `seed`, `dialogTitle`,
`dialogButton`, `readDisk`) that proves AC-15.

**Scope:**
- IN: one file, run as `node app/e2e/checks/C4r7.mjs <editor-url>`. Seeds a project with `scripts/A.ts`,
  `scripts/B.ts` and the entry; opens A in the Code tab; types a marker.
- OUT: any existing e2e file, `package.json`, harness changes.

**Edge cases / dirty tests (each a `check`):**
- edit A -> Project pane tab -> Code tab: buffer contains the marker AND `.dot.unsaved` present; repeat via Console.
- A dirty, double-click B: a dialog `Discard unsaved changes?`; cancel -> `.code-name` still A, marker and
  dot kept; confirm -> `.code-name` is B, no dot, A on disk unchanged (`readDisk`).
- same-file reopen (double-click A while dirty): no dialog, buffer intact.
- dirty A: `page.close({ runBeforeUnload: true })` raises a `beforeunload` dialog (`page.on("dialog")`); a
  clean page closes with none.
- Save writes the typed buffer (`readDisk` has the marker) and the dot clears; typing right after pressing
  Save (write held with a harness slow-write helper if usable) keeps the dot when buffer != written text.
- stale model: edit A, confirm-discard by opening B, reopen A: A shows disk text, not the old edit.

**Produces:** nothing downstream.

**Done when:**
- [ ] DW-4.1: `cd app && node e2e/run-checks.mjs <url>` (inside the lock) prints `PASS e2e/checks/C4r7.mjs`.
- [ ] DW-4.2: against the base editor (without Phases 2-3) the check FAILS, at least on tab-switch and unload.
- [ ] DW-4.3: the diff adds only `app/e2e/checks/C4r7.mjs`; `app/e2e/run.mjs` is unchanged.

---
## Test Coverage
**Level:** Per-phase (no editor unit harness; proof is the new e2e check)
## Test Plan
- [ ] DW-1.1/1.2: key parity and build.
- [ ] DW-2.1-2.3: build/lint, scope diff, e2e.
- [ ] DW-3.1-3.2: build, unload e2e.
- [ ] DW-4.1-4.3: PASS on the fixed editor, FAIL on the base, new file only.
- [ ] Dirty tests: cancel-keeps-buffer, same-file reopen without ask, clean close without prompt, typing during
  save keeps the dot, stale model after discard, Console round trip.
---
## Notes
- Follow-up (not AC-15): `commands.service._confirmDiscard` ignores a dirty script; project switch/close drops
  the buffer. Raise a row after C4r13 frees the file.
- Phases 2 and 3 have disjoint scopes (parallel after Phase 1); Phase 4 needs both.
---
## Decided During Build
| # | Phase | Decision or question | Source | Status |
---
## Execution Log
_To be filled during /code-foundations:build_
