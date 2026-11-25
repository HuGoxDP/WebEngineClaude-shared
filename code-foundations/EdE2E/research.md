# Research: EdE2E — an editor e2e check harness the MS-2 editor tasks can add to

A runner (`npm run e2e:checks -- <editor-url>`) that runs every `app/e2e/checks/*.mjs` as its own
process and reports one `PASS`/`FAIL <file>` line per file, plus a shared helper module
`app/e2e/lib/harness.mjs` copied from `run.mjs`. Every other MS-2 editor task writes its own check
here instead of editing the guarded `run.mjs`.

**Date:** 2026-11-25 (Claude architect, autonomous run)
**Status:** confirmed by recommendation. No user was present, so the grill below was answered
by recommendation and the cold read was skipped.
**Written against:** WebEngineTSEditor `origin/master` = `a1f8619`. MS-2 draft spec
`.workers/milestones/MS-2/spec.md` (AC-9, U-7, shared decision "Editor e2e", hub-file ownership).
`.workers/gate.sh` as of 2026-11-25.
**Still open:** nothing blocks the plan. One deferral (D-7) and one proposal for the owner
(Q-1, answered).

## Why it exists

- `gate.sh` runs no editor tests. `app/package.json` has no `test` script, so for the editor the
  gate runs only the typecheck (`tsc --noEmit -p tsconfig.json`; `.mjs` files are outside it)
  and the test guard.
- The test guard (`TEST_RE`, gate.sh:410) matches `e2e/`, and it fails on any **M/D/R** of a
  matching path since the base. Additions (**A**) are allowed. So `app/e2e/run.mjs` (4442 lines,
  51 scenarios) and `app/e2e/scenariocreator-check.mjs` are frozen for the whole milestone.
  Every C4r* ROADMAP row says "e2e: … Files: app/e2e/run.mjs", and that route is closed.
- The MS-2 editor AC (AC-10…AC-16) are `hidden-close`: plain `node <file>.mjs <editor-url>`
  Playwright checks, run by the Claude pass inside `editor-e2e.lock`. The coders' own proofs of
  those rows need the same shape: a new file per task, `app/e2e/checks/<ID>.mjs`.

## What the spec fixes (binding)

- **AC-9:** `npm run e2e:checks -- <editor-url>` in `app/`:
  - runs every `app/e2e/checks/*.mjs` against that URL;
  - prints one `PASS <file>` / `FAIL <file>` line per file;
  - exits non-zero when any file fails or none ran.

  `app/e2e/run.mjs` and `app/e2e/scenariocreator-check.mjs` stay byte-identical to the base.
- **U-7:** those two files are byte-identical and pass on the milestone tip.
- **Shared decision "Editor e2e":**
  - EdE2E creates `app/e2e/lib/harness.mjs`, a copy of the page/instrument/project helpers of
    `run.mjs`. `run.mjs` itself is not touched.
  - EdE2E also creates `app/e2e/checks/` and the runner script `e2e:checks`.
  - Every other editor task puts its check in `app/e2e/checks/<ID>.mjs`.
  - Editor e2e runs only inside `editor-e2e.lock`.
  - EdE2E lands before any editor task merges its `checks/<ID>.mjs`.
- **Hub file:** only EdE2E edits `app/package.json`, and only to add `e2e:checks`.
  `app/package-lock.json` belongs to EdLock. A script entry does not appear in the lock, so the
  two rows do not conflict.

## Facts from the code (origin/master a1f8619)

- **`run.mjs` structure:**
  - Module-level state: `HERE`, `E2E` (the Playwright dir), `CHANNEL`, `SHOTS = HERE/../../.shots`,
    `URL_ = argv[2] ?? "http://localhost:8044/editor/"`, a top-level `await chromium.launch(...)`
    (SwiftShader flags), `failed`, `check()`, `lastPage`.
  - The runner loop at :4420–4442 runs the scenarios, honours `ONLY`, takes a failure screenshot,
    closes every context after each scenario (the T2 fix: leaked contexts made boots 100× slower),
    then exits with `failed ? 1 : 0`.
- **Helpers to copy:**
  - Page and browser: `newPage` :66, `siblingPage` :80, `instrument` :88.
  - Disk: `pick` :128, `seed` :131, `diskState` :145, `readDisk` :160, `exportFolder` :290.
  - Write and read seams: `slowAutosave` :175, `slowLibraryWrite` :196, `failNextWrite` :217,
    `failReads` :234, `holdScriptRead` :248, `holdStampRead` :267.
  - UI: `shot` :313, `dialogTitle`/`dialogButton`/`menu` :315–320, `noErrors` :327.
  - Projects: `seedScriptProject` :334, `openEmptyProject` :342, `sceneWith` :351.
  - Fixtures: `ROTATOR` :394, `SCENARIO_ENTRY` :405, `LIBRARY_NAMES` :744.
  - Library: `openLibraryProject` :750, `addFromLibrary` :766.
  - Scripts and OPFS: `editScript` :1181, `opfsEntries` :2126, `opfsRead` :2136.
  - Scene builders: `sceneAt`/`oneRoot`/`meta` :2689–2695.
  - The `wets:debug:probe` flag on `newPage({probe:true})` installs `window.__wetsProbe`
    (`transformOf(name)`). Play and Stop are `.tb-btn[title='Play'|'Stop']`, and save is
    `Control+s`. Both are inline in scenarios, not helpers.
- **Paths change with depth.** The default Playwright dir is `HERE/../../../testv/virtual-lab/e2e`,
  and that directory **does not exist on this machine**: the workspace has `virtual-lab/e2e`, and
  workers pass `E2E_PLAYWRIGHT_DIR=<…>/virtual-lab/e2e`. A copy in `app/e2e/lib/` must add one
  `../` to both the Playwright default and `SHOTS`. A copied path left as it is would be wrong.
- **`.shots`** is git-ignored at the repo root. Node is v24 on the owner's machine and 22 in CI.
- **No ScenarioCreator coupling.** `scenariocreator-check.mjs` has its own `check()` and no
  browser. AC-10's new `scenariocreator-components.mjs` is C4r8's file, not a `checks/` file.

## Decisions (by recommendation; each is reversible inside EdE2E)

- **D-1 One process per check file.** The runner spawns `node <file> <url>` (`process.execPath`,
  no shell), one file at a time in sorted file-name order, with stdio piped.
  - PASS means exit 0. Anything else, a timeout or a spawn error is FAIL.
  - This keeps the hidden-close contract ("plain `node <file>.mjs <editor-url>`"). A crash in one
    check cannot hide another check's result, and the runner needs no knowledge of Playwright.
  - The rejected option was importing checks as modules: shared browser state, and one throw
    stops the run.
- **D-2 Output.**
  - Each result line starts at column 0: `PASS e2e/checks/<name>.mjs` or
    `FAIL e2e/checks/<name>.mjs  — <reason>`. The path is relative to `app/` with forward
    slashes; the reason is `exit <n>`, `timeout <ms>` or `spawn error`.
  - Child stdout and stderr are relayed live, every line prefixed with four spaces, so no child
    line (the harness's own `PASS  <check name>` lines) can be mistaken for a file result.
  - One summary line at the end, `e2e:checks: <p> passed, <f> failed`. It never starts with
    PASS or FAIL.
- **D-3 Fail-closed exits.**
  - Exit 0 only when at least one file ran and every file passed.
  - Exit 1 when any file failed, when none ran (no `checks/` directory, no `*.mjs`, or an `ONLY`
    filter that matches nothing), or on a bad `E2E_CHECK_TIMEOUT_MS`. "None ran" prints a
    message.
- **D-4 Which files count.** Only `*.mjs` files directly in `checks/`. Subdirectories and other
  extensions are ignored, which leaves room for per-check fixtures under `checks/<ID>/`.
- **D-5 Knobs.**
  - `argv[2]` is the editor URL. It is passed to every child as `argv[2]`. When it is absent,
    no argument is passed and each check takes the harness default `http://localhost:8044/editor/`,
    as `run.mjs` does.
  - `ONLY=<text>` filters by file name, like `run.mjs`.
  - `E2E_CHECK_TIMEOUT_MS` is the per-file timeout, default 600000.
  - `E2E_CHECKS_DIR` points at another directory and exists for the runner's own tests.
  - The environment is inherited, including `E2E_PLAYWRIGHT_DIR`, `E2E_BROWSER_CHANNEL` and
    `LANG`.
- **D-6 Timeout kills the tree.** A timed-out check owns a browser that Playwright cannot clean
  up when its parent is force-killed. On Windows the runner runs `taskkill /pid <pid> /T /F`. On
  POSIX the child is spawned `detached` and the runner kills its process group with
  `process.kill(-pid, "SIGKILL")`.
- **D-7 Split.** The pure runner logic (list, spawn, time out, format, exit code) lives in
  `app/e2e/lib/checks-runner.mjs`. The CLI `app/e2e/run-checks.mjs` stays a thin shell over it, so
  `node --test` can exercise the logic with fake check files and no browser.
- **D-8 Harness shape: the copy stays a copy.**
  - Every helper that does not touch module state is copied **verbatim** (same text and
    indentation), so `runMjsSource.includes(fn.toString())` proves the copy. This is a node:test
    fidelity check, and it pins the copy against drift.
  - Only the four that touch module state are adapted, each listed in its header comment:
    `newPage`, `siblingPage`, `instrument` and the paths.
  - The browser launches **lazily**: the first `newPage` launches it with the same flags.
    Importing the harness launches nothing and does not even `require("playwright")`, so its
    unit tests run without a browser.
- **D-9 Harness additions.** These are new, small and named. The harness cannot be edited later
  in MS-2 (test guard), so they must be there from day one:
  - `check(name, ok, detail)` with the same output as `run.mjs`.
  - `runCheck(fn)`: run it; on a throw take the failure screenshot and record `scenario completed`
    FAIL; close every context and the browser; exit 1 if any check failed **or none was
    recorded** (fail-closed), else 0.
  - `play(page)` / `stop(page)`: click the toolbar Play/Stop buttons and wait for the mode
    change.
  - `save(page)`: `Control+s` plus the settle wait the scenarios use.
  - `selectInHierarchy(page, name, nth = 0)`.
  - `transformOf(page, name)` reads `window.__wetsProbe.transformOf(name)`, or null without the
    probe.

  These are what AC-11…AC-16's checks need (Library add, dialogs, two same-named roots,
  Play/Stop, focus, Code tab). They are built only from selectors and steps `run.mjs` already
  uses, so they are not new UI knowledge.
- **D-10 A smoke check ships with the runner.** `app/e2e/checks/EdE2E.mjs`:
  - starts on the start screen;
  - opens a seeded Library project with `openLibraryProject`;
  - adds Rotator with `addFromLibrary`;
  - reads `scripts/library/Rotator.ts` back with `readDisk`;
  - asserts no native dialogs and `noErrors`.

  It proves the copied helpers work against a real editor (wrong paths and wrong selectors show
  up here). It also makes `checks/` exist in git and gives `e2e:checks` a real file on the
  EdE2E tip.
- **D-11 No `test` script (answers Q-1).** The Claude pass allowed `app/` to gain a `test`
  script. EdE2E does not use that allowance:
  1. `gate.sh` has no exception path today. `pkg_guarded_scripts` compares the base's
     `{"scripts":{}}` with the head's, so a new `test` script FAILs the guard on **every later
     editor gate of `ms/2`**, not just EdE2E's.
  2. The spec gives `app/package.json` to EdE2E for `e2e:checks` "and nothing else".
  3. Everything EdE2E adds under `e2e/` is frozen by the guard once merged, so a gate-run unit
     test would guard files nobody can change.

  The node:test files are still written (new files, allowed) and run by hand in Done-when. A
  later `"test": "node --test e2e/lib/"` makes them gate-run once the owner lands the rule tweak
  in draft-notes Q1 (MS-3).
- **D-12 Docs.**
  - A README section: how to run `e2e:checks`, the `checks/<ID>.mjs` contract, the lock.
  - One line in the editor `CLAUDE.md` Layout/Commands.
  - CI (`.github/workflows/ci.yml`) is **not** changed. The CI e2e job builds and serves
    `/editor/`, so adding `e2e:checks` there is a one-step follow-up, deferred (not in the AC; the
    spec lists no CI change).

## The `checks/<ID>.mjs` contract (what later tasks rely on)

```js
import { runCheck, newPage, openLibraryProject, addFromLibrary, check, noErrors } from "../lib/harness.mjs";
await runCheck(async () => {
    const page = await newPage("C4r12Parent", { probe: true });
    // … steps …
    check("what it proves", ok, detail);
    check("no page errors", noErrors(page), page.logs.join(" | "));
});
```

- The URL is `argv[2]`, read by the harness.
- Exit 0 means every `check` passed and at least one ran.
- Fixtures go in `checks/<ID>/` or inline.
- A check never edits `run.mjs`, `harness.mjs` or another task's check.

## Grill (answered by recommendation)

1. *Should the runner run checks in parallel?* No. `editor-e2e.lock` serialises editor e2e, and
   several SwiftShader browsers at once caused the T2-style slowdowns. Running in series is also
   the deterministic choice.
2. *Should a check with zero `check()` calls pass?* No. The harness exits 1 (D-9), and the runner
   only sees the exit code. This closes "a check that silently skipped everything".
3. *Should the runner find `.mjs` in subdirectories?* No (D-4). Each task owns a flat
   `<ID>.mjs`, and fixtures need somewhere that is not executed.
4. *What if a later task needs a helper the harness lacks?* It writes the helper inside its own
   check file. Editing `harness.mjs` after EdE2E merges FAILs the guard. That is why D-9 adds the
   Play/Stop/save/select helpers up front.
5. *Default URL when none is given?* Each check falls back to the harness default (8044), like
   `run.mjs`. The spec's command always passes one.
6. *Does adding `e2e:checks` trip the guard?* No. The guard regex is
   `^(pre|post)?(lint|typecheck|test)(:|$)`, and `e2e:checks` does not match it.
