# Plan: EdE2E — editor e2e check harness (`e2e:checks` + `app/e2e/lib/harness.mjs`)
**Created:** 2026-11-25 (Claude architect, autonomous run)
**Status:** ready
**Complexity:** medium
**Review cadence:** 3
**Check-ins:** quiet
---
## Context
Research and decisions D-1…D-12 are in `code-foundations/EdE2E/research.md`.

**Problem.** The gate runs no editor tests. The test guard freezes every existing file under
`app/e2e/`, so the MS-2 editor rows (C4r12, C4r13, C4r15, C4r18, C4r7, C4r9) cannot add their
proof to `run.mjs`. They need:
- a place for one new check file each (`app/e2e/checks/<ID>.mjs`);
- a shared helper copy (`app/e2e/lib/harness.mjs`);
- one runner that reports a result per file.

**Success criteria** (AC-9, U-7 of `.workers/milestones/MS-2/spec.md`):
1. `npm run e2e:checks -- <editor-url>` in `app/` runs every `app/e2e/checks/*.mjs` against that
   URL.
2. It prints one `PASS <file>` / `FAIL <file>` line per file.
3. It exits non-zero when any file fails or none ran.
4. `app/e2e/run.mjs` and `app/e2e/scenariocreator-check.mjs` are byte-identical to the base and
   still pass.
5. A check written against `harness.mjs` runs against a live editor (the smoke check
   `checks/EdE2E.mjs` is green).

## Constraints
- **Test guard.**
  - No existing file under `app/e2e/` may be modified, deleted or renamed. Every file this plan
    creates there is new.
  - No `lint`/`typecheck`/`test*` script may change in `app/package.json`, so this plan adds
    **no `test` script** (research D-11).
  - Once merged, `harness.mjs` and the runner are frozen for the rest of MS-2. They must be
    complete at merge.
- **Hub file.** `app/package.json` is touched only by Phase 4 (the integrator), and only to add
  `"e2e:checks": "node e2e/run-checks.mjs"`. `app/package-lock.json` is EdLock's; do not touch it.
- **No engine delivery.** No `release:local` and no tarball change. The editor builds against its
  committed `app/WebEngineTS-0.1.0.tgz`.
- **Locks and browsers.**
  - Anything that starts the editor (`ng serve`, `npm start`) or a browser runs inside
    `editor-e2e.lock`: `bash R/.workers/wk.sh lock editor-e2e W<n> EdE2E`, then `unlock`.
  - Playwright comes from `E2E_PLAYWRIGHT_DIR=<worktree>/virtual-lab/e2e` (after `npm ci` there)
    with `E2E_BROWSER_CHANNEL=chromium`. The `testv/` default does not exist on this machine.
- **Never weaken a check.** If something here is not answered, park it as a question in ATTENTION.
  Do not guess.

## Chosen Approach
**One process per check, with a frozen helper copy.**
- A pure runner module (`lib/checks-runner.mjs`) spawns `node <check> <url>` for each file, in
  series, sorted, with a per-file timeout and a process-tree kill.
- A thin CLI (`run-checks.mjs`) sits over it.
- `lib/harness.mjs` holds `run.mjs`'s helpers. Most are verbatim, which a `toString()` fidelity
  test proves. Only the browser launch and the paths are adapted, and the browser launches lazily.
- The harness adds `check` and `runCheck` (fail-closed when no check ran) plus five small helpers
  later rows need.

**Fallback:** if the process-tree kill on Windows proves unreliable, drop to a plain
`child.kill()`, and record the orphan-browser risk in notes and ATTENTION.

## Rejected Approaches
- **Checks as imported modules in one process:** shared browser and module state, and one throw
  aborts the run. It also breaks the hidden-close contract `node <file>.mjs <url>`.
- **A `test` script for `node --test`** (allowed by the Claude pass 2026-11-25):
  - `gate.sh` has no exception path, so every later `ms/2` editor gate would FAIL the guard.
  - The spec gives `package.json` to EdE2E for `e2e:checks` only.
  - The files it would test are frozen anyway.

  Deferred to MS-3 with the owner's rule tweak.
- **Importing helpers from `run.mjs`:** its top level launches a browser and runs 51 scenarios,
  and it cannot be edited to export anything.

---
## Implementation Phases

### Phase 1: The runner — `e2e:checks` logic and CLI
**Skills:** code-foundations:cc-defensive-programming, code-foundations:cc-routine-and-class-design
**Model:** sonnet
**Gate:** Standard
**AC:** AC-9
**Risk:** normal
**Depends on:** none
**File scope:** WebEngineTSEditor: app/e2e/lib/checks-runner.mjs, app/e2e/run-checks.mjs, app/e2e/lib/checks-runner.test.mjs

**Goal:** Run every `checks/*.mjs` as its own process. Report one result line per file. Exit
fail-closed (research D-1…D-7).

**Scope:**
- IN:
  - `lib/checks-runner.mjs` exports `listChecks(dir, only)` and `runChecks(opts)` (contract under
    *Produces*).
  - `run-checks.mjs` is a CLI of 30 lines or fewer. Its header comment carries the usage, the
    knobs, the `checks/<ID>.mjs` contract (research §contract) and the lock rule.
  - Child output is relayed live, each line prefixed with 4 spaces.
  - Tree kill on timeout: `taskkill /pid <pid> /T /F` on `win32`; on POSIX a `detached` spawn
    plus `process.kill(-pid, "SIGKILL")`.
- OUT:
  - Any browser or Playwright code.
  - Parallel runs.
  - Recursion into subdirectories.
  - `app/package.json` (Phase 4).

**Edge cases:**
- `checks/` missing or empty, or no `*.mjs` in it: print `e2e:checks: no checks ran` and exit 1.
- An `ONLY` filter that matches nothing: same, exit 1.
- `E2E_CHECK_TIMEOUT_MS` set but not a positive integer: an error message, exit 1, nothing
  spawned.
- A check that exits 0 while writing to stderr: PASS (the exit code decides).
- A check killed by a signal (`code === null`): FAIL, reason `signal <name>`.
- A spawn error: FAIL, reason `spawn error: <message>`, and the run continues with the next file.
- A child line that itself starts with `PASS`/`FAIL` is relayed indented, never at column 0.
- Non-`.mjs` files and `checks/<ID>/` subdirectories are ignored.
- File names are listed in plain code-point order, not locale order.

**Produces:** a contract that Phase 4 and every later editor task rely on.

```js
// app/e2e/lib/checks-runner.mjs
export function listChecks(dir: string, only?: string): string[]   // sorted *.mjs basenames directly in dir; [] if dir missing
export async function runChecks(opts: {
  dir: string,              // checks directory
  url?: string,             // passed as argv[2] to each check when defined
  only?: string,            // substring filter on the basename
  timeoutMs?: number,       // per file, default 600000
  label?: (file) => string, // how a file is named in result lines; CLI: `e2e/checks/<basename>`
  write?: (line) => void,   // output sink, default process.stdout
}): Promise<{ results: { file: string, ok: boolean, reason: string }[], exitCode: 0 | 1 }>
```

CLI: `node e2e/run-checks.mjs [editor-url]`, honouring `ONLY`, `E2E_CHECK_TIMEOUT_MS` and
`E2E_CHECKS_DIR` (default `<HERE>/checks`). Result lines read
`PASS e2e/checks/<f>.mjs` or `FAIL e2e/checks/<f>.mjs  — <reason>`. The summary reads
`e2e:checks: <p> passed, <f> failed`. The process exit is `exitCode`.

**Done when:**
- [ ] DW-1.1: `cd app && node --test e2e/lib/checks-runner.test.mjs` exits 0, with at least 10
  tests. Each one builds fake checks in an `os.tmpdir()` dir:
  - two passing files plus one `process.exit(3)`: exit 1; result lines in sorted order, exactly
    one `FAIL` naming the third file, reason `exit 3`;
  - all pass: exit 0;
  - empty dir, and missing dir: exit 1 with `no checks ran`;
  - an `ONLY` that matches nothing: exit 1;
  - a check that throws at top level: FAIL;
  - a child printing `PASS  fake` appears in the output only as `    PASS  fake`, and no
    column-0 line names anything but a file;
  - a `.js` file and `sub/x.mjs` are not run;
  - the URL reaches the child as `argv[2]`, and no argument is passed when `url` is undefined;
  - a bad `E2E_CHECK_TIMEOUT_MS` exits 1 with nothing spawned.
- [ ] DW-1.2 (dirty test, timeout): a fake check that spawns a grandchild `node` (writing its
  pid to a file) and then hangs, run with `timeoutMs: 1500`:
  - FAIL with reason `timeout 1500`;
  - within 5 s the grandchild pid no longer exists (`process.kill(pid, 0)` throws);
  - the run then continues to the next file.
- [ ] DW-1.3: The CLI end to end:
  - `E2E_CHECKS_DIR=<empty tmp> node e2e/run-checks.mjs http://127.0.0.1:9/` exits 1 and prints
    `e2e:checks: no checks ran`;
  - with a tmp dir holding one `process.exit(0)` check, it exits 0 and prints
    `PASS e2e/checks/<name>.mjs`.
- [ ] DW-1.4: `git -C <worktree>/WebEngineTSEditor diff --quiet <base> -- app/e2e/run.mjs app/e2e/scenariocreator-check.mjs app/package.json app/package-lock.json`
  exits 0, and `git diff --name-status <base>` lists only `A` entries in the File scope.

### Phase 2: The harness — `app/e2e/lib/harness.mjs`
**Skills:** code-foundations:aposd-designing-deep-modules, code-foundations:code-clarity-and-docs
**Model:** sonnet
**Gate:** Standard
**AC:** AC-9 (the shared decision "Editor e2e": the harness copy), U-7
**Risk:** normal
**Depends on:** none
**File scope:** WebEngineTSEditor: app/e2e/lib/harness.mjs, app/e2e/lib/harness.test.mjs

**Goal:** Copy `run.mjs`'s page, instrument and project helpers into an importable module with
no side effect at import, and add the check bookkeeping and the helpers later rows need
(research D-8, D-9).

**Scope:**
- IN:
  - **Verbatim copies** from `run.mjs` at `a1f8619`. Same text, same indentation, same names:
    - `siblingPage`, `instrument`;
    - `pick`, `seed`, `diskState`, `readDisk`, `exportFolder`;
    - `slowAutosave`, `slowLibraryWrite`, `failNextWrite`, `failReads`, `holdScriptRead`,
      `holdStampRead`;
    - `shot`, `dialogTitle`, `dialogButton`, `menu`, `noErrors`;
    - `seedScriptProject`, `openEmptyProject`, `sceneWith`, `sceneAt`, `oneRoot`, `meta`;
    - `ROTATOR`, `SCENARIO_ENTRY`, `LIBRARY_NAMES`;
    - `openLibraryProject`, `addFromLibrary`, `editScript`, `opfsEntries`, `opfsRead`.

    All of these are exported.
  - **Adapted** (each named in the header comment with the reason):
    - `HERE`;
    - `E2E`, where the default gains one `../` (`resolve(HERE, "../../../../testv/virtual-lab/e2e")`);
    - `SHOTS = resolve(HERE, "../../../.shots")`;
    - `CHANNEL`;
    - `URL_ = process.argv[2] ?? "http://localhost:8044/editor/"`;
    - `newPage`, whose only change is that it gets its browser from a lazy `browser()`.
  - The lazy `browser()` `createRequire`s Playwright and launches with the same 4 SwiftShader
    args on first use. `mkdirSync(SHOTS)` also moves to first use.
  - **New exports:**
    - `check(name, ok, detail)`, with the output format of `run.mjs`;
    - `runCheck(fn)`: on a throw, a failure screenshot to `SHOTS/e2e-failure-<basename>.png` and
      a `scenario completed` FAIL; then every context and the browser are closed (when one was
      launched), and the process exits 1 if any check failed **or none was recorded**, else 0;
    - `play(page)`: click `.tb-btn[title='Play']`, wait until `.tb-btn[title='Stop']` is
      enabled;
    - `stop(page)`: the reverse;
    - `save(page)`: `Control+s`, then 800 ms, as the scenarios do;
    - `selectInHierarchy(page, name, nth = 0)`: click the nth `app-hierarchy li` with that text,
      then 300 ms;
    - `transformOf(page, name)`: implemented as
      `page.evaluate(n => window.__wetsProbe?.transformOf(n) ?? null, name)`. It returns `null`
      without the probe, which needs `newPage(…, { probe: true })`.
- OUT:
  - Any scenario of `run.mjs`.
  - The `ONLY` loop.
  - ScenarioCreator helpers.
  - Any edit to `run.mjs`.

**Edge cases:**
- Importing the harness with `E2E_PLAYWRIGHT_DIR` pointing at a missing dir must not throw and
  must not create `.shots`.
- `runCheck` with no browser ever launched must still exit cleanly.
- A screenshot failure inside `runCheck` is swallowed (`.catch(() => {})`, as in `run.mjs`).
- `runCheck` may be called only once per process. A second call throws.

**Produces:** the import surface for every `checks/<ID>.mjs`:
`import { runCheck, check, newPage, … } from "../lib/harness.mjs"`.
The names and signatures are exactly those of `run.mjs` plus `check`, `runCheck`, `play`, `stop`,
`save`, `selectInHierarchy` and `transformOf`.

**Done when:**
- [ ] DW-2.1: `cd app && node --test e2e/lib/harness.test.mjs` exits 0. Its fidelity test reads
  `e2e/run.mjs` and asserts:
  - for every verbatim function export, `src.includes(fn.toString())`;
  - for `ROTATOR` and `SCENARIO_ENTRY`, `src.includes(value)`;
  - `LIBRARY_NAMES` deep-equals the ten names.

  The list of verbatim function exports is a constant in the test, with exactly the 29 names
  in the Scope list. The three constants are checked separately, as above.
- [ ] DW-2.2: An import-time test spawns a child `node --input-type=module -e "await import('<harness file URL>')"`
  with `E2E_PLAYWRIGHT_DIR=<a dir that does not exist>`, and the child exits 0. Exit 0 proves
  that the import neither requires Playwright nor launches a browser, because either would throw
  there.
- [ ] DW-2.3 (dirty tests, fail-closed): spawned tiny scripts that import the harness:
  - `runCheck(async () => {})` exits 1 and prints a line saying no check ran;
  - `runCheck(async () => check("x", false, "d"))` exits 1 and prints `FAIL  x  — d`;
  - `runCheck(async () => { throw new Error("boom") })` exits 1 and prints a
    `FAIL  scenario completed` line containing `boom`;
  - `runCheck(async () => check("x", true))` exits 0.

  None of them launches a browser.
- [ ] DW-2.4: The seven `noErrors` synthetic cases of `run.mjs`'s B1r5 scenario (`run.mjs:368-386`
  at `a1f8619`) are copied into `harness.test.mjs`, and they hold against the harness's
  `noErrors`.
- [ ] DW-2.5: The same byte-identical diff as DW-1.4, for this phase's scope.

### Phase 3: Smoke check — `checks/EdE2E.mjs` against a live editor
**Skills:** code-foundations:aposd-verifying-correctness
**Model:** sonnet
**Gate:** Standard
**AC:** AC-9, U-7
**Risk:** normal
**Depends on:** Phase 1, Phase 2
**File scope:** WebEngineTSEditor: app/e2e/checks/EdE2E.mjs

**Goal:** Prove the harness and the runner work end to end against `ng serve`. The check also
exercises every new helper, because nothing can fix the harness after it merges (research D-10).

**Scope:**
- IN: one `runCheck` with these steps:
  - `newPage("EdE2EParent", { probe: true })`;
  - the start screen shows `Open folder…`;
  - `openLibraryProject`, then `addFromLibrary(page, "Rotator")`;
  - `readDisk` shows `scripts/library/Rotator.ts` containing `typeName: "Rotator"`;
  - `play`, then within 10 s the probe shows `Spinner`'s euler y has changed by more than 5;
  - `stop`, then `selectInHierarchy(page, "Spinner")`, and the euler y is back below 0.01;
  - `save`, then `readDisk` of `assets/scenes/main.scene.json` holds a `Rotator` component;
  - `page.nativeDialogs === 0` and `noErrors(page)`.
- OUT: anything another MS-2 row proves (overwrite prompts, duplicate names, focus reload, the
  Code tab, edit mode).

**Edge cases:** the check must not depend on `.shots` fixtures, ScenarioCreator or the order of
other checks. It uses its own folder name.

**Done when:**
- [ ] DW-3.1: Inside `editor-e2e.lock`, with `npm start` (`ng serve --port 4200`) up,
  `node e2e/run-checks.mjs http://localhost:4200/` exits 0 and prints
  `PASS e2e/checks/EdE2E.mjs`. Record the run's wall time in notes.
- [ ] DW-3.2 (dirty test, the check really checks): against a URL with nothing listening
  (`http://127.0.0.1:9/`), the same command exits 1 with `FAIL e2e/checks/EdE2E.mjs`.
  Also, a scratch copy of the check in an `os.tmpdir()` dir (never inside `app/`), with its
  harness import rewritten to the absolute file URL of `app/e2e/lib/harness.mjs` and expecting
  `typeName: "NotRotator"`: run through `E2E_CHECKS_DIR=<that dir> node e2e/run-checks.mjs http://localhost:4200/`,
  it exits 1 with one `FAIL` line. Record both outputs in notes.
- [ ] DW-3.3: No browser or node process outlives the run. Show the process list before and
  after in notes.

### Phase 4: Integrator — `e2e:checks` script, docs, full checks
**Skills:** code-foundations:code-clarity-and-docs
**Model:** sonnet
**Gate:** Standard
**AC:** AC-9, U-7
**Risk:** normal
**Depends on:** Phase 3
**File scope:** WebEngineTSEditor: app/package.json, README.md, CLAUDE.md (both at the repo root)

**Goal:** Wire `npm run e2e:checks`, the only `app/package.json` change of MS-2 outside EdLock's
lock file. Document the check contract. Run the repo's full checks.

**Scope:**
- IN:
  - `app/package.json` gains `"e2e:checks": "node e2e/run-checks.mjs"` after `e2e:build`.
    Nothing else changes: key order kept, 2-space indent, trailing newline as before.
  - `README.md` gains a section "Scripted checks (`npm run e2e:checks`)" covering:
    - the command and the URL argument;
    - `ONLY` and `E2E_CHECK_TIMEOUT_MS`;
    - the `checks/<ID>.mjs` contract (import from `../lib/harness.mjs`, one `runCheck`,
      fixtures in `checks/<ID>/`);
    - that `run.mjs`, `harness.mjs` and the runner are frozen during a milestone (test guard);
    - the lock rule.
  - `CLAUDE.md`: one Layout line naming `app/e2e/lib/harness.mjs` and `app/e2e/checks/`, and
    one Commands line for `npm run e2e:checks -- <url>`.
- OUT:
  - `app/package-lock.json`.
  - Any `test`/`lint`/`typecheck` script.
  - `.github/workflows/ci.yml` (deferred, Notes).
  - Every `app/e2e/` file.

**Edge cases:** if EdLock already merged a lock change, `npm ci` must still succeed. A script
entry does not enter the lock, so the lock stays untouched.

**Done when:**
- [ ] DW-4.1: `git diff -U0 <base> -- app/package.json` shows two changed lines and nothing
  else: the `e2e:build` line gains a trailing comma, and the new `e2e:checks` line is added.
- [ ] DW-4.2: Inside `editor-e2e.lock`:
  - `cd app && npm ci && npm run e2e:checks -- http://localhost:4200/` (`ng serve` up) exits 0,
    and its output has exactly one column-0 `PASS ` line, for `e2e/checks/EdE2E.mjs`;
  - `npm run e2e:checks` with `ONLY=nomatch` exits 1.
- [ ] DW-4.3 (U-7): `git diff --quiet <base> -- app/e2e/run.mjs app/e2e/scenariocreator-check.mjs`
  exits 0. Inside `editor-e2e.lock`, `npx ng build --base-href /editor/`, served at
  `:8044/editor/`, then `npm run e2e` is all green. Record the check count in notes (base: 433
  checks / 29 scenarios in README, 51 scenarios now).
- [ ] DW-4.4: `bash R/.workers/gate.sh <worktree>/WebEngineTSEditor --full` gives PASS (test
  guard: no M/D/R under `e2e/`, guarded scripts unchanged; typecheck green).
- [ ] DW-4.5: `node --test e2e/lib/` (both test files) exits 0 on the tip. Record it in notes as
  the hand-run proof.

---
## Test Coverage
**Level:** Per-phase. The runner and harness logic are unit-tested with `node:test` (no browser).
The browser path is proven by the smoke check and the full suite. The editor has no gate-run
tests by design (D-11).

## Test Plan
- [ ] Runner unit tests: ordering, PASS/FAIL lines, exit codes, empty or missing dir, `ONLY`,
  argv pass-through, ignored files, indented child output, bad timeout env (DW-1.1).
- [ ] Dirty test: timeout kills the process tree and the run continues (DW-1.2).
- [ ] CLI end to end with `E2E_CHECKS_DIR` (DW-1.3).
- [ ] Harness fidelity: verbatim `toString()` inclusion against `run.mjs` (DW-2.1).
- [ ] Harness import has no side effect (DW-2.2).
- [ ] Dirty tests: `runCheck` is fail-closed on no checks, a false check, a throw (DW-2.3).
- [ ] `noErrors` synthetic cases (DW-2.4).
- [ ] Integration: the smoke check green against `ng serve`; fails against a dead URL and against
  a broken scratch copy (DW-3.1, DW-3.2).
- [ ] Integration: `npm run e2e:checks` through npm, `ONLY` no-match (DW-4.2).
- [ ] Regression (U-7): byte-identical `run.mjs`/`scenariocreator-check.mjs` plus the full
  `npm run e2e` green (DW-4.3).
- [ ] Gate: `gate.sh --full` PASS (DW-4.4).
- [ ] Manual: none.

`<base>` in every Done-when means `git merge-base HEAD origin/master` of the editor worktree. On
`ms/2` that is the milestone's fork point, the same base `gate.sh` uses.

## Assumptions
| Assumption | Confidence | Verify Before Phase | Fallback If Wrong |
|---|---|---|---|
| `Function.prototype.toString` returns the exact source text of a copied helper, so `includes` proves the copy | high (ECMA-262 since ES2019) | Phase 2 | Compare normalised text: strip `\r`, trailing spaces |
| `taskkill /T /F` kills the Playwright browser under a timed-out check on Windows | medium | Phase 1 (DW-1.2 proves it with a grandchild) | `child.kill()` plus an ATTENTION note on orphans |
| `.tb-btn[title='Stop']` enabled ⇔ playing (`toolbar.component.ts:31-40`, `[disabled]="!play.isPlaying()"`) | high | Phase 2 | Wait on the Play button's `.playing` class |
| CRLF: the worktree checks `run.mjs` out with the same line endings the harness file gets | medium | Phase 2 (DW-2.1 fails loudly) | Normalise `\r\n` → `\n` on both sides in the fidelity test |

## Decision Log
| Decision | Alternatives Considered | Rationale | Phase |
|---|---|---|---|
| Spawn one process per check | Import checks as modules | Isolation; the hidden-close contract `node <file> <url>` | 1 |
| Four-space indented child output | Capture and print only on failure | Live progress for long checks; column 0 stays the runner's | 1 |
| Lazy browser launch in the harness | Top-level launch as in `run.mjs` | Unit tests without a browser; import has no side effect | 2 |
| Play/Stop/save/select/transformOf helpers added now | Leave them to each row | The harness is frozen after merge (test guard) | 2 |
| No `test` script in `app/package.json` | Use the Claude pass's one-time exception | `gate.sh` has no exception path, so every later `ms/2` editor gate would FAIL; spec: "nothing else" | 4 |
| Smoke check `checks/EdE2E.mjs` | Ship an empty `checks/` | git keeps no empty dir; proves the copy against a live editor | 3 |

---
## Notes
- **Phases 1 and 2 are independent** (disjoint file scopes) and can run in parallel on one
  branch. Phase 3 needs both. Phase 4 is the integrator and the only writer of `app/package.json`
  in MS-2.
- **Merge order (spec):** EdE2E merges before any editor task merges its `checks/<ID>.mjs`.
  EdLock and EdE2E touch different files (lock vs `package.json`), so either can go first.
- **Later rows:** put task-only helpers inside their own check file. Never edit `harness.mjs`,
  the runner or another row's check. The guard FAILs any M/D/R under `e2e/`.
- **Deferred:**
  - a CI step `npm run e2e:checks` in `.github/workflows/ci.yml`, a one-step follow-up after
    MS-2;
  - a gate-run `"test": "node --test e2e/lib/"` once the owner accepts the rule "a package with
    no `test` script on the base may gain one" (MS-1 retro proposal).
- `docs/code-standards.md` was not generated. The plan run writes only into this directory; the
  editor's conventions come from `run.mjs` itself, which the harness copies.
---
## Decided During Build
_Filled by /code-foundations:build — one row per decision an agent made or question it raised:_
| # | Phase | Decision or question | Source | Status |
---
## Execution Log
_To be filled during /code-foundations:build_
