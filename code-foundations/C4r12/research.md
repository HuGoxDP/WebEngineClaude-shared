# Research: C4r12 + C4r13 (Library add safety and target)
**Date:** 2026-11-25  **Status:** confirmed (autonomous; decide-by-recommendation)
**Summary:** two defects in `CommandsService.addLibrary` (origin/master): it overwrites an author's non-empty library file, and it re-finds its target by first name match.

## Evidence (WebEngineTSEditor origin/master)
- `library.service.ts`: `isInstalled` = file exists AND class registered. A non-empty file whose class failed to load is "not installed", so `offered()` lists it.
- `commands.service.ts addLibrary`: `if (!isInstalled) { write(path, entry.source); reloadScripts() }` with no look at the existing content (C4r12). Afterwards `findGameObject(targetName)` returns the first name match (C4r13). `createPrimitive` names every cube "Cube".
- Dialog pattern to reuse: `DialogService.confirm({title,message,confirmLabel,cancelLabel,danger})`, as in `_confirmReplace` (`scene.overwriteTitle`). i18n keys live in `i18n/en.ts` and `uk.ts` (shared files, both need the same keys).
- Reload rebuilds the scene (`scene.service` clear + deserialize), so `target` is destroyed when the class was new; a sibling-index path is stable across the rebuild (the serializer keeps order).
- No unit-test runner in `app/package.json` (only `e2e`, `e2e:build`); proof is e2e under `app/e2e/checks/` (EdE2E harness: `runCheck`, `check`, `newPage`, `seed`, `readDisk`, `sceneWith`, `selectInHierarchy(page,name,nth)`, `save`, `dialogButton`, `dialogTitle`, `LIBRARY_NAMES`; each `checks/<ID>.mjs` runs as `node file <url>`).
- Graph (graphify): `CommandsService` links to LibraryService, ProjectService, SelectionService, SceneService, HistoryService.

## Decisions
- D-1 File states: missing or size 0 -> write silently (as today). Non-empty and class registered -> already installed, no write. Non-empty and class not registered -> ask; cancel = return with no write, no reload, no history entry, no selection change; confirm = overwrite (the author consented).
- D-2 The state check is one `LibraryService` method (`fileState(entry)`), so the rule is not spread across the command.
- D-3 Asking happens before any write; the existing partial-write cleanup stays.
- D-4 Target: capture `target` and its path (root index in `scene.roots()`, then child indices) before the add. After the reload use `target` only if still attached to the live scene; else resolve the path and require the name to equal the original; else abort silently as today. Never fall back to first-name match.
- D-5 Scene roots are authoritative: use `SceneService.roots()`, not `SceneManager.findGameObject`.
- D-6 Tests: new e2e files only, same-named objects via a two-"Cube" scene; reopen verifies persistence (AC-12).
- D-7 Three new i18n keys, en + uk, in an integrator phase first (shared files).

## Open
None.
