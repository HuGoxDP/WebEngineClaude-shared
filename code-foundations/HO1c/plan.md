# Plan: MS-1 plan B — `selfhost-check` hardening (HO1c → HO1d → HO1f → R3)
**Created:** 2026-11-23
**Status:** ready
**Complexity:** medium
**Review cadence:** 1
**Check-ins:** quiet
---
## Context
`npm run selfhost-check` (virtual-lab `scripts/selfhost-check.mjs`) fails on a stock Windows Node (npm/npx are
`.cmd` shims), leaves a running stack + secrets behind on Ctrl+C, reports GREEN after a failed teardown, misses a
port held on 0.0.0.0/`::`, hides why health/smoke failed, and cannot check the editor container. Research (confirmed,
decisions D1–D14): `code-foundations/HO1c/research.md`. Milestone: MS-1 (`.workers/milestones/MS-1/spec.md`).

**Rows and landings:** Phase 1 = HO1c, Phase 2 = HO1d, Phase 3 = HO1f, Phase 4 = R3. Each row is its own task branch
from the then-current `origin/ms/1` and its own landing; a phase starts only after the previous row has landed.

## Constraints
- Never modify, delete or rename an existing test file or a `test*` package script (gate test guard). New tests =
  NEW files in `scripts/test/`. No `skip`/`todo` in tests (the gate fails on more skipped tests) — return early.
- A run WITHOUT the new flags behaves exactly as today: `parseArgs` output keys, the green step lists, the default
  `composeArgs`/`teardownCommands` arrays, every existing export and its signature (spec U-3, research "Constraints").
- Call sites keep passing `'npm'`/`'npx'` to `exec` (existing fakes match on them); do not reformat the
  `BACKUP_RUN_ONCE=1` line (a test greps it).
- Every new `${VAR}` in a compose file goes into `COMPOSE_INTERPOLATED`.
- `docs/self-host.md`: no heading renamed; every new `docker compose … -f docker-compose…` line has «без HTTPS»
  within the 4 lines above it (or includes `docker-compose.https.yml`).
- Never print or log a generated secret.

## Chosen Approach
**Keep the synchronous runner (`spawnSync`)** and observe an abort after yielding to the event loop between steps
and inside the health wait — Ctrl+C reaches the child too, so it returns. Matches the spec's synchronous
`runCommand` and every existing fake. **Fallback:** if a live run shows a child that ignores Ctrl+C, add a
`timeout` cap on that call (not an async rewrite).
## Rejected Approaches
- **Async `spawn` with an AbortSignal passed to children:** immediate kill, but changes the `exec`/`runCommand`
  contract to Promises (spec risk, all call sites and fakes), for a gain Ctrl+C already gives.

---
## Implementation Phases

### Phase 1: HO1c — npm/npx without a shell, failures that say why
**Skills:** code-foundations:cc-defensive-programming
**Model:** sonnet
**Gate:** Standard
**Depends on:** none | **Unlocks:** Phase 2
**File scope:** virtual-lab: scripts/selfhost-check.mjs, scripts/test/selfhost-run-command.test.mjs
**AC:** AC-11
**Risk:** normal

**Goal:** Make the default runner launch npm/npx through Node itself on Windows and make every failing command step
carry the spawn error and output tail.

**Scope:**
- IN: exported `runCommand` (research D1), used as the default `exec` and `git`; helper for failure details (D2) in
  up, backup, restore, e2e deps, e2e browser, smoke.
- OUT: signals, teardown, ports, editor (later phases); non-Windows behaviour change.

**Edge cases:** `npm_execpath` pointing at pnpm/yarn (ignore — basename must be `npm-cli.js`); npm-cli not found
(plain spawn → named ENOENT); `res.status === null` with `res.error`; empty stderr (use stdout tail).

**Produces:** `export function runCommand(cmd: string, args: string[], opts?: SpawnSyncOptions): {status: number|null, stdout: string, stderr: string, error?: Error}` — synchronous, never throws, never `shell:true`.

**Done when:**
- [ ] DW-1.1: On Windows, `runCommand('npm', ['--version'])` returns status 0 and a semver with `PATH` set to only
  `dirname(process.execPath)`; same for `npx --version` (new test; returns early off Windows).
- [ ] DW-1.2: A fake `exec` returning `{status:null, error:new Error('spawnSync npm ENOENT')}` for `npm ci` gives
  `failed === 'e2e deps'` with a detail containing `ENOENT`; the same shape is tested for every command step that uses the helper: up, backup,
  restore, e2e deps, e2e browser, smoke (one parametrised test is fine).
- [ ] DW-1.3: `node --test scripts/test/*.test.mjs` (= `npm run test:scripts`) green; `git diff --name-only
  --diff-filter=MDR origin/ms/1... -- scripts/test package.json` prints nothing.

**Difficulty:** LOW · **Uncertainty:** where `npx-cli.js` lives in older npm (sibling of `npm-cli.js` since npm 7).

### Phase 2: HO1d — Ctrl+C tears down, a second Ctrl+C stops at once
**Skills:** code-foundations:cc-defensive-programming, code-foundations:cc-control-flow-quality
**Model:** sonnet
**Gate:** Standard
**Depends on:** Phase 1 | **Unlocks:** Phase 3
**File scope:** virtual-lab: scripts/selfhost-check.mjs, scripts/test/selfhost-interrupt.test.mjs, docs/self-host.md
**AC:** AC-12
**Risk:** risk (concurrency/signals)

**Goal:** An interrupted check ends `{ok:false, failed:'interrupted'}` after the normal teardown, and the admin always
has the exact command to clean up by hand.

**Scope:**
- IN: `runCheck({signal})` + `waitHealthy({signal})` (D3 check points, yield-then-check); `manualTeardownCommand`
  (D5); CLI handlers SIGINT/SIGTERM (+SIGBREAK only on win32), first → abort + one line, second → print the command,
  exit 130 (D4); `--keep` still wins on abort and prints the command; docs: Ctrl+C paragraph + the command (D14).
- OUT: teardown result semantics (Phase 3); editor files (Phase 4 extends the command).

**Edge cases:** abort before the clone exists (no teardown, nothing to print); abort during the health sleep (no wait
for the timeout); a second signal during teardown (DW-2.5 path); signal arriving between two steps.

**Produces:** `runCheck` option `signal?: AbortSignal`; `waitHealthy(probe, {…, signal?})`;
`export function manualTeardownCommand({https?: boolean, cloneDir: string}): string` (Phase 4 adds `editor`);
`export function installSignalHandlers(proc, controller, {print, exit, command: () => string|null}): void` — the
CLI wiring, testable with a fake `proc` (EventEmitter).

**Done when:**
- [ ] DW-2.1: Fake exec aborts the signal during `up` → `failed === 'interrupted'`, both teardown commands ran, the
  temp dir is gone; same when aborted inside the health wait, without waiting for its timeout.
- [ ] DW-2.2: `keep: true` + abort → no teardown command ran, a logged line equals
  `manualTeardownCommand({https, cloneDir})`, which contains `docker compose -p vl-selfcheck` and `down -v`.
- [ ] DW-2.5: `installSignalHandlers` with a fake process: first `SIGINT` aborts the controller and prints one line;
  a second `SIGINT` prints the manual command and calls `exit(130)`; `SIGBREAK` is registered only on win32.
- [ ] DW-2.6: `docs/self-host.md` «Перевірка» section describes Ctrl+C and shows the manual command with «без HTTPS»
  within the 4 lines above it: `grep -c "docker compose -p vl-selfcheck" docs/self-host.md` ≥ 1;
  `node --test scripts/test/selfhost-doc.test.mjs` green.
- [ ] DW-2.3: CLI: `node scripts/selfhost-check.mjs --help` unchanged exit 0; importing the module registers no
  handler: `node -e "import('./scripts/selfhost-check.mjs').then(()=>console.log(process.listenerCount('SIGINT')))"`
  prints `0`.
- [ ] DW-2.4: Phase 1's DW-1.3 command green.

**Difficulty:** MEDIUM · **Uncertainty:** real console Ctrl+C on Windows is only checked by hand (AC-16).

### Phase 3: HO1f — honest teardown, port, health and smoke reports; texts
**Skills:** code-foundations:cc-refactoring-guidance, code-foundations:cc-control-flow-quality, code-foundations:cc-defensive-programming
**Model:** sonnet
**Gate:** Standard
**Depends on:** Phase 2 | **Unlocks:** Phase 4
**File scope:** virtual-lab: scripts/selfhost-check.mjs, docker-compose.selfcheck.yml, docs/self-host.md, scripts/test/selfhost-teardown-report.test.mjs, scripts/test/selfhost-port.test.mjs
**AC:** AC-14
**Risk:** normal

**Goal:** A run is GREEN only when its teardown succeeded; a busy port is caught on every address; failures show the
backend log (redacted) and the failed smoke tests.

**Scope:**
- IN: D6 structure — first a pure restructure commit (try/catch computes `result`, one `teardown(result)` returns the
  final result) with the existing suite green and no behaviour change, then the behaviour commit: `down`/`rmSync`
  failure → `failed:'teardown'` (first failure name kept on an already failed run), no step on a green teardown,
  the manual command (Phase 2) printed on a failed teardown; D7 redacted backend log tail; D8 smoke failure lines;
  D9 `portFree`; D10 Chromium text; the `SELFHOST_FRONTEND_PORT` comment removed and the never-printed `step=<n>`
  header sentence replaced by the real format;
  new tests for HO1f item (4) (recording `git` fake on refusals, free ports via `listen(0)`).
- OUT: editing existing tests (forbidden — item 4 is delivered as new tests).

**Edge cases:** `docker update` failing for missing containers (not a teardown failure); IPv6 absent; secrets
appearing split across lines (redact per line, both secrets); smoke output with no numbered failures (fallback).

**Produces:** `runCheck` gains `removeDir?: (dir: string) => void` (default: `rmSync(dir, {recursive, force})`);
other signatures unchanged; `portFree(port): Promise<boolean>` now checks 127.0.0.1, 0.0.0.0, `::`.

**Done when:**
- [ ] DW-3.1: Green fake run + `down` exit 1 → `ok:false, failed:'teardown'`, no `ok teardown` log line, and the
  manual command (Phase 2) is logged; green teardown → the step list deep-equals today's 12 (13 with `https`).
- [ ] DW-3.1b: Green fake run whose temp dir cannot be removed (inject the remover, e.g. a `removeDir` option that
  throws `EBUSY`) → `failed:'teardown'` — the DEFAULT remover path must report the same when `rmSync` throws (no
  swallowed error anywhere); an already failed run keeps its first `failed` name and gains a `teardown`
  step; a run where only `docker update` fails stays GREEN.
- [ ] DW-3.2: Port held on `0.0.0.0` → `portFree` false; held on `::` (ipv6Only) → false; no IPv6 → that leg passes;
  an injected bind error other than EAFNOSUPPORT/EADDRNOTAVAIL on any address → false.
- [ ] DW-3.3: Failed health AND failed `up` → logged lines contain the fake backend log line (asked from the
  backend service) and neither generated secret.
- [ ] DW-3.4: A failing smoke whose stdout ends with a `N passed` summary and contains a Playwright `list` failure
  header for a test titled e.g. `opens the start page` → the `smoke` detail contains that title.
- [ ] DW-3.5: Texts: `docs/self-host.md` says Chromium goes to the user's Playwright cache and names
  `npx playwright install-deps chromium` for a bare Linux server; `docker-compose.selfcheck.yml` no longer mentions
  `SELFHOST_FRONTEND_PORT`; the script's header comment describes the `ok`/`FAIL` line format it really prints (the
  `step=<n>` sentence is removed); commands: `grep -n "install-deps chromium" docs/self-host.md` finds a line,
  `grep -c SELFHOST_FRONTEND_PORT docker-compose.selfcheck.yml` = 0, `grep -c "step=<n>" scripts/selfhost-check.mjs` = 0;
  `selfhost-doc.test.mjs` green.
- [ ] DW-3.6: `git log --oneline origin/ms/1..HEAD` shows the restructure commit before the behaviour commit, and
  `git checkout <restructure-sha> -- . && npm run test:scripts` was green (recorded in the task report with the sha);
  final DW-1.3 command green.

**Difficulty:** MEDIUM · **Uncertainty:** none.

### Phase 4: R3 — `--editor` brings up and proves the editor container
**Skills:** code-foundations:cc-defensive-programming
**Model:** sonnet
**Gate:** Standard
**Depends on:** Phase 3 | **Unlocks:** none (last row of plan B)
**File scope:** virtual-lab: scripts/selfhost-check.mjs, docker-compose.selfcheck-editor.yml, docs/self-host.md, scripts/test/selfhost-editor.test.mjs
**AC:** AC-15, AC-16 (manual part)
**Risk:** normal

**Goal:** `--editor [--editor-source <dir>]` adds the editor to the throwaway stack under `VLCheck*` names and fails
named when the source is missing or `/editor/` does not answer.

**Scope:**
- IN: D11 overlay (`build.context: ${SELFCHECK_EDITOR_SOURCE}`, `container_name: VLCheckEditor`), the var in
  `COMPOSE_INTERPOLATED` and set only in editor mode; D12 file order and `{editor}` options on `composeArgs`,
  `teardownCommands`, `manualTeardownCommand`; D13 steps `editor-source` (after `port`, needs a `Dockerfile`) and
  `editor` (after `healthy`/`https`, 60 s retry); `parseArgs` adds `editor`/`editorSource` only with their flags;
  USAGE text; docs (D14).
- OUT: the folder-picker check (manual, AC-16); any change to `docker-compose.editor.yml` itself.

**Edge cases:** `--editor-source` without a value (refused like other flags); source dir without `Dockerfile`;
`--source` given as a URL (default editor source from the script's repo root); editor + https together.

**Produces:** CLI `--editor`, `--editor-source <dir>`; `runCheck({editor, editorSource, editorTimeoutMs})`;
`composeArgs(args, {https, editor})`, `teardownCommands({https, editor})`, `manualTeardownCommand({https, editor, cloneDir})`.

**Done when:**
- [ ] DW-4.1: Editor on → `up` and `down` both contain `-f docker-compose.editor.yml -f docker-compose.selfcheck-editor.yml`
  in sequence; the `docker update` list includes `VLCheckEditor`; every name starts with `VLCheck`;
  `manualTeardownCommand({editor: true, cloneDir})` contains both editor `-f` files.
- [ ] DW-4.2: Missing `editorSource` → `failed === 'editor-source'`, detail names the path, no clone and no `up` call.
- [ ] DW-4.3: `/editor/` non-2xx for the whole window → `failed === 'editor'`, teardown ran.
- [ ] DW-4.4: Editor off → `composeArgs`/`teardownCommands`/`parseArgs` outputs deep-equal today's; DW-1.3 green.
- [ ] DW-4.5: `parseArgs(['--editor'])` → `editor: true` and no `editorSource` key; with `--editor-source <dir>` →
  also `editorSource: '<dir>'`; `--editor-source` without a value throws.
- [ ] DW-4.6: Green editor run → step order `…, healthy, editor, backup, …` (`https` before `editor` with `--https`,
  the https file still last in every compose call); `editor-source` step right after `port`; the default
  `editorSource` resolves to `<source>/../../WebEngineTSEditor` for a local `source`; `SELFCHECK_EDITOR_SOURCE` is in
  `COMPOSE_INTERPOLATED` and is set in the docker children's env only in editor mode.
- [ ] DW-4.7: `docs/self-host.md` documents `--editor`/`--editor-source`; any new `-f` command line keeps the «без
  HTTPS» rule: `grep -n "editor-source" docs/self-host.md` finds a line; `selfhost-doc.test.mjs` green.

**Difficulty:** MEDIUM · **Uncertainty:** the real editor image build time (manual run).

---
## Test Coverage
**Level:** 100% (every new or changed routine in `selfhost-check.mjs` has a unit test in the phase's new test file).
## Test Plan
- [ ] Per DW item above (unit, fake `exec`/`git`/`probe`/`sleep`, temp dirs, ports from `listen(0)`).
- [ ] Dirty, Phase 1: spawn error with null status; npm_execpath = yarn; missing npm-cli → named ENOENT.
- [ ] Dirty, Phase 2: abort before clone; abort during sleep; abort + keep; second signal during teardown.
- [ ] Dirty, Phase 3: `rmSync` throws; `docker update` fails alone (still GREEN); smoke output without numbered lines;
  127.0.0.1 busy while 0.0.0.0/`::` bind (→ busy); a non-EAFNOSUPPORT bind error (→ busy).
- [ ] Dirty, Phase 4: `--editor-source` with no value; dir without Dockerfile; `/editor/` 500 then timeout.
- [ ] Integration: the whole existing `scripts/test/` suite after every phase (`npm run test:scripts`).
- [ ] Manual (AC-16, owner/close pass): live `npm run selfhost-check -- --lock … [--https] [--editor --editor-source …]`
  GREEN with Docker running; Ctrl+C during `up` leaves no `vl-selfcheck` containers/volumes.

## Assumptions
| Assumption | Confidence | Verify Before Phase | Fallback If Wrong |
|---|---|---|---|
| Stock Windows Node ships `node_modules/npm/bin/npm-cli.js` next to `node.exe` | high | 1 | `npm_execpath`, then named ENOENT |
| Ctrl+C makes `docker compose up` return | high | 2 (manual) | `timeout` cap on that call |
| Compose replaces `build.context` from a later overlay | high | 4 | override `build:` as a whole mapping |

## Decision Log
| Decision | Alternatives Considered | Rationale | Phase |
|---|---|---|---|
| Sync runner + yield-then-check | async spawn | spec's sync `runCommand`, existing fakes | 2 |
| `docker update` failures ignored | count them | containers may never have started | 3 |
| Restructure commit before behaviour commit | one commit | refactor under green tests, then change behaviour | 3 |
| Editor source via compose var, not `.env` | write to `.env` | keeps the `env` step's 4/5-key count | 4 |
| Owner pre-approved (autonomous mode, 2026-11-23) | per-checkpoint confirmation | owner instruction | all |

---
## Notes
- The milestone has hidden acceptance tests run only by `gate.sh --acceptance`; builders never look for them.
- Review cadence 1: one file, every phase builds on the previous one.
---
## Decided During Build
_Filled by /code-foundations:build — one row per decision an agent made or question it raised:_
| # | Phase | Decision or question | Source | Status |
---
## Execution Log
_To be filled during /code-foundations:build_
