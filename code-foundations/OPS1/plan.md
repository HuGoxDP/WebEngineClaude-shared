# Plan: OPS1 — the autonomous deploy pipeline (`wk.sh deploy`)
**Created:** 2026-11-12 (Claude, architect lane)
**Status:** ready
**Complexity:** complex (security + production) — Full gates, an adversarial review phase
**Review cadence:** per phase
**Check-ins:** quiet
---
## Context
The owner moved production deploys to the workers (2026-11-12, `~/.zcode/AGENTS.md` WebEngine →
*Deploy*). OPS1 builds the pipeline those deploys run through, and proves it **without the
production server**: on a local rehearsal stack, through the same remote scripts, with a real
rollback. The first contact with the server is the next row, **OPS1b** (needs `.workers/deploy.env`).
Research, facts with line numbers and every decision: `code-foundations/OPS1/research.md` — **read
it first; its Decisions D-1 … D-15 are binding.**
Base: virtual-lab `main` `e4b0df7`, WebEngineTSEditor `master` `b615af1` (read only — OPS1 changes
no editor file).

**Success criteria:**
1. `node --test ops/deploy/test/` green in virtual-lab; no new dependency in any `package.json`.
2. The rehearsal (Phase 5) on local Docker, run twice: fresh install → deploy B green → deploy C
   (adds a migration, smoke forced red) rolls back to B **with** the database restored (C's table
   gone, the marker row present) → an unhealthy deploy D rolls back **without** a DB restore → a
   hand-made stack is adopted and redeployed with its data intact. Every exit code as specified.
3. `--dry-run` of `deploy platform` prints every local command and every remote script with its
   arguments, contacts nothing, and no `deploy.env` value appears in any output or log (tested).
4. The adversarial review (Phase 6) has no open finding; `wk.sh deploy` exists, verbatim (Phase 7).
5. virtual-lab checks still green (backend unit; the backup procedure re-run with the fixed
   `BACKUP_HOST_DIR`, Phase 2).

## Constraints
- Repos: **virtual-lab** (all code, under `ops/deploy/`, `e2e/smoke/`, `e2e/playwright.smoke.config.ts`,
  `e2e/package.json` one script line, `docker-compose.yml` the backup service only,
  `docs/deploy.md`, `docs/backup-restore.md`, `Readme.md` one pointer) and **.claude-shared** (notes,
  ROADMAP, CHANGELOG). `.workers/wk.sh` only in Phase 7, only the verbatim block.
- Plain Node ≥ 20 ESM `.mjs`, `node:` built-ins only; remote scripts are `bash` files under
  `ops/deploy/remote/` (one per step, `set -euo pipefail`, arguments only as `$1…$n`).
- **Never** against production in this task: no `deploy.env` is read except by unit tests' fixtures;
  the ssh transport is exercised by unit tests and `--dry-run` only. OPS1b is the first real use.
- Every local `docker compose` of virtual-lab (preflight, rehearsal) runs inside `vl-db.lock`
  (`wk.sh lock vl-db W<n> OPS1`), beaten every 15 min; ports 8047 (rehearsal) and 8048 (preflight).
- Forbidden in any file of this task: `down -v` (except the rehearsal teardown, guarded — Phase 5),
  `docker system prune`, `docker volume rm` of a name not starting with `rehearsal_`/`preflight_`,
  `--remove-orphans`, reading or printing the server's `.env`, a registry push, anything GitHub-metered.
- Never weaken a test; anything this plan does not answer is a question: park (ATTENTION), do not guess.

## CLI (fixed — the wrapper, the docs and the tests share it)
```
node ops/deploy/deploy.mjs <command> [options]
  inspect [--trust-new-host]      read-only server facts (OPS1b uses it first)
  prepare                         create the layout / adopt / fresh .env (OPS1b)
  deploy platform|editor          the gated deploy (D-8), rollback on failure (D-10)
  rollback                        bring `previous` back (same locks/window; no preflight)
  status                          current / previous release records
Options: --env-file <p> (required with ssh) · --known-hosts <p> · --log-dir <d> · --lock-dir <d>
  (repeatable) · --vl-repo <d> (default: this script's repo) · --editor-repo <d> ·
  --transport ssh|local (default ssh) · --local-root <d> (local only) · --rehearsal (local only) ·
  --smoke-expect-commit <hex> (local only, forces a red smoke) · --dry-run
Exit: 0 ok · 2 usage · 4 refused by a gate, server untouched · 5 failed before `up`, running
  release untouched · 10 rolled back, previous release green · 11 rollback failed / previous red
```
The window (D-6) is enforced only with `--transport ssh`; with `local` it is printed, not enforced.
`--dry-run` connects to nothing and builds nothing: it evaluates every local gate (HALT, window,
fresh source, config), prints each verdict, then prints the full plan (every local command, every
remote script with its arguments) **even when a gate failed**, and exits 4 if any gate failed, else 0.
`deploy.mjs` exports `main(argv, {now, spawn, env})` so tests inject the clock and the process
runner; the CLI entry only calls `main(process.argv.slice(2))`.

---
## Implementation Phases

### Phase 1: Pure core — config, window, redaction, quoting, release records, rollback decision
**Skills:** code-foundations:cc-defensive-programming, code-foundations:cc-routine-and-class-design
**Model:** sonnet
**Gate:** Standard
**Depends on:** none
**File scope:** ops/deploy/lib/config.mjs, ops/deploy/lib/window.mjs, ops/deploy/lib/redact.mjs, ops/deploy/lib/shq.mjs, ops/deploy/lib/release.mjs, ops/deploy/lib/rollback.mjs, ops/deploy/test/core.test.mjs, ops/deploy/test/fixtures/deploy.env.sample

**Goal:** everything that needs neither Docker nor a network exists and is unit-tested.

**Scope:**
- IN: `config.mjs` — `parseDeployEnv(text)` (D-13 keys; `KEY=value` lines, `#` comments, no
  shell expansion; required keys present and non-empty; `DEPLOY_HOST` matches
  `^[A-Za-z0-9.-]+$` or an IPv4/IPv6 literal; `DEPLOY_USER` `^[a-z_][a-z0-9_-]*$`; `DEPLOY_PATH`
  absolute POSIX without `..`, spaces or shell metacharacters; `DEPLOY_PORT` 1–65535; unknown keys →
  error naming the key, never its value). `window.mjs` — `deployWindow(instant)` →
  `{allowed, kyivLocal, reason}` per D-6. `redact.mjs` — `makeRedactor(cfg)` → `(text) => text`
  replacing every configured value (longest first) and the key file's basename. `shq.mjs` —
  `shq(value)` single-quote POSIX quoting, `shqArgs(array)`. `release.mjs` — `tagOf(sha)`,
  `releaseId({vl, ed})`, `imageNames(tagSet)`, `composeFiles({editor, extra})`,
  `bundleFiles({editor, extra})` (D-4), `nextState(state, record)` (current → previous, history
  capped at 10), `keepForPrune(state)` (ids of current, previous and the one before).
  `rollback.mjs` — `needsDbRestore(before, after)` (true iff `after` ⊋ `before`; `after` missing
  an entry of `before` → throws "migration set shrank", which the pipeline treats as rollback +
  DB restore + exit 11).
- OUT: spawning anything.

**Edge cases:** a `deploy.env` value containing `=`; CRLF line endings (the file is written on
Windows); DST change days in Kyiv (last Sunday of March / October); Friday 20:59 vs 21:00, Monday
05:59 vs 06:00; a redactor given a host that is a substring of the domain (longest first);
`shq` of `'`, newline, empty string.

**Done when:**
- [ ] DW-1.1: `parseDeployEnv` accepts `fixtures/deploy.env.sample` (fake values only, e.g. `DEPLOY_HOST=deploy.example.invalid`) and rejects, each with an error naming the key and not containing the value: a missing key, `DEPLOY_PATH=relative`, `DEPLOY_PATH=/srv/a b`, `DEPLOY_HOST=a;b`, `DEPLOY_PORT=0`, an unknown key.
- [ ] DW-1.2: `deployWindow` table test with ≥ 14 instants: Mon 20:59 (no), Mon 21:00 (yes), Tue 05:59 (yes), Tue 06:00 (no), Tue 12:00 (no), Fri 21:00 (yes), Sat 12:00 (yes), Sun 23:59 (yes), Mon 05:59 (yes), Mon 06:00 (no), and the same hours on 2027-03-28 and 2026-10-25 (DST) in Kyiv local time given as UTC instants.
- [ ] DW-1.3: `redact` removes every value from a text that contains each of them twice, including `user@host` and `https://domain/path` forms; output contains `<DEPLOY_HOST>`, `<DEPLOY_DOMAIN>`.
- [ ] DW-1.4: `shq` round-trips through `bash -c 'printf %s "$1"' _ <quoted>` for `'`, `"`, `$(x)`, `` `x` ``, newline, `;`, empty — the test runs bash (skips with a message when no bash is on PATH, never silently).
- [ ] DW-1.5: `bundleFiles({editor:false})` = `docker-compose.yml`, `docker-compose.restore.yml`, `ops/deploy/compose.release.yml`, `db/init.sql`; `{editor:true}` adds `docker-compose.editor.yml`, `ops/deploy/compose.release-editor.yml`, `nginx/editor.conf`, `nginx/csp-editor.conf`; `extra` entries are appended and must be repo-relative `*.yml` (else throw).
- [ ] DW-1.6: `needsDbRestore` true/false/throws cases; `nextState` keeps history ≤ 10 and `keepForPrune` returns exactly three ids after four deploys.
- [ ] DW-1.7: `node --test ops/deploy/test/` green; `git diff --stat origin/main` lists only this phase's files.

### Phase 2: Release compose, image build, the `BACKUP_HOST_DIR` fix
**Skills:** code-foundations:cc-defensive-programming
**Model:** sonnet
**Gate:** Standard
**Depends on:** 1
**File scope:** ops/deploy/compose.release.yml, ops/deploy/compose.release-editor.yml, ops/deploy/compose.rehearsal.yml, ops/deploy/compose.preflight.yml, ops/deploy/lib/build.mjs, ops/deploy/test/build.test.mjs, docker-compose.yml, docs/backup-restore.md

**Goal:** the images a release is made of can be built, named and listed reproducibly, and the
backup service can be pointed at a host directory.

**Scope:**
- IN: `compose.release.yml` — `backend`/`frontend`/`backup`: `image: virtual-lab/<svc>:${VL_TAG:?}`,
  `pull_policy: never`; `backend.environment.API_COMMIT: ${VL_COMMIT:?}` (research F-7).
  `compose.release-editor.yml` — `editor.image: webengine-editor/editor:${ED_TAG:?}`,
  `pull_policy: never`. `compose.rehearsal.yml` / `compose.preflight.yml` — container names
  `Rehearsal*` / `Preflight*`, volume names `rehearsal_virtual_lab_*` / `preflight_virtual_lab_*`,
  frontend `ports: !override ["8047:80"]` / `["8048:80"]` (compose ≥ 2.24 `!override`, otherwise
  the base `${FRONTEND_PORT}` mapping is merged — record which), no TLS port.
  `docker-compose.yml` backup service only: the mount source becomes `${BACKUP_HOST_DIR:-./backup/out}`
  and the container's `BACKUP_DIR` is fixed to `/backups` (research F-4); `docs/backup-restore.md`
  says so in one paragraph. `build.mjs` — `checkFreshSource(repo, defaultBranch, {rehearsal})`
  (D-5), `buildCommands({vlRepo, edRepo, vl, ed, editor})` → the exact `docker build` argv
  (`-t <name>:<tag>`, `--label org.opencontainers.image.revision=<sha>`, backend `./backend`,
  frontend `.` + `-f Dockerfile.frontend`, backup `./backup`, editor `<edRepo>` + its `Dockerfile`
  — never through `docker-compose.editor.yml`'s context, F-8), `imageIds(names)`
  (`docker image inspect --format {{.Id}}`), `saveCommand(names)`.
- OUT: running anything remote.

**Edge cases:** a dirty worktree with only untracked files (still refused — `--porcelain`
lists them); HEAD detached on an older `origin/main` after a fetch moved it; editor disabled →
no editor image built or listed; Windows paths given to `docker build` (forward slashes).

**Done when:**
- [ ] DW-2.1: `docker compose -f docker-compose.yml -f ops/deploy/compose.release.yml config --format json` with `VL_TAG=abc VL_COMMIT=abc` (and a throwaway `.env` from `.env.example`) shows the three images with tag `abc`, `pull_policy: never`, `API_COMMIT=abc`; without `VL_TAG` it fails naming the variable — both asserted in `build.test.mjs` (the test skips with a message when `docker` is absent, never silently).
- [ ] DW-2.2: the same `config` with `BACKUP_HOST_DIR=/tmp/vlb` shows the backup mount source `/tmp/vlb` and `BACKUP_DIR=/backups` in its environment; with no variable the source is `./backup/out` (the old default) — a regression test for research F-4.
- [ ] DW-2.3: on a scratch stack inside `vl-db.lock`, `docker compose -p vlscratch -f docker-compose.yml -f docker-compose.scratch.yml run --rm -e BACKUP_RUN_ONCE=1 backup` with `BACKUP_HOST_DIR` set to a temp dir leaves a backup directory **in that temp dir** (paste `ls`); the scratch stack is torn down afterwards with its own `scratch_` volumes only.
- [ ] DW-2.4: `checkFreshSource` refuses a modified file, an untracked file and HEAD ≠ `origin/main` (temp git repos in the test), and passes on a clean fresh clone; `--rehearsal` only skips the HEAD comparison, never the porcelain check.
- [ ] DW-2.5: `buildCommands` output for both editor settings matches a literal expected argv list in the test; running them for real once builds the three images (paste `docker image ls virtual-lab/*`).
- [ ] DW-2.6: `node --test ops/deploy/test/` and `cd backend && npm run test:unit` green.

### Phase 3: The production smoke suite
**Skills:** code-foundations:cc-defensive-programming
**Model:** sonnet
**Gate:** Standard
**Depends on:** none
**File scope:** e2e/playwright.smoke.config.ts, e2e/smoke/health.spec.ts, e2e/smoke/catalog.spec.ts, e2e/smoke/player.spec.ts, e2e/smoke/headers.spec.ts, e2e/smoke/editor.spec.ts, e2e/smoke/writes.ts, e2e/package.json

**Goal:** a read-only smoke that can be pointed at any deployed stack (D-11).

**Scope:**
- IN: the config (`testDir: ./smoke`, no `globalSetup`, `workers: 1`, Chromium, `baseURL` from
  `E2E_BASE_URL` — required, the config throws without it — `userAgent` = Chromium's +
  ` VirtualLabSmoke/1`, `ignoreHTTPSErrors` only when `SMOKE_INSECURE_TLS=1`). Specs per D-11;
  reuse `helpers/engine.ts` by import for the player check; `writes.ts` — a fixture that records
  every request whose method is not GET/HEAD and fails the test on one outside `SMOKE_WRITE_ALLOW`
  (default: the viewer's telemetry endpoints — find them in `frontend/src`, name them in the notes).
  `package.json`: `"smoke": "playwright test -c playwright.smoke.config.ts"`.
- OUT: anything that needs `ADMIN_TOKEN`; changing an existing spec or helper.

**Edge cases:** an empty catalog (red, with the message "catalog is empty — publish the release
first"); http-only target (HSTS check skipped, CSP still required); `/editor/` absent while
`SMOKE_EDITOR` unset (spec skipped with a reason).

**Done when:**
- [ ] DW-3.1: against the worker's local stack (inside `vl-db.lock`, catalog published as in `code-foundations/M2.2/notes.md`) `E2E_BASE_URL=http://localhost:<port> npm run smoke` is green; paste the summary.
- [ ] DW-3.2: `SMOKE_EXPECT_COMMIT=000000000000` makes `health.spec.ts` red with a message naming the expected and the actual commit; an unreachable base URL fails in < 60 s.
- [ ] DW-3.3: the write recorder catches a deliberate POST added in a throwaway local spec (not committed) and lists the allowed telemetry calls the real run made.
- [ ] DW-3.4: `git grep -n "ADMIN_TOKEN\|cleanupE2EScenarios\|globalSetup" e2e/smoke e2e/playwright.smoke.config.ts` is empty; the normal `npx playwright test` still lists the same specs as before (the smoke dir is outside its `testDir`).

### Phase 4: Transports, remote scripts, the orchestrator and CLI
**Skills:** code-foundations:cc-defensive-programming, code-foundations:aposd-designing-deep-modules, code-foundations:aposd-verifying-correctness
**Model:** opus
**Gate:** Full
**Depends on:** 1, 2
**File scope:** ops/deploy/deploy.mjs, ops/deploy/lib/transport.mjs, ops/deploy/lib/steps.mjs, ops/deploy/lib/log.mjs, ops/deploy/remote/inspect.sh, ops/deploy/remote/prepare.sh, ops/deploy/remote/have-images.sh, ops/deploy/remote/upload-bundle.sh, ops/deploy/remote/backup.sh, ops/deploy/remote/verify-backup.sh, ops/deploy/remote/migrations.sh, ops/deploy/remote/up.sh, ops/deploy/remote/wait-healthy.sh, ops/deploy/remote/restore-db.sh, ops/deploy/remote/state.sh, ops/deploy/remote/prune.sh, ops/deploy/test/steps.test.mjs, ops/deploy/test/cli.test.mjs

**Goal:** the whole deploy/rollback sequence (D-8, D-9, D-10, D-12) runs through one transport
interface, and its order and failure handling are pinned by tests that need no server.

**Scope:**
- IN: `transport.mjs` — `sshTransport(cfg, knownHosts)` and `localTransport(root)`, both
  `{ run(scriptFile, args, {stdin}) → {code, stdout, stderr}, pipeIn(fixedCommand, readable) }`;
  ssh argv per D-13 (`-p`, `-i`, `BatchMode`, `IdentitiesOnly`, `StrictHostKeyChecking=yes`,
  `UserKnownHostsFile`), the script sent on stdin to `bash -s --` + `shqArgs(args)`; `pipeIn` for
  `gunzip | docker load` only. A `dryRunTransport` that prints and returns scripted success.
  `log.mjs` — one logger: every line through the redactor, to stdout and
  `<log-dir>/<UTC time>-<command>.log`; child output streamed through it line by line.
  `steps.mjs` — the sequence as small functions over (transport, state), each one heartbeat-ing the
  `--lock-dir`s: `preflight` (local: build → `vlpreflight` project with `compose.preflight.yml`, a
  throwaway `.env` from `.env.example` with random secrets in a temp dir, seed the catalog the
  M2.2 way, `npm run smoke` with `SMOKE_EXPECT_COMMIT`, always torn down — its `preflight_` volumes
  removed by exact name), `inspect`, `prepare` (D-12, incl. adoption), `ship` (only IDs the server
  lacks), `uploadBundle` (a tar of `bundleFiles` + `release.env` with `VL_TAG`, `VL_COMMIT`,
  `ED_TAG`, `COMPOSE_FILE` list — no secret — extracted to `releases/<id>.tmp`, renamed when complete,
  `.env` symlinked), `backup` + `verifyBackup` (D-9), `migrations`, `up`
  (`docker compose --project-name <p> --env-file shared/.env --env-file release.env up -d --no-build`),
  `waitHealthy` (5 min; frontend = HTTP 200 on `/` through its published port), `smoke` (the
  Phase 3 suite from the worker against `<scheme>://DEPLOY_DOMAIN`, scheme from
  `shared/deploy.json`, default `http`), `recordState`, `rollback` (D-10 order: stop new backend →
  DB restore if needed → up previous → wait → smoke previous), `prune` (D-3: never the last three).
  `deploy.mjs` — the CLI above; gates in D-8 order, each refusal exit 4 with one line naming the
  gate; `rollback` command = the rollback steps against `previous`.
  Remote scripts: each prints machine-readable `key=value` lines on success; `inspect.sh` and
  `migrations.sh` change nothing; `prepare.sh` never overwrites an existing `shared/.env`
  (`cp -n`, `set -o noclobber`); `restore-db.sh` refuses unless the backup name exists under
  `DEPLOY_PATH/backups` and was verified (a `verified` marker the verify step writes).
- OUT: the wrapper; HTTPS/cert handling; anything P5b/M1.2/R3 do.

**Edge cases:** the server has the image ID under another tag (still skip shipping, re-tag);
`upload-bundle` interrupted (the `.tmp` directory is removed on the next run, `current` untouched);
two `deploy` invocations racing (the wrapper's locks prevent it; the pipeline also refuses when
`state.json` says `inProgress` younger than 2 h); `wait-healthy` timeout during rollback (exit 11,
never a second rollback); the smoke itself cannot start (Playwright missing → exit 5 before `up`
— the preflight already ran it, so this is a gate, not a rollback).

**Done when:**
- [ ] DW-4.1: `steps.test.mjs`, recording transport: the happy `deploy platform` produces exactly the step sequence preflight → inspect → backup → verifyBackup → migrations(before) → ship → uploadBundle → up → waitHealthy → migrations(after) → smoke → recordState → prune; nothing after `up` runs when any earlier step fails, and the exit code is 4 (gate) or 5 (before up) accordingly.
- [ ] DW-4.2: red smoke with migrations grown → stop backend → restore-db (with the pre-deploy backup's name) → up previous → waitHealthy → smoke previous; exit 10. Red smoke without migration change → no restore-db call; exit 10. Rollback's smoke red → exit 11 and no further step. Migration set shrank → restore-db + exit 11.
- [ ] DW-4.3: `cli.test.mjs` (through `main()` with an injected clock and a recording `spawn`): `deploy platform --dry-run --env-file fixtures/deploy.env.sample` inside the window, on a temp git repo that is a fresh clone at its `origin/main`, exits 0, prints every remote script name with its arguments, spawns nothing but `git`, and its stdout + log contain none of the sample's values (asserted); the same on a commit ahead of `origin/main` exits 4 naming only the fresh-source gate and still prints the full plan; outside the window (ssh) it exits 4 naming the window; with HALT present it exits 4.
- [ ] DW-4.4: every remote script passes `bash -n`, and a test greps all of `ops/deploy/` for the forbidden list of the Constraints (except the guarded teardown of Phase 5, which is not in this phase's files) — the grep is part of `node --test`.
- [ ] DW-4.5: `verify-backup.sh` run against a real backup directory made in DW-2.3 (local transport, inside `vl-db.lock`) prints `verified=1`; a truncated copy of its `db.sql.gz` prints a named failure and exit ≠ 0.
- [ ] DW-4.6: `node --test ops/deploy/test/` green.

### Phase 5: Local rehearsal — the pipeline end to end, twice
**Skills:** code-foundations:aposd-verifying-correctness, code-foundations:cc-debugging
**Model:** opus
**Gate:** Full
**Depends on:** 3, 4
**File scope:** ops/deploy/rehearse.mjs, ops/deploy/test/rehearse.test.mjs, plus fixes in Phase 1–4 files found by the run (each with its regression test)

**Goal:** every path the production deploy can take has run for real on local Docker.

**Scope:**
- IN: `rehearse.mjs` — drives `deploy.mjs --transport local --local-root <tmp> --rehearsal`
  through the sequence below, on local-only commits of a scratch branch `OPS1-rehearsal-scratch`
  (never pushed, deleted at the end), project `vlrehearsal` with `compose.rehearsal.yml` added to
  the compose list, inside `vl-db.lock`; prints a table (step, expected exit, actual, seconds);
  its teardown is the **only** `down -v` in the task and refuses unless every volume of the project
  starts with `rehearsal_`. Sequence:
  R-1 `prepare` on an empty root (fresh `.env` generated) → `deploy platform` of A (= origin/main)
  → exit 0, record `backup: none (fresh install)`.
  R-2 seed the rehearsal catalog (publish:release with the rehearsal `.env`'s token) and insert
  a marker row (`scenarios` id `rehearsal-marker`).
  R-3 commit B (a visible no-op, e.g. a comment in `backend/server.js`) → `deploy platform` → exit 0,
  backup verified, `migrated=false`, `/api/health` commit = B.
  R-4 commit C adds `backend/migrations/999_rehearsal_probe.sql` (`CREATE TABLE rehearsal_probe
  (id int)`), run with `--smoke-expect-commit 000000000000` → exit 10; afterwards
  `rehearsal_probe` does not exist, `schema_migrations` equals B's set, the marker row exists,
  health commit = B.
  R-5 commit D makes the backend exit at start → exit 10 via the health timeout, **no** restore-db
  in the log, health commit = B.
  R-6 `rollback` (B → A) → exit 0, health commit = A.
  R-7 adoption: tear down, start a hand-made stack (`docker compose -p vlhand` with
  `compose.rehearsal.yml`, `--build`, its own `.env` in a temp copy), insert the marker row, then
  `prepare` on a new root → adopted record, `shared/.env` byte-identical to the hand `.env` (compare
  SHA-256, never print), then `deploy platform` → exit 0, marker row present.
- OUT: anything against a remote host.

**Edge cases:** Docker Desktop path translation for the temp root (record the form that works);
the first build's duration vs the window margin; leftover `vlrehearsal`/`vlhand`/`vlpreflight`
containers from an interrupted run (rehearse.mjs cleans its own projects first).

**Done when:**
- [ ] DW-5.1: two full runs of `node ops/deploy/rehearse.mjs` — every row's actual exit equals the expected; both tables pasted in `notes.md` with durations.
- [ ] DW-5.2: the longest observed deploy + rollback (R-4) fits in 60 min with margin; if not, the window's start cutoff (D-6, 06:00) is the question — park it, do not change it.
- [ ] DW-5.3: after the runs `docker volume ls` shows no `rehearsal_`/`preflight_` volume, `docker ps -a` no `Rehearsal*`/`Preflight*` container, the scratch branch is gone, and the live local stack on 8044 was never restarted (its container `StartedAt` before and after, pasted).
- [ ] DW-5.4: every bug the runs found has a regression test in `ops/deploy/test/` that fails without its fix (listed in `notes.md`); `node --test ops/deploy/test/` green.

### Phase 6: Adversarial security review
**Skills:** code-foundations:aposd-verifying-correctness, code-foundations:cc-defensive-programming
**Model:** opus (a fresh session or agent that did not build Phases 1–5)
**Gate:** Full
**Depends on:** 5
**File scope:** .claude-shared: code-foundations/OPS1/security-review.md; fixes in Phase 1–5 files

**Goal:** an independent attempt to make the pipeline leak a secret, damage production data or
leave production half-deployed, with each finding fixed or turned into a row.

**Review list (each answered with evidence: file:line, a test, or a command run):**
1. Injection: every remote argument through `shq`; no value of `deploy.env`, `state.json` or a
   git ref reaches a script body; a branch name or commit message with `$(…)`, `;` or a newline.
2. Secret exposure: `redact` on every output path (ssh/docker/Playwright child output, errors,
   stack traces, the log file, `--dry-run`); the server `.env` never read, printed or transferred;
   argv of local processes (`ps`) contains no secret other than the key path.
3. Data safety: no `down -v`, `volume rm`, `system prune`, `--remove-orphans` outside the guarded
   teardown; backups never deleted by the pipeline; DB restore only from a verified backup of the
   same deploy; content volumes never restored on rollback.
4. Half states: kill the process (SIGINT/SIGTERM, then a power-cut simulation = `kill -9`) at each
   step on the local transport — `current` stays the last good release or the rollback completes on
   the next `rollback`; the locks are released by the wrapper's trap (Phase 7 re-checks).
5. Gates: window (DST), HALT, dirty/old source, missing or malformed `deploy.env`, unknown host key,
   low disk, unverified backup, `inProgress` state — each refuses with exit 4 and changes nothing.
6. TOFU: what `--trust-new-host` records, where, and that a changed host key afterwards refuses.

**Done when:**
- [ ] DW-6.1: `security-review.md` answers all six items with evidence; every finding is fixed here with a regression test or is a new `⬜` row in the Report (with the reason it can wait).
- [ ] DW-6.2: a full rehearsal run after the fixes, table pasted; `node --test ops/deploy/test/` green.

### Phase 7: The `wk.sh deploy` wrapper and the docs
**Skills:** code-foundations:code-clarity-and-docs
**Model:** sonnet
**Gate:** Standard
**Depends on:** 6
**File scope:** .workers/wk.sh (the verbatim block only; backup first), docs/deploy.md, Readme.md (one pointer line in the deploy section)

**Goal:** workers deploy with one command, and a human can read how.

**Scope:**
- IN: back up `wk.sh` to `wk.sh.bak-<date>-OPS1`, then insert this block **verbatim** before the
  `status)` case, and add one usage line to the header comment
  (`bash .workers/wk.sh deploy W<n> <inspect|prepare|platform|editor|rollback|status> [flags]`):
```bash
  deploy) # deploy W<n> <command> [args]: the OPS1 pipeline (owner, 2026-11-12: workers deploy)
        w=$1; shift; [ -n "${1:-}" ] || { echo "deploy: W<n> <command>" >&2; exit 2; }
        [ -e "$R/HALT" ] && { echo "HALT present — no deploy" >&2; exit 6; }
        [ -f "$R/deploy.env" ] || { echo "no .workers/deploy.env — deploy not possible" >&2; exit 7; }
        Rm=$(cygpath -m "$R" 2>/dev/null || echo "$R"); vl="$Rm/$w/virtual-lab"
        [ -f "$vl/ops/deploy/deploy.mjs" ] || { echo "no pipeline in $w/virtual-lab (detach it on fresh origin/main)" >&2; exit 7; }
        common=(--env-file "$Rm/deploy.env" --known-hosts "$Rm/deploy.known_hosts" --log-dir "$Rm/$w/deploy-logs" --vl-repo "$vl" --editor-repo "$Rm/$w/WebEngineTSEditor")
        case "$1" in inspect|status) exec node "$vl/ops/deploy/deploy.mjs" "$@" "${common[@]}" ;; esac
        held=""; release_locks() { for l in $held; do bash "$R/wk.sh" unlock "$l" "$w" || true; done; }
        trap release_locks EXIT
        for l in deploy merge vl-db; do bash "$R/wk.sh" lock "$l" "$w" "OPS-$1" || exit 3; held="$l $held"; done
        set +e; node "$vl/ops/deploy/deploy.mjs" "$@" "${common[@]}" --lock-dir "$Rm/locks/deploy.lock" --lock-dir "$Rm/locks/merge.lock" --lock-dir "$Rm/locks/vl-db.lock"; rc=$?; set -e
        case $rc in
          10) now > "$R/HALT"; note "$w" "deploy $1" "exit 10: rolled back to the previous release; HALT written — read $w/deploy-logs" ;;
          11) now > "$R/HALT"; note "$w" "deploy $1" "exit 11: ROLLBACK FAILED — production may be down; HALT written — read $w/deploy-logs" ;;
          5) note "$w" "deploy $1" "exit 5: failed before up; the running release is untouched — read $w/deploy-logs" ;;
        esac
        exit $rc ;;
```
  `docs/deploy.md` (English, like `docs/backup-restore.md`): what a release is, the server layout,
  the gates, the exit codes, how to roll back by hand, how P5b adds `extraComposeFiles`, what the
  rehearsal proves and how to run it, and the `deploy.env` keys (names only, never values).
- OUT: any other `wk.sh` change; `eligible.py` (Claude already split OPS1/OPS1b there).

**Done when:**
- [ ] DW-7.1: `bash -n .workers/wk.sh`; `wk.sh status` and `wk.sh now` unchanged; `diff wk.sh.bak-<date>-OPS1 wk.sh` shows only the block and the usage line (paste it).
- [ ] DW-7.2: never put a `deploy.env` into the real `.workers/` (it would make OPS1b and the deploy rows eligible for every worker). Test the wrapper in a temp layout instead: `T=$(mktemp -d)`, `cp .workers/wk.sh $T/`, `$T/deploy.env` = the test sample, `$T/W9/virtual-lab` = a `git clone` of this task branch. There: without `$T/deploy.env` → exit 7, no lock taken; with `$T/HALT` → exit 6; `bash $T/wk.sh deploy W9 platform --dry-run` → the full plan printed, exit 4 naming the fresh-source gate (the clone is ahead of `origin/main`; outside the Kyiv window the window gate is named too, and nothing else), `$T/locks/` empty afterwards, and none of the sample's values in the output or `$T/W9/deploy-logs/` (grep, paste the count 0). `rm -rf $T` afterwards.
- [ ] DW-7.3: in the same temp layout, with `$T/locks/merge.lock` held by another owner (`bash $T/wk.sh lock merge WX test`), the dry run exits 3 and `$T/locks/deploy.lock` is gone again.

### Phase 8: Notes and roadmap (Minimal)
**Model:** sonnet
**Gate:** Minimal
**Depends on:** 7
**File scope:** .claude-shared: code-foundations/OPS1/notes.md, ROADMAP.md (row OPS1 only, plus new ⬜ rows), CHANGELOG.md (virtual-lab section, one entry)

**Done when:**
- [ ] DW-8.1: ROADMAP OPS1 → `✅ <date> W<n>` with the rehearsal summary (rows, durations, image sizes) and the `BACKUP_HOST_DIR` fix; OPS1b's row text unchanged.
- [ ] DW-8.2: `notes.md` has both rehearsal tables, the smoke's allowed writes, the compose version facts (`!override`, multiple `--env-file`), every deviation, and the review summary; CHANGELOG names the command and the fix.

---
## Deviation rules
- A compose feature this machine's Docker lacks (`!override`, multiple `--env-file`): use the
  nearest equivalent, record the version and the reason in `notes.md`, and add the minimum version
  to `inspect.sh`'s checks.
- Seeding the catalog differently from M2.2 (a different release dir or command) is fine if the
  notes say how; skipping the seed is not (the smoke would prove nothing).
- Anything that would touch the owner's live local stack (8044) or a non-`rehearsal_`/`preflight_`
  volume: stop, ATTENTION, park.
- No production contact in this task. A server question is OPS1b's; write it there.
