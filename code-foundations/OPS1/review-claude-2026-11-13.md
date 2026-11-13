# OPS1 — Claude's review before the merge (2026-11-13)

Read on the task branch `OPS1-deploy-pipeline`, virtual-lab **`13d01b8`** (phases 1–4 committed,
W3 in phase 4 "build"), against `plan.md` and `research.md` beside this file. Nothing was merged
yet, so these are inputs to W3's remaining phases, not a verdict on finished work: an item may
already be fixed in W3's working tree. **Each item is closed by a regression test that fails on
`13d01b8`, not by inspection.** Row **OPS1r1** checks every item on `main` after the merge and
fixes what is left; OPS1b (and through it every deploy row) waits for it.

Why this matters before Phase 5: the rehearsal induces a red smoke with `--red smoke` and
compares exit codes. Several items below (R1, R2, R5, R6, R7) give the *expected* exit code in
that table and still leave production broken. They need their own assertions on what ran and on
the resulting state, not on the exit code.

## Critical — a real deploy cannot work, or a rollback is not a rollback

**R1. The rollback brings up the release that just failed.** `ops/deploy/lib/steps.mjs:166`
returns `previousRelease: release` — `release` is `releaseId(commits)`, the id of the release
being deployed. `deploy.mjs:159` spreads that result into `rollbackRelease`, whose `stop` and
`up` then target the new release again. D-10: it "brings the **previous** release record up".
The previous id has to be read from the release record (`state.sh read`) *before* `up`, and the
deploy must refuse (gate, exit 4) when there is no previous record and the host is not a fresh
install. Test: the rollback's `up.sh` call receives the previous id, and it is not the new id. The
DW-4.2 tests at `13d01b8` never assert the rollback target, and in the rehearsal both "releases"
are the same healthy stack, so exit 10 comes out as expected.

**R2. The smoke never runs.** No code path starts the Phase 3 suite (`npm run smoke` from the
worker against `<scheme>://DEPLOY_DOMAIN` with `SMOKE_EXPECT_COMMIT`, scheme from
`shared/deploy.json`). A red smoke exists only as the rehearsal flag (`red === 'smoke'`,
`steps.mjs:149`), and the rollback's "smoke previous" exists only as `redPrevious`. A real deploy
writes its record and exits 0 having tested nothing. DW-4.1 puts `smoke` between
`migrations(after)` and `recordState`. AGENTS.md *Deploy* requires "the e2e smoke suite against
the live site". The D-8 **local preflight** (the very images on a scratch project, smoke green)
is missing too, and so is the Phase 4 edge case "Playwright missing → exit 5 before `up`". Test:
the recording `spawn` sees the smoke command with the expected env, a non-zero smoke exit leads
to the rollback, and `--red` cannot be used without `--rehearsal`.

**R3. Images are never shipped and the bundle never arrives.**
- `pipeIn` (`docker save | gzip` → ssh → `gunzip | docker load`, D-2) is never called.
  `have-images.sh` only reports.
- `upload-bundle` is called with `[DEPLOY_PATH, '<id>.tmp', 'bundle.tar.gz']`
  (`steps.mjs:130`), but the script reads `$1` as the *releases* directory and `$3` as a file on
  the remote host. Nothing put `bundle.tar.gz` there, because `bash -s` reads the script itself
  from stdin. And the release would land in `DEPLOY_PATH/<id>.tmp`, not
  `DEPLOY_PATH/releases/<id>`.
- So `up.sh` (`cd releases/<id>`) fails `error=no-release` on any host. DW-4.1 `ship`,
  `uploadBundle`.

**R4. The release record is never written.**
- `state.sh` only implements `read`. `write` prints `state_unhandled` and exits 1, and
  `deployPlatform` ignores `record.ok` (`steps.mjs:150`) and returns `ok: true`.
- Nothing creates `releases/current` either, yet `backup.sh` and `restore-db.sh` `cd` into it.
  So every deploy refuses at `backup` with `no-current-release`.
- D-9's fresh-install path (no DB container and no `virtual_lab_pgdata` → record
  `backup: none (fresh install)`) is not there.
- R1 cannot be fixed without this.
- Test: after a happy deploy the record holds `current` = the new id and `previous` = the old
  one, and a failing `state write` is not exit 0.

## High — the rollback does damage, or does not happen

**R5. An unhealthy stack after `up` is not rolled back.** D-10: "Triggered by any failure after
`up` starts: a service not healthy within 5 min … or a red smoke".
- `steps.mjs` returns exit 5 without `rollback` when `up` or `wait-healthy` fails.
- The test "a failure after `up` is exit 5 and the rollback is asked for"
  (`ops/deploy/test/steps.test.mjs`) asserts `result.rollback === undefined`: its title and its
  assertion disagree, and the assertion is the deviation.
- A half-started or unhealthy new stack stays in production.

**R6. The database rollback also restores the content volumes.**
- `restore-db.sh:25` runs `backup/restore.mjs <name> --yes`, which untars every volume over the
  live one (`backup/restore.mjs:87-90`). Research F-5 names it "wrong for a rollback". D-10:
  "Content volumes are never restored on rollback … restoring them could only lose data".
- D-10's restore is:
  1. stop `backend`;
  2. `DROP DATABASE … WITH (FORCE)` + `CREATE DATABASE` through the container's own superuser;
  3. load the pre-deploy `db.sql.gz` with `ON_ERROR_STOP=1`;
  4. start the previous backend.
- Test (rehearsal): an object written to a content volume after the backup survives a rollback
  with a DB restore.

**R7. `docker-compose.restore.yml` is in every compose call.**
- `release.mjs` `BUNDLE_BASE` is both the bundle (files shipped) and the `composeFiles()` list.
  `steps.mjs` `composeFilesFor` passes that list unfiltered as `COMPOSE_FILE` to `backup`, `up`,
  `stop`, `migrations` and `restore-db`.
- So the production nightly `backup` service runs with **write** access to the content volumes,
  which undoes the read-only design at `docker-compose.yml:142-145`.
- Compose is also asked to parse `db/init.sql` (and, with `--editor`, `nginx/*.conf`) as YAML.
- The `-f` list (compose files only, no restore overlay) and the bundle list (what is shipped)
  are two lists. Test: `docker compose config` through `up.sh`'s environment shows the backup
  service's content mounts `read_only`.

**R8. The `COMPOSE_FILE` separator.**
- The list is joined with `,` (`steps.mjs:74`) and exported as `COMPOSE_FILE`.
- Compose splits `COMPOSE_FILE` on `COMPOSE_PATH_SEPARATOR`, whose default is `:` on Linux and
  `;` on Windows. So the whole string is read as one file name. No script sets the separator.
- Set `COMPOSE_PATH_SEPARATOR=,` beside every `COMPOSE_FILE=` (or pass one `-f` per file), and
  pin it with a test that runs a remote script's compose line through `docker compose config`.

## Medium

**R9. Backup verification is weaker than D-9 and writes no marker.**
- `verify-backup.sh` checks `gzip -t`, `grep -c '^CREATE TABLE '` and that the manifest parses.
- D-9 requires all of:
  - the `-- PostgreSQL database dump complete` trailer;
  - a restore into a throwaway `postgres:16-alpine` (`--network none`, tmpfs, removed after)
    with `ON_ERROR_STOP=1`;
  - the table list and `schema_migrations` equal to the live ones;
  - the `scenarios` count equal to the live count (one retry, then refuse);
  - the manifest listing every volume.
- It also runs `node -e` on the host, and a Docker-only host has no node: use `jq`, or a
  container.
- It never writes the `verified` marker that `restore-db.sh:15` requires, so every rollback
  with a DB restore ends in exit 11.

## Low

**R10.** `backup.sh` takes the backup name from `grep -o '[0-9T:.-]*Z' | head -1` over the
container's stdout, with stderr discarded. The prefix may be empty, so any `Z` matches. Print
the name as a `key=value` line from `backup.mjs`, read that, and keep stderr in the log.

**R11. Redaction swallows ordinary log text.** `makeRedactor` replaces every occurrence of
`DEPLOY_PORT` and `DEPLOY_USER`.
- With the default port, `2026-11-13T22:07` becomes `…T<DEPLOY_PORT>:07`.
- A user named `deploy` turns `[deploy] deploy platform` into tokens.
- A port is not a secret. Redact the user only in its `user@` form. Parsing is unaffected:
  `step()` parses raw stdout.

**R12.** `prune` runs with an empty keep list over the images just deployed (`steps.mjs:152`),
so `would_remove` lists the current release. It is a dry run today, but the keep list must come
from the record (D-3: the last three releases' images) before an `apply` path exists.

**R13.** With `--editor`, `freshSourceGate` checks only virtual-lab, so the editor image can be
built from a dirty or unpushed `WebEngineTSEditor` tree. Check both repos at their
`origin/<default>`.

## Tests that promise more than they check

The DW-4.1 test's title lists `preflight → … → ship → … `, but its `deepEqual` pins a sequence
with no preflight, no ship (`pipeIn`) and no smoke. The exit-5 test's title says the rollback is
asked for, and it asserts the opposite. Per the Testing rules, fix the assertions to the plan's
DW text, not the titles to the code.
