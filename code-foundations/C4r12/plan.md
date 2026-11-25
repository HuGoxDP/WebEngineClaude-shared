# Plan: C4r12 + C4r13 — Library add never overwrites author code, and attaches to the selected object
**Created:** 2026-11-25 (Claude architect, autonomous)
**Status:** ready
**Complexity:** simple
**Review cadence:** 3
**Check-ins:** quiet
---
## Context
Research: `code-foundations/C4r12/research.md`. Spec ACs: AC-11 (C4r12), AC-12 (C4r13) of MS-2.

**Problem.** `CommandsService.addLibrary` (a) overwrites a non-empty `scripts/library/<Name>.ts` that failed to compile, and (b) re-finds its target by first name match, so with two same-named objects it lands on the first.

**Constraints.**
- Existing `app/e2e/*` files are frozen; proof goes in new `app/e2e/checks/*.mjs` using `../lib/harness.mjs` (EdE2E merged first).
- Editor e2e runs inside `editor-e2e.lock`.
- `commands.service.ts` is touched serially: Phase 2 then Phase 4.
- i18n files are shared: only Phase 1 touches them.
- Engine untouched; no hidden-test content quoted.

**Success criteria.** AC-11 and AC-12 hold, proven by two new check files that exit 0 against the built editor.

## Implementation Phases

### Phase 1: i18n keys (integrator)
**Skills:** none -- two string-table additions
**Model:** sonnet
**Gate:** Minimal
**Depends on:** none
**File scope:** WebEngineTSEditor: app/src/app/i18n/en.ts, app/src/app/i18n/uk.ts
**AC:** AC-11
**Risk:** low (shared files, additive)

**Goal:** Add the three strings the replace question needs, in both languages.

**Scope:**
- IN: keys `insp.libraryReplaceTitle`, `insp.libraryReplaceMessage` (`{path}` placeholder), `insp.libraryReplace`, beside `insp.libraryFailed` in each file.
- OUT: any other key or file.

**Edge cases:** both tables carry identical key sets; the `{path}` placeholder is spelled the same.

**Done when:**
- [ ] DW-1.1: the three keys exist in `en.ts` and `uk.ts`.
- [ ] DW-1.2: `npm run build` in `app/` passes with no key mismatch.

### Phase 2: Library add asks before replacing (C4r12)
**Skills:** code-foundations:cc-defensive-programming
**Model:** sonnet
**Gate:** Standard
**Depends on:** Phase 1
**File scope:** WebEngineTSEditor: app/src/app/services/library.service.ts, app/src/app/services/commands.service.ts
**AC:** AC-11
**Risk:** normal (data-loss path)

**Goal:** `addLibrary` writes only a missing or zero-byte file, and asks first when a non-empty file exists whose class is not registered.

**Scope:**
- IN: `LibraryService.fileState(entry): Promise<'missing'|'empty'|'present'>` (via `ProjectService.exists` / `readFile().size`); in `addLibrary`, before any write, `present` and class not registered -> `DialogService.confirm({ title, message {path}, confirmLabel: insp.libraryReplace, cancelLabel: dialog.cancel, danger: true })`. Cancel returns with no write, reload, history entry or selection change; confirm continues into the existing write path. Update the doc comment of `addLibrary`.
- OUT: target resolution (Phase 4); `isInstalled` / `offered` semantics; the Library UI.

**Edge cases:** a read error while sizing the file counts as `present` (ask, never overwrite blind); zero-byte file -> write without asking; class registered and file present -> no write, as today; selection unchanged after cancel.

**Produces:** `LibraryService.fileState(entry)` contract above.

**Done when:**
- [ ] DW-2.1: with a non-empty non-compiling `scripts/library/Rotator.ts`, add opens a confirm dialog; Cancel leaves the file byte-identical and the object without the component.
- [ ] DW-2.2: a missing or zero-byte file is written without a dialog and the component attaches.
- [ ] DW-2.3: Confirm replaces the file with the shipped source and attaches.
- [ ] DW-2.4: `npm run build` in `app/` passes.

### Phase 3: e2e check for C4r12
**Skills:** none -- test authoring on the EdE2E harness
**Model:** sonnet
**Gate:** Standard
**Depends on:** Phase 2
**File scope:** WebEngineTSEditor: app/e2e/checks/C4r12.mjs
**AC:** AC-11
**Risk:** normal (runs inside editor-e2e.lock)

**Goal:** Prove AC-11 in a browser.

**Scope:**
- IN: one `runCheck` file. Seed a project (`seed`, `SCENARIO_ENTRY`, a one-object scene) whose `scripts/library/Rotator.ts` is non-empty and does not compile; open; select; Add component -> Library -> Rotator; assert the dialog title, click Cancel; `readDisk` equals the seeded bytes and the Inspector shows no Rotator. Repeat with a zero-byte file (written, attached, no dialog). Repeat and Confirm (file replaced, attached).
- OUT: edits to `run.mjs` or the harness.

**Edge cases:** dialog never opens -> fail on a bounded wait, not a hang; Cancel must not leave a dialog open.

**Done when:**
- [ ] DW-3.1: `node app/e2e/checks/C4r12.mjs <editor-url>` exits 0 on the Phase 2 build, one PASS per assertion above.
- [ ] DW-3.2: the same file exits 1 on the base build (it catches the overwrite).
- [ ] DW-3.3: `npm run e2e:checks -- <url>` lists `PASS C4r12.mjs`.

### Phase 4: Attach to the selected object (C4r13)
**Skills:** code-foundations:cc-defensive-programming
**Model:** sonnet
**Gate:** Standard
**Depends on:** Phase 2
**File scope:** WebEngineTSEditor: app/src/app/services/commands.service.ts
**AC:** AC-12
**Risk:** normal

**Goal:** After the add (and any rebuild) the component lands on the object that was selected, never another with the same name.

**Scope:**
- IN: before the async work record the target's path (root index in `SceneService.roots()`, then child indices via `transform`). After the reload use `target` if still attached to the live scene (its root ancestor is in `roots()` and it is not destroyed), else resolve the path and accept the result only if its name equals the original; otherwise abort silently as today. Remove `findGameObject(targetName)`.
- OUT: library file logic (Phase 2); any engine change.

**Edge cases:** target deleted while the write was in flight -> path resolves to nothing or a differently named object -> abort, nothing attached; nested same-named siblings; siblings reordered during the await (name check fails -> abort).

**Done when:**
- [ ] DW-4.1: two root objects "Cube", second selected, add Rotator -> Rotator is on the second, the first has none, including when the class was new (rebuild).
- [ ] DW-4.2: after save and reopen the same holds.
- [ ] DW-4.3: no `findGameObject(targetName)` remains in `addLibrary`; `npm run build` passes.

### Phase 5: e2e check for C4r13
**Skills:** none -- test authoring on the EdE2E harness
**Model:** sonnet
**Gate:** Standard
**Depends on:** Phase 4
**File scope:** WebEngineTSEditor: app/e2e/checks/C4r13.mjs
**AC:** AC-12
**Risk:** normal (runs inside editor-e2e.lock)

**Goal:** Prove AC-12 in a browser.

**Scope:**
- IN: seed a scene with two root "Cube" objects and a nested same-named pair; `selectInHierarchy(page, "Cube", 1)`; add Library Rotator (new class, so a rebuild); assert via the saved scene JSON that it is on index 1 only; `save`, reopen, assert again; second case selects the first and adds Mover.
- OUT: harness or `run.mjs` edits.

**Edge cases:** hierarchy order after rebuild unchanged; assert by saved scene JSON, not by label alone.

**Done when:**
- [ ] DW-5.1: `node app/e2e/checks/C4r13.mjs <editor-url>` exits 0 on the Phase 4 build.
- [ ] DW-5.2: it exits 1 on the Phase 2 build (first-match bug).
- [ ] DW-5.3: `npm run e2e:checks -- <url>` lists `PASS C4r13.mjs`.

## Test Coverage
100% of DW items. The editor has no unit runner, so behaviour is covered by e2e checks only (new files; frozen-file rule).

## Test Plan
| Test | Covers | Type |
|---|---|---|
| checks/C4r12.mjs cancel branch | DW-2.1 | e2e |
| checks/C4r12.mjs zero-byte + confirm | DW-2.2, 2.3 | e2e |
| checks/C4r12.mjs non-empty non-compiling file kept byte-identical | DW-2.1 | e2e dirty |
| checks/C4r13.mjs second Cube, save + reopen | DW-4.1, 4.2 | e2e |
| checks/C4r13.mjs nested same-named + select-first | DW-4.1 | e2e dirty (boundary) |
| checks/C4r13.mjs target deleted in flight (hold the write with `slowLibraryWrite`, delete via Hierarchy) -> nothing attached | DW-4.1 | e2e dirty |
| `npm run build` | DW-1.2, 2.4, 4.3 | build |

## Risks
- If a harness helper is missing, keep the helper inside the check file (the harness is frozen).
- Phase 4: verify in `WebEngineTS.d.ts` how to tell a GameObject is destroyed/detached before coding; if no such API, use the path-only resolve.
