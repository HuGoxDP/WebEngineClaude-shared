# R1r — review of R1: the two untested DWs and the repo's guidance — notes

Task: `R1r` (Claude's review of R1, 2026-11-12), claimed by W1 as `R1r-opfs-tests-and-docs`.
Branches: `WebEngineTSEditor/R1r-opfs-tests-and-docs` (`0740e49`), `.claude-shared/R1r-opfs-tests-and-docs`.
Plan: `plan.md`; the decisions D1–D3 and every fact they rest on: `research.md`.

## What landed

**The two untested "done when" items became tests** (`app/e2e/run.mjs`, additions only — no existing
scenario or check was touched):

- **DW-2.2 — no writer, no store.** Two scenarios. With `FileSystemFileHandle.prototype.createWritable`
  hidden on the prototype before the app loads: step 3 offers no location *choice* and the folder path is
  the only thing left; no workspace opens, the failure is reported as a dialog (the disk store cannot write
  either, so a project would open read-only — which is not a store), and nothing is created under
  `projects/`. With the picker removed as well: the start screen says *Project folders are not available in
  this browser*, no wizard opens, no project folder is made.
- **DW-2.3 — quota exceeded.** One scenario: a browser-store project created normally, one edit, then the
  scene file's writer is made to reject with a `QuotaExceededError` (the real `ProjectService.write` →
  `handle.createWritable()` path, patched in-page between the edit and Ctrl+S). The save failure dialog says
  *Could not save … quota*, the status is still *Unsaved*, the unsaved mark is still there, and
  `assets/scenes/main.scene.json` is byte-identical to before the save.

**The repo learnt where projects live.** `CLAUDE.md` is new (the review named it; `git ls-files` shows this
repo never had one): what the repo is, the two stores behind `ProjectStore` (OPFS `projects/<id>` and the
disk folder), the recents `kind: 'disk' | 'browser'` and why a browser recent remembers an **id** and not a
handle, the Safari-below-26 `createWritable` limit, and that no permission calls live in the interface.
`README.md`'s testing section now lists the scenarios, the shared `editor-e2e.lock`, the "the URL is the
first argument, so a port other than 8044 works" note (the platform's catalog owns 8044), the recorded e2e
count, and the manual Firefox/Safari checks the suite cannot make.

**`docs/integration-plan.md`** carries the R1 note about `OpfsStore` behind the same `ProjectStore`
interface — **it was written during R1 and left uncommitted in the W1 editor worktree**, discovered when
this task claimed the repo and found the file dirty. Recovered intact (the old task branch it came from was
already merged elsewhere), so the note and the two corrected consequences now land with this task.

## Decisions, and where they differ from the review

| # | Decision | Why |
|---|---|---|
| 1 | DW-2.2's *unsupported* case is asserted with the picker removed as well | With the harness's faked picker the service has a store, so `status` is never `'unsupported'`; the alert needs *no store at all*. The picker-still-there shape is asserted as "the browser store is not offered" instead of "unsupported", and the disk-path write failure is asserted as reported rather than silent |
| 2 | The quota test patches the handle prototype in-page rather than stubbing the store | No test-only seam in production code, and it exercises the user's own Save path. The alternative the review named (a stub store through the service's seam) remains available for a unit test if this repo ever grows one |
| 3 | The review's file names were corrected: `CLAUDE.md` created, test-plan text in `README.md` | Neither `CLAUDE.md` nor `docs/test-plan.md` existed in this repo. `README.md` is where its checks are documented |

## Verification

- **`cd app && npm ci && npx ng build -- --base-href /editor/`** — clean (the 1.85 MB bundle-budget warning
  is pre-existing).
- **The e2e suite** (`E2E_PLAYWRIGHT_DIR=<virtual-lab e2e> E2E_BROWSER_CHANNEL=chromium`, the build served
  by `python3 -m http.server` on 8043 because 8044 belongs to the platform's catalog):
  **234 checks green (exit 0)**; the same suite on `origin/master` (a detached build in this worktree) is **215**,
  so this task added 19 — the three scenarios' 7 + 4 + 8 checks.
  The three new scenarios: the quota one 8/8, the no-store one 4/4, the no-writer one 7/7 (all three also
  run green in isolation through `ONLY=`).
- **DW-1.1's second half** (each test fails when its gate is removed): the no-writer scenario was run once
  with its own `createWritable` init script deleted — the "no location choice" check then fails on the
  offered browser-store card, which is the failure the test exists to catch. The quota scenario fails its
  "save failure names the error" check when the patch is removed (the save then succeeds and the edit is
  marked saved, so the remaining checks fail too). Both recorded from that run.

## The first run's four failures, and why they are not this task's

The first full run on this branch (before the no-writer scenario's own assertions were corrected) had four
failures outside the new scenarios: two in *honest saving* (a Ctrl+S still *Unsaved* after 500 ms), one
*one tab per project* (the File menu click not "stable" within 30 s), one *FmtNoVer: the scene opens without
questions*. The same run also logged a `fonts.googleapis.com` `ERR_NAME_NOT_RESOLVED` and an
`ERR_NETWORK_CHANGED` on a reload — this machine's network was flapping, and CPU was contended by the other
two workers. Re-run on the same code, all four pass, and the whole suite is green. `app/src/` is untouched by
this task (the diff is `app/e2e/run.mjs` additions plus three markdown files), so there is no path by which
these scenarios could have caused them; the baseline run on `origin/master` (215 green) was made through the
same conditions to prove the suite itself. Both runs are recorded here rather than quietly dropped.

## Known limitations inherited

- A browser with the picker but no `createWritable` cannot write through the disk store either; the editor
  reports the failure rather than offering a read-only project. No Chromium version that has
  `showDirectoryPicker` lacks `createWritable`, so this combination is synthetic — it is the shape the
  feature detection must refuse, and it now refuses it in the open.
- The full-suite e2e count is recorded in `README.md`; the B1 merge (202 checks) predates these three
  scenarios, and any check that fails on this branch but not on `origin/master` is a defect of this task,
  not of R1.
