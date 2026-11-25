# Research: C4r7 — unsaved Code-tab edits are silently lost
**Date:** 2026-11-25  **Status:** confirmed (autonomous, by recommendation)  **Row:** C4r7, AC-15 of MS-2 spec
**Base:** editor `origin/master`; C4r18 lands first (same file `code-editor.service.ts`, serial C4r18 -> C4r7).

## What C4r18 changes (so C4r7 builds on it)
`_changedOnDisk` (service, ~l.253) returns true for a listed file with no stamp. It touches only that helper.
C4r7 does not touch `_changedOnDisk`/`checkOutsideEdits`; it touches `open`, `save`, `reveal`.
Rebase the phase on the merged C4r18 file.

## Facts (verified against origin/master)
- `code.component.ts` `_sync(file)`: `if (model.getValue() !== text) model.setValue(text)` on EVERY mount
  (ngAfterViewInit -> _mount -> _sync). `<app-code>` is destroyed when the bottom pane leaves the Code tab
  (workspace.component.ts l.308-310), so Project/Console and back replaces unsaved model text with disk text.
  `ngOnDestroy` disposes the editor but NOT the model; models persist by URI `file:///<path>`.
  `code.dirty()` (service signal) survives, hence the dot stays while the text is gone.
- `CodeEditorService.open(path)`: reads, sets `file`, `_dirty.set(false)`, no question. Callers:
  `workspace.onOpenEntry` (Project double-click) and `reveal()` (Console row jump).
- `save(text)`: writes, then `_dirty.set(false)` unconditionally; text typed during the awaited write loses its mark.
- `document.service.ts` beforeunload checks only the scene `dirty()`.
- `_confirmDiscard` lives in `commands.service.ts` (serial file C4r12 -> C4r13); AC-15 does not need it.
- `DialogService.confirm({title,message,confirmLabel,cancelLabel,danger})`; i18n in `i18n/en.ts`, `uk.ts`
  (shared; existing `code.overwriteTitle`, `dialog.cancel`, `scene.replace`).
- Dirty state is single-file.

## Requirements (AC-15 + row)
1. Edit, Project/Console, back to Code: text and unsaved dot kept.
2. Open another script while dirty: ask first; cancel keeps the buffer.
3. Reload/close with a dirty script: unload prompt.
4. Save writes the buffer; dot clears only if buffer == written text.

## Decisions (recommended, taken)
- D1 Model is source of truth: the panel forces disk text into a model only on a real `open()`, a
  `diskReload` bump, or a mount while NOT dirty.
- D2 `open()` of the already-open path returns true, no ask, buffer untouched.
- D3 `open()` of a different path while dirty asks (new i18n keys); cancel returns false with no state change;
  confirm proceeds; `open` always bumps `diskReload` so a stale model is overwritten.
- D4 `reveal()` stops when `open` returns false.
- D5 `save(text, current?)`: dirty clears only if `current()` equals the saved text.
- D6 beforeunload reads `CodeEditorService.dirty()` via lazy `Injector.get` (no constructor cycle).
- D7 OUT: `_confirmDiscard` (serial file of C4r12/C4r13). Follow-up: project switch/close with a dirty script
  still drops the buffer.
- D8 `workspace.component.ts` unchanged; proof is NEW `app/e2e/checks/C4r7.mjs` (existing e2e frozen; the row's
  `run.mjs` edit is replaced).

## Risks
- Stale model from a previous project at the same path: a clean mount forces disk text.
- Native beforeunload text is invisible to Playwright; use `page.on('dialog')` + `page.close({runBeforeUnload:true})`.
- Typing goes through Monaco's keyboard, as the existing scenarios do.
