# R1 — a project store outside Chromium: research (W1)

Card: `tasks/E-growth.md` R1. Decision **#10** (delegated): *"OPFS first (no server state, no auth);
server store when share links or co-editing are scheduled."* Branch `R1-opfs-project-store` in
`WebEngineTSEditor` (+ `.claude-shared`).

## Facts checked against the code (`master` `55e6507` + master's editor state)

| Fact | Where |
|---|---|
| The whole ProjectService is typed around `ProjectFolderHandle = FileSystemDirectoryHandle` (+ `queryPermission`/`requestPermission`, which the panel calls before use) | `app/src/app/services/project.service.ts:52-66` |
| No OPFS: without `window.showDirectoryPicker` the service goes straight to `status: 'unsupported'` | `project.service.ts:108-115` |
| The public surface the rest of the app uses: `pickFolder`, `inspect`, `folderState`, `createFolderIn`, `adopt`, `openRecent`, `forgetRecent`, `close`, `refresh`, `list`, `exists`, `readFile`/`readText`, `write`, `modifiedAt`, `removeQuietly`, `createFolder`, `importFiles`, `remove`, `initializeLayout`, `loadRecents` | the same file, in that order |
| Recents persist *handles* in IndexedDB (`RECENTS` store, `MAX_RECENTS` 10), identity via `isSameEntry` | `project.service.ts` `_remember`, `idb()` |
| The editor has **no unit tests**; its safety net is `npm run e2e` (`app/e2e/run.mjs`), which already replaces `showDirectoryPicker` with one returning a **real OPFS** `FileSystemDirectoryHandle`, so every flow after the dialog already runs the disk-handle code against OPFS in the browser | `app/e2e/run.mjs:10-18` |
| The e2e runner borrows Playwright/Edge from `testv/virtual-lab/e2e`, or `E2E_PLAYWRIGHT_DIR` / `E2E_BROWSER_CHANNEL` | `app/e2e/run.mjs:25-34` |
| The project layout written by `initializeLayout` is ScenarioCreator's (`scripts/`, `assets/scenes/`, `scenario.meta.json`) | `project.service.ts` `initializeLayout` |

## Facts checked on the web (2026-11-11)

- `navigator.storage.getDirectory()` (OPFS): Chrome/Edge 86, Firefox 111, Safari 15.2 — Baseline
  "widely available" (MDN BCD, web.dev/origin-private-file-system).
- OPFS handles are `[Serializable]`: they can live in IndexedDB / cross postMessage, same-origin
  only (`fs.spec.whatwg.org` §2.2, MDN). So an OPFS recent is the same object the disk path
  already stores — no descriptor redesign is *needed*; a kind tag is still cleaner.
- OPFS has **no permission prompts**, and `queryPermission`/`requestPermission` are removed from
  the File System Standard (only `kind`, `name`, `isSameEntry` remain) — the abstraction must
  treat them as optional (MDN; fs.spec.whatwg.org).
- `createWritable()` on OPFS is **Safari 26+** (BCD; WebKit blog 17333). Older Safari can write
  only through a worker sync access handle (`createSyncAccessHandle` is DedicatedWorker-only,
  post-Spectre) — so "all browsers" means: OPFS read/write where `createWritable` exists, and a
  clear *unsupported* where it does not (today that is Safari < 26), exactly like the disk store
  already reports for non-Chromium. A sync-handle worker path is out of scope for R1 (note it in
  the plan as the later extension).
- Quotas/eviction (MDN, web.dev): OPFS shares the origin quota (Chromium up to 60% of disk,
  Firefox best-effort min(10%, 10 GiB)), best-effort origins can be evicted whole;
  `navigator.storage.persist()` opts out of eviction; `estimate()` reports it under
  `usageDetails.fileSystem` (Safari lacks `estimate()` below 17). Deletes with site-data clears.
- Private-mode gaps: Safari private browsing has no OPFS (WebKit bug 12257); Firefox PBM support
  is an open/reopened bug (1975760); Chrome incognito: unknown — feature-detect and fall back to
  the existing *unsupported* state.

## Decisions made here (the card left them open)

- **D1.** The store is an interface, `ProjectStore`, with exactly the operations the service uses
  today; `FileSystemAccessStore` (today's code, untouched) and `OpfsStore` (new) implement it. The
  service keeps its public API and signals — no screen changes.
- **D2.** OPFS layout: `<opfs root>/projects/<projectId>/…`, one folder per project, so a second
  project in one browser is isolated and a future export can zip one folder.
- **D3.** Recents keep a `kind: 'disk' | 'opfs'` + the handle (handles are serializable either
  way); `openRecent` skips the permission request for OPFS (there is none) and still verifies the
  folder is there (`NotFoundError` → `'missing'`, as today).
- **D4.** Feature detection at construction: `navigator.storage.getDirectory()` **and**
  `createWritable` present → OPFS offered. Otherwise the status stays `'unsupported'` with the
  existing message, and the start screen offers the disk path as today.
- **D5.** First write asks for `navigator.storage.persist()` (best effort); a
  `QuotaExceededError` surfaces as a toast naming the quota, never a silent partial write.
- **D6.** The sync-access-handle worker fallback for Safari < 26 is **not** part of R1; it becomes
  a follow-up row only if a real author hits it.
