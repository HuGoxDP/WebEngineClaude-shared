# Research — HO1b2: `selfhost-check --verify-in-container` (MS-2)

**One sentence:** `selfhost-check` gains an opt-in flag that verifies the freshly taken backup inside the `backup`
container (`docker compose run --rm --entrypoint node … backup verify-backup.mjs --newest /backups`) instead of on
the host, while the default run — flags, commands, steps, details, teardown — stays byte-for-byte the base's.

- Date: 2026-11-25 · Status: **confirmed** (autonomous by owner instruction; every checkpoint decided by
  recommendation; grill done in-session, answers folded in; cold read skipped — S task, one serial file)
- Milestone: MS-2 draft (`.workers/milestones/MS-2/spec.md`) — **AC-17** (hidden), **AC-26** (manual-AC, live
  Docker run), **U-8** (default behaviour unchanged). Risk area "Backup verification path" = risk (format).
- Decision behind the shape: OWNER-DECISIONS #30 / `decisions/HO1b2.md` — option B, additive opt-in, no test-guard
  exception; making the container path the default is a separate future milestone decision.
- Base read: virtual-lab `origin/ms/1` = `8938a8b` (HO1b merged as `b50ad68`; HO1e, HO1f, R3 not yet merged).
  MS-2's base is the tip of `ms/1` at activation, so by then HO1e (host verify becomes
  `await verifyBackupStream(produced)`), HO1f (teardown reporting) and R3 (`--editor`) will have changed
  `scripts/selfhost-check.mjs`. The plan therefore names anchors (functions, step names), never line numbers.
- Still open: nothing blocks planning. Accepted items at the end.

## What the spec fixes (AC-17, U-8, shared decisions)

- `parseArgs(['--verify-in-container'])` → `verifyInContainer: true`; **without the flag the key is absent**
  (the existing `deepEqual(parseArgs([]), {…})` pin in `scripts/test/selfhost-check.test.mjs:57` stays green).
- `runCheck({ verifyInContainer: true })` verifies the new backup through **one docker child** whose args contain
  `compose`, `run`, `--rm`, `--entrypoint node`, `-e BACKUP_DIR=/backups`, the service `backup` and
  `verify-backup.mjs --newest /backups`, run with the `COMPOSE_INTERPOLATED`-scrubbed env, **instead of** the host
  verifier. Exit 0 → `backup` step ok; non-zero → `failed: 'backup'`, the child's output tail in the detail,
  teardown still runs. Step list and order unchanged; `backup marker` reads the marker the container wrote on the
  host mount.
- U-8: without the flag, `parseArgs` output, every docker/git command, step list, details and teardown are the
  base's. Non-goal: changing the default.
- Doc line in `docs/self-host.md`, **self-check section only** (hub-file ownership: P1f LTI, HO1h backup, HO1i
  install each own another section).
- Serial file `scripts/selfhost-check.mjs`: HO1b2 → HO1j. HO1b2 lands first in lane P (wave 1).

## Facts from the base code (`origin/ms/1` = `8938a8b`)

- `scripts/selfhost-check.mjs` (770 lines). `parseArgs` (:71) builds a literal default object, unknown flags throw
  `unknown argument`. `USAGE` (:45) is not pinned by any test (only `parseArgs(['--help']).help`).
- Backup step (:607-644): seed proof row → `once` = `docker compose … run --rm -e BACKUP_RUN_ONCE=1 -e
  BACKUP_DIR=/backups -v <workdir>/backups:/backups backup` → `produced = newestBackup(backupDir)` (host; failure
  detail `nothing written under …`) → `verifyBackup(produced)` (host; HO1e makes it `await verifyBackupStream`)
  → step `backup` (detail `<n> checks, <name>` or the error) → checkpoint → `backup marker` =
  `existsSync(<produced>/verified)` → restore child (`--entrypoint node … restore.mjs <name> --yes`, same `-v`).
- Every docker child runs with `{ cwd: cloneDir, timeout, env: dockerEnv }`, `dockerEnv =
  scrubComposeEnv(process.env)`. `why(res)` = spawn error + trimmed tail (200 chars) of stderr, else stdout.
- AC-12 (MS-1) rule for children: after a non-zero child, `await checkpoint()` first — an abort makes the result
  `interrupted`, not a step failure.
- `backup/Dockerfile`: `WORKDIR /app`, `COPY retention.mjs backup.mjs restore.mjs verify-backup.mjs ./`,
  `ENTRYPOINT ["node", "backup.mjs"]` → `--entrypoint node … verify-backup.mjs` resolves in `/app`.
- `backup/verify-backup.mjs` `runCli`: `--newest <root>` prints `newest backup: <dir>`, one line per check,
  `verified: <dir>` / `not verified: <error>`; exit 0 / 1 / 2 (usage, or `no backup directory under <root>`).
  It writes the `verified` marker inside the backup dir — on the host bind mount, so the host `existsSync` sees it.
- Existing test harness pattern (`scripts/test/selfhost-restore.test.mjs`): a fake `exec` keyed on
  `args.includes('run')` / `'restore.mjs'` / `'psql'`, the host backup dir taken from the `-v` value; it builds a
  valid backup fixture. A new test file copies this pattern (it may not import from a test file it cannot edit
  safely — copying is fine).

## Traps found (each changes what the plan may write)

1. **«Що нового» is pinned.** `scripts/test/verify-backup-docs.test.mjs:107-124` asserts that the *first* dated
   bullet of «Що нового» starts `- **2026-11-23` and names `verify-backup.mjs` and `--newest` (the HO1b entry).
   A new dated entry on top breaks an existing test the guard forbids editing. → **HO1b2 adds no «Що нового»
   entry**; the doc change is the self-check section only. The same trap waits for P1f / HO1h / HO1i if they add a
   «Що нового» entry — flagged to the Claude pass (spec-level; not this row's to fix).
2. **«Перевірка» section rule.** `scripts/test/selfhost-interrupt.test.mjs:506-529`: every line in that section
   with `docker compose` and `-f docker-compose…` (not the https overlay) needs «без HTTPS» within the 4 lines
   above; the section must keep `Ctrl+C`, `interrupted`, `130`, `docker compose -p vl-selfcheck`,
   `down -v --remove-orphans`. → the new doc text shows no explicit `-f` command; it names the flag and the
   in-container command form `verify-backup.mjs --newest /backups` in prose.
3. **The clone's ref decides whether the image has the verifier.** The check clones `--ref` (default `main`) and
   builds that ref's `backup` image. A ref older than HO1b has no `verify-backup.mjs` in the image → the child
   exits non-zero (`Cannot find module '/app/verify-backup.mjs'`) → honest `RED at backup` with that tail. This is
   the right behaviour, but the doc must say "needs a ref whose backup image carries `verify-backup.mjs` (HO1b,
   2026-11-23)", and the AC-26 manual run must use such a ref (`main` once MS-1 is accepted; otherwise
   `--ref ms/2`, which the default `--source` = this checkout provides).
4. **Hidden fakes may locate the host mount from `-v`** (the existing harness does). → the verify child carries
   the same explicit `-v <backupDir>:/backups` as the backup and restore children (also keeps a pre-P5c `--ref`
   correct, as the existing `-e BACKUP_DIR=/backups` pins do).
5. **Do not demand stdout.** AC-17 makes the exit code the verdict; a fake child may return empty stdout. → no
   parsing of `newest backup:` as a pass condition.

## Grill (questions that could change the doc; answers decided by recommendation)

| # | Question | Answer |
|---|---|---|
| 1 | Keep the host `newestBackup(backupDir)` before the container child? | **Yes.** The `nothing written under …` failure stays identical in both modes, and `produced` is still needed for the marker step and the restore name. Both read the same mount; one backup per run, so "newest" is the same dir. |
| 2 | Pass `--newest /backups` or `/backups/<name>`? | `--newest /backups` (AC-17 names it). |
| 3 | Detail on success? | `verified in the backup container, <name>` — the host check count is not available; the name matches the default detail's tail. |
| 4 | Detail on failure? | `why(res)` (spawn error + stderr/stdout tail) — "output tail" per AC-17, same helper as every other child. |
| 5 | Abort during the child? | Same AC-12 rule: on non-zero, `await checkpoint()` first → `interrupted`. |
| 6 | Timeout? | `10 * 60_000`, like the backup and restore children. |
| 7 | Pure helper for the args? | Yes, exported `containerVerifyArgs(backupDir, { https })` beside `teardownCommands`/`manualTeardownCommand` — one place, unit-testable without a run. Additive export, no existing export changes. |
| 8 | CLI start line? | Unchanged without the flag; with it, append ` verify=container`. |
| 9 | Help text? | One `USAGE` line for the flag (not pinned by any test). |
| 10 | Linux non-root teardown of root-owned backup files (`rmSync` EACCES)? | Pre-existing in both modes (the backup child already writes as root); out of scope here — HO1f's teardown reporting names it. |
| 11 | One phase or two? | Two: code+tests (risk, pre-merge review) and doc+doc test (normal). One branch, one landing. |

## Accepted (not done here)

- Container verify as the default, and the `vlcheck_backups` project volume (HO1b research D-list) — future
  milestone decision, per `decisions/HO1b2.md`.
- A «Що нового» entry — blocked by the pinned-newest-entry test (trap 1).
- Cross-checking the container's `newest backup:` line against the host's `produced` — exit status is the verdict.
