# Research — MS-1 plan B: `selfhost-check` hardening (HO1c → HO1d → HO1f → R3)

**One sentence:** make `npm run selfhost-check` run on a stock Windows Node, clean up after Ctrl+C, report a
failed teardown / busy port / failed smoke honestly, and optionally bring up the editor container, without
changing anything a run without the new flags does today.

- Date: 2026-11-23 · Status: **confirmed** (cold read done, findings folded in — see the end) · Author: Claude pass (code-foundations:research)
- Milestone: MS-1 (`.workers/milestones/MS-1/spec.md`) — AC-11, AC-12, AC-14, AC-15, AC-16 (manual), U-3.
- Base: virtual-lab `origin/ms/1` = `e70ff8d`. One file carries all four rows: `scripts/selfhost-check.mjs`
  (580 lines) → the rows are **strictly serial**: HO1c → HO1d → HO1f → R3.
- Still open (none blocks planning): AC-16 live Docker run (manual, owner/close pass) is the only place real
  Ctrl+C on Windows and the real editor build are exercised — see Risks.

## What the rows ask (ROADMAP, Claude review 2026-11-19, and `tasks/E-growth` R3)

| Row | Need | Spec |
|---|---|---|
| HO1c | `exec('npm'…)`/`exec('npx'…)` are ENOENT on a stock Windows Node (only `npm.cmd`; a `.cmd` without a shell is EINVAL). Launch npm/npx through `process.execPath` + `npm-cli.js`/`npx-cli.js`, never a shell. Every failing step's detail carries `res.error?.message` (up, backup, e2e deps, e2e browser, smoke). | AC-11, U-3; shared decision: exported `runCommand(cmd, args, opts)` is the default runner |
| HO1d | No signal handling: Ctrl+C during `up` / health wait / smoke kills node, `finally` never runs, the `vl-selfcheck` stack (restart unless-stopped, 0.0.0.0:8051), `vlcheck_*` volumes and a temp `.env` with secrets survive. SIGINT/SIGTERM → AbortSignal → `failed:'interrupted'` → existing teardown; second signal exits at once printing the manual teardown command; the same command printed on `--keep` and on a failed teardown; documented. | AC-12, U-3 |
| HO1f | (1) teardown result ignored → `ok:false, failed:'teardown'`; backend log tail on a failed health wait (secrets redacted); smoke failure names the failed tests, not "6 passed". (2) `portFree` binds only 127.0.0.1 → also 0.0.0.0 and `::` (ipv6Only). (3) texts: Chromium goes to the user's Playwright cache (+ `install-deps` on bare Linux), the unread `SELFHOST_FRONTEND_PORT` comment in `docker-compose.selfcheck.yml:18`, the never-printed `step=<n> … ok=1\|0` header. (4) tests: recording `git` fake on refusals, free ports from `listen(0)`. | AC-14, U-3 |
| R3 | `--editor`: build and start `docker-compose.editor.yml` inside the check, prove `/editor/` answers; folder picker checked by hand. | AC-15, AC-16 (manual) |

## Facts from the base code (file:line at `e70ff8d`)

- `run()` (`:300-303`) is module-private: `spawnSync(cmd, args, {encoding, maxBuffer, …opts})` → `{status, stdout, stderr, error}`. `runCheck` (`:340`) takes `exec = run` and `git = run` (options `:340-358`).
- npm/npx call sites: `exec('npm', ['ci','--silent'])` (`:517`), `exec('npx', ['playwright','install','chromium'])` (`:521`), `exec('npm', ['run','--silent','smoke'])` (`:525`). Step details read only `stderr` (`up` `:418`, `backup` `:461`, `e2e deps`, `e2e browser`); `smoke` reads the **last stdout line** (`:526`), which reads "6 passed" even on a failure.
- `waitHealthy(probe, {baseUrl, timeoutMs, sleep, log})` (`:280-296`): 1 s loop, injectable `sleep`.
- `finally` (`:534-553`): tears down when `upAttempted && existsSync(cloneDir)` with `teardownCommands({https})`, **ignores both exit statuses**, then `rmSync` and logs `  ok   teardown` (or `FAIL cleanup` on a throw, pushing a `cleanup` step — no test pins the name `cleanup`), `--keep` logs `  --   kept <dir>`. A `return` in `try` is already decided when `finally` runs — the result cannot be changed there today.
- `teardownCommands({https})` (`:211-218`): `docker update --restart=no VLCheckDatabase VLCheckBackend VLCheckFrontend VLCheckBackup`, then `compose … down -v --remove-orphans`. `docker update` on a container that does not exist exits non-zero (a run that failed before/early in `up`).
- `portFree(port)` (`:147-154`): one bind on `127.0.0.1`.
- On a failed health wait the backend log is fetched (`:430`) and **discarded**; secrets live only in `text` (the generated `.env`).
- CLI (`:560-580`): parses, prints the header, `await runCheck(...)`, prints `steps=N ok=M GREEN|RED at <failed>`, exits 0/1. No signal handlers anywhere.
- Smoke reporter is Playwright `list` (`e2e/playwright.smoke.config.ts:36`): failures print `  ✘ …` progress lines and a final `  1) [chromium] › <file>:<l>:<c> › <title>` block, then `N failed` / `M passed`.
- Editor container: `docker-compose.editor.yml` service `editor`, build context `../../WebEngineTSEditor` (relative to the compose file → inside a temp clone it points at `<tmp>/WebEngineTSEditor`, which does not exist), `container_name: VirtualLabEditor` (collides with a live editor), restart unless-stopped, healthcheck `/healthz`; it also overrides `frontend` (nginx `editor.conf` + `csp-editor.conf` mounts, `depends_on: editor: service_healthy`). nginx serves it at `/editor/` (`nginx/editor.conf:20-26`). No script references it today.
- `docker-compose.selfcheck.yml` renames volumes and the four containers to `VLCheck*`; it has no `editor` entry and no ports; `:18` is a comment naming `SELFHOST_FRONTEND_PORT`, which nothing reads.

## Constraints the plan must respect (pinned behaviour)

- **Gate test guard:** no existing test file or `test*` script may be modified/deleted/renamed → every new test is a NEW file under `scripts/test/`. HO1f item (4) is therefore delivered as new tests, the existing ones stay byte-identical.
- `scripts/test/selfhost-check.test.mjs` pins (quoted by the explore pass):
  - `deepEqual(parseArgs([...]), {ref, source, port, https, lock, keep, help})` at `:57-59`, `:543-544` → new keys appear **only when their flag is given**;
  - the green step lists at `:300-302` (12 steps) and `:710-712` (`https` after `healthy`, 13) → a green run adds no step; in particular a green teardown adds none;
  - `composeArgs([...])` exact arrays `:162-165`, `:548-553`; `teardownCommands` length 2, `[0].slice(0,3)` = `docker update --restart=no`, `[1]` has `down -v --remove-orphans` (`:171-176`, `:306-308`) → defaults unchanged, the editor adds to the lists only when on;
  - fake `exec` matches `cmd === 'npm' && args[0] === 'run'|'ci'` (`:288`, `:348`, `:674-677`; `selfhost-restore.test.mjs:103`) → **call sites keep passing `'npm'`/`'npx'`**; the translation lives inside the default runner;
  - `${VAR}` scans of `docker-compose.yml`, `docker-compose.selfcheck.yml`, `docker-compose.https.yml` must all be in `COMPOSE_INTERPOLATED` (`:488-492`, `:599-605`) → a new interpolated name goes into the list.
- `compose-backup-dir.test.mjs:60-69` greps the `BACKUP_RUN_ONCE=1` line of `selfhost-check.mjs` → leave that line's text alone.
- `selfhost-doc.test.mjs:71-82`: every `docker compose … -f docker-compose…` line anywhere in `docs/self-host.md` must be a restore pair, include `https.yml`, or have «без HTTPS» within the 4 lines above → the documented manual teardown command needs that marker (or an https variant next to it). Headings «Редактор сценаріїв», «Оновлення», «HTTPS», … must not be renamed.
- Spec shared decisions (`MS-1/spec.md`): exported `runCommand`; `runCheck` options `signal`, `editor`, `editorSource`; CLI `--editor`, `--editor-source <dir>`; overlay file `docker-compose.selfcheck-editor.yml`; failure names `interrupted`, `teardown`, `editor`, `editor-source`; all today's exports keep their signatures.

## Decisions (delegated to the Claude pass by the owner, 2026-11-10/23; recommendation = decision)

- **D1 — where the npm translation lives (HO1c).** In `runCommand`, the new exported default for `exec`/`git`. On `win32`, `npm` → `[process.execPath, npmCli, …args]`, `npx` → `[process.execPath, npxCli, …args]`; `npxCli` = the `npx-cli.js` next to the chosen `npm-cli.js`. Lookup order for npm-cli: `<dirname(process.execPath)>/node_modules/npm/bin/npm-cli.js` (the stock Windows
  installer layout — this is the layout AC-11 is about), then `process.env.npm_execpath` if its basename is
  `npm-cli.js`. If neither exists (exotic layouts), spawn the plain command: the failure is then a named
  ENOENT in the step detail (D2), never a crash. Never `shell:true`. Elsewhere (Linux/macOS) the command is spawned unchanged. Call sites keep `'npm'`/`'npx'`.
- **D2 — failure details (HO1c; this wording is binding — it is a superset of the row's `res.error?.message`).** One helper `why(res)` = `res.error?.message` + the trimmed tail of `stderr` (then `stdout` when stderr is empty), used by every failing step that runs a command (up, backup, restore, e2e deps, e2e browser, smoke).
- **D3 — how an abort is observed (HO1d).** `spawnSync` blocks the event loop, so a SIGINT handler only runs after the child returns (Ctrl+C reaches `docker`/`npm` too, so they do return). `runCheck` checks `signal.aborted` **after yielding once** (`await new Promise(r => setImmediate(r))`) between every step; `waitHealthy` gains an optional `signal`, checks it each attempt and its sleep resolves early on abort. Abort → `{ok:false, failed:'interrupted'}` and the normal teardown — except with `--keep`, which still wins:
  nothing is torn down, the kept dir and the manual teardown command (D5) are printed. Check points: after
  `clone`, `env`, `up`, inside the health wait, after `healthy`, `https`, `editor`, `backup`, `backup marker`,
  `restore`, `e2e deps`, `e2e browser` (lock/port/editor-source are instant and run before anything exists).
  A test can also abort from inside a fake `exec`.
- **D4 — the second signal (HO1d).** The CLI's handler: first signal → `controller.abort()` + one line "interrupted — tearing down (press Ctrl+C again to stop now)"; second → print the manual teardown command and `process.exit(130)`. SIGINT and SIGTERM always; SIGBREAK registered only when `process.platform === 'win32'`.
- **D5 — the manual teardown command (HO1d/HO1f).** One exported pure function `manualTeardownCommand({https, editor, cloneDir})` → the exact `cd <cloneDir> && docker compose -p vl-selfcheck -f … down -v --remove-orphans` string (same files as the `up`). Printed on `--keep` (with the kept dir), on a failed teardown, and on the second signal.
- **D6 — what counts as a failed teardown (HO1f).** The `down` exit status and the `rmSync` of the temp dir. `docker update --restart=no` stays best effort (it legitimately fails for containers that never started). A green run with a failed teardown → `ok:false, failed:'teardown'`, a `{name:'teardown', ok:false}` step, no `ok teardown` line. A run that already failed keeps its first `failed` name and gets the extra `teardown` step. A green teardown adds **no** step. Structure (fixed): the `try`/`catch` only computes `result` (no `return` inside `finally`); one function
  `teardown(result)` then runs the commands, the `rmSync`, and returns the final result. A failed `rmSync` is a
  `teardown` failure (AC-14) — the old `cleanup` step name is replaced, nothing pins it.
- **D7 — redaction (HO1f).** The backend log tail (`logs --tail 40 backend`, stdout+stderr) is logged line by line after replacing every occurrence of the generated DB password and admin token with `***`.
- **D8 — smoke failure detail (HO1f).** From stdout+stderr: the trimmed lines matching `/^\s*\d+\)\s/`
  (Playwright `list` failure headers `1) [chromium] › file:l:c › title` — they contain the title) plus the
  `N failed` line; only if there are none, the `✘` lines; dedupe, join with ` | `, cap ~300 chars; else D2.
- **D9 — `portFree` (HO1f).** Free only when 127.0.0.1, 0.0.0.0 and `::` (with `ipv6Only: true`) all bind and release; `EAFNOSUPPORT`/`EADDRNOTAVAIL` on `::` counts as free (machine without IPv6); every other error on any of
  the three addresses counts as busy (conservative). Binds sequential, each closed before the next.
- **D10 — Chromium text (HO1f).** Document reality instead of moving the browser: Chromium goes to the user's Playwright cache (`%LOCALAPPDATA%\ms-playwright`, `~/.cache/ms-playwright`) and a bare Linux server needs `sudo npx playwright install-deps chromium` once. (`PLAYWRIGHT_BROWSERS_PATH=<workdir>` would re-download ~150 MB every run.)
- **D11 — editor in the clone (R3).** New overlay `docker-compose.selfcheck-editor.yml`: `editor.build.context: ${SELFCHECK_EDITOR_SOURCE}`, `editor.container_name: VLCheckEditor`. `SELFCHECK_EDITOR_SOURCE` joins `COMPOSE_INTERPOLATED` and is set explicitly in the docker children's env (after the scrub) only in editor mode — not written to `.env`, so the `env` step's 4/5-key count is unchanged.
- **D12 — compose file order (R3).** base, selfcheck, [editor, selfcheck-editor], [https] — https stays last as today; `composeArgs(args, {https, editor})` and `teardownCommands({https, editor})` add only when on; `VLCheckEditor` joins the `docker update` list in editor mode.
- **D13 — editor steps (R3).** `editor-source` right after `port` (before the clone): the resolved `editorSource` must be a directory containing a `Dockerfile` → else `failed:'editor-source'`, detail names the path, nothing cloned, no `up`. `editor` after `healthy` (and `https`): probe `<healthBase>/editor/` once per second for up to 60 s (injectable `editorTimeoutMs`, same `sleep`,
  abortable) until 2xx; else `failed:'editor'` with the last status (teardown still runs). Both steps exist only in editor mode. Default `editorSource` = `path.resolve(base, '../../WebEngineTSEditor')` where `base` = `source` when it is an
  existing local directory, else the repo root of the running script (a `--source` URL has no sibling dirs); the docs tell an admin with another layout to pass `--editor-source`.
- **D14 — docs.** `docs/self-host.md` «Перевірка» section: Ctrl+C behaviour and the manual teardown command (with «без HTTPS» marker), Chromium location, `--editor`/`--editor-source`. No heading renamed.

## Risks

- Windows signal semantics are the least observable part (Ctrl+C in a console vs a killed process); automated tests can only abort through the injected signal. AC-16 (manual live run) is where real Ctrl+C gets tried.
- The editor build is an Angular production build inside Docker: slow (minutes) and memory-hungry; `up` keeps its 30 min timeout.
- Restructuring `finally` (D6) touches the code path every existing test runs through — the full existing suite is the regression net.
- One file, four writers in sequence: each row rebases on the previous landing in `ms/1`.

## Cold read (fresh subagent, 2026-11-23)

Findings folded in: stale line numbers fixed; `--keep` + interrupt (keeps, prints the command); D2 named
binding; D6 structure fixed and `cleanup` → `teardown`; AC-11 lookup order and the exotic-layout fallback;
D9 error policy for all three addresses; D8 exact line selection; SIGBREAK platform guard; abort check points;
`editorSource` default for a URL `--source`; editor probe retry/timeout. No contradiction with the spec left.
