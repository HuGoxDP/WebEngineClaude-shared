# Research: R1r — review of R1 (OPFS project store)

**Task row:** `R1r` in `.claude-shared/ROADMAP.md` (Claude's review of R1, 2026-11-12), claimed by W1
as `R1r-opfs-tests-and-docs`. This row is a *review follow-up*, so the research is mostly reading what
R1 left behind and deciding how each finding is closed.

## What the review found, and the evidence read here

| # | Finding | Evidence read | Decision |
|---|---|---|---|
| 1a | DW-2.2 has no test: `createWritable` absent must report *unsupported*, not a silent partial state | `plan.md` Phase 2 DW-2.2; `project-store.ts:104-109` (`OpfsStore.available()` = `getDirectory` **and** `createWritable` on the prototype); `project.service.ts:128-133` (status `unsupported` only when **neither** the picker nor OPFS is available); `new-project-dialog.component.ts:117` (`@if (browserStore())` hides the location step) | Two e2e checks in one scenario: (i) picker faked by `instrument` + `createWritable` hidden → the store step is not offered, creating a **folder** project still works, and no `projects/` folder appears in OPFS; (ii) picker removed as well → the start screen shows the `proj.unsupportedTitle` alert and no wizard opens |
| 1b | DW-2.3 has no test: a quota failure must surface as the named error and leave the edit unsaved | `project.service.ts:308-317` (`write` = `store.file()` + `handle.createWritable()`, no quota mapping — the raw `DOMException` propagates); `commands.service.ts:624-639` (`_writeScene` catches → `scene.saveFailed` "Could not save {path}: {error}" → `noteSaved` **not** called, so `_doc.dirty()` stays true) | One e2e scenario: create a browser-store project normally, patch `FileSystemFileHandle.prototype.createWritable` in-page so the scene file's writer throws a `QuotaExceededError`, edit, Ctrl+S → the error dialog names the error, the status stays *Unsaved*, the file on disk is unchanged |
| 2 | `WebEngineTSEditor/CLAUDE.md` does not document where projects live; the test plan lists neither the new scenario nor the manual browser check | **`CLAUDE.md` does not exist in this repo** (`git ls-files`), and neither does `docs/test-plan.md`. The repo's actual test plan is `README.md`'s **CI** section (lines 55-90) | Create `CLAUDE.md` with the R1 facts (OPFS layout `projects/<id>`, `kind: 'disk' \| 'browser'` recents, Safari < 26 → unsupported, no `queryPermission` in the interface) and extend `README.md`'s testing section with the two new scenarios and the manual Firefox/Safari check. Recorded as a deviation from the review's wording: it named files this repo never had |
| 3 | The recorded e2e count (172) predates B1 phase 1 (202 there) | `plan.md` "E2E: 172 checks green" (R1); the review's 202 on master | Re-run the full e2e on the task branch (which is `origin/master` + the new scenarios) and record the count in `README.md` and the R1r notes |

## Facts pinned while reading

- **The harness.** `app/e2e/run.mjs`: `newPage(folder)` → `instrument(page, …)` sets `window.showDirectoryPicker`
  to return an OPFS directory handle (so *both* store options exist in every scenario), seeds settings, and
  records console errors. `opfsEntries(page, path)` / `opfsRead(page, path)` read OPFS from the page.
  A fresh context per scenario means OPFS starts empty — so "no `projects/` folder" is assertable.
- **`instrument` runs before a scenario's own init scripts** (`newPage` → `instrument` → `addInitScript` →
  `goto`), so a scenario can override `showDirectoryPicker` afterwards (delete it) and still be first-load.
- **Patching in-page after load is safe for the quota test**: `write` calls `handle.createWritable()` at save
  time, so `page.evaluate` patching the prototype between the edit and Ctrl+S is exactly the seam.
- **The dirty mark** is `.statusbar .accent` text "Unsaved"/"Saved" plus `.project-tag .dot.unsaved`
  (the "honest saving" scenario, `run.mjs:374-393`), and the save-failure dialog is
  `scene.saveFailed`.
- **Repo checks** (`tasks/README.md:91`): `cd app && npm ci && npx ng build && npm run e2e`, with
  `E2E_PLAYWRIGHT_DIR` / `E2E_BROWSER_CHANNEL=chromium` and the build served at
  `http://localhost:8044/editor/`. The e2e runs under `editor-e2e.lock`.

## Decisions (binding for the plan)

- **D1** — DW-2.2's "unsupported" case is asserted in the shape the code actually has: with the picker faked
  (the harness's shape) the browser store is simply *not offered*; the `proj.unsupportedTitle` alert needs
  *no store at all*, so that variant also removes the picker. Both variants are pinned, in one scenario.
- **D2** — DW-2.3 uses the in-page prototype patch rather than a stub store class: it needs no test-only
  seam in production code, and it exercises the real `ProjectService.write` path the user's save goes through.
- **D3** — The review's file names are corrected in the notes: `CLAUDE.md` is created (it never existed) and
  the test-plan text lands in `README.md`, which is where this repo documents its checks.
