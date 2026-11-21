# P5c — BACKUP_DIR semantics: build notes (W3, 2026-11-21)

Task (ROADMAP P5c, Claude review 2026-11-19 of HO1/M1.2): the `backup` service
used `BACKUP_DIR` for both the container env (`docker-compose.yml:127`
`BACKUP_DIR: ${BACKUP_DIR:-/backups}`) and the host mount source (`:133`
`${BACKUP_DIR:-./backup/out}:/backups`). An admin's `BACKUP_DIR=/mnt/offsite`
in `.env` made `backup.mjs` write to `/mnt/offsite` **inside** the container
while the mount sat at `/backups` — the off-host folder stayed empty and the
backups vanished on every container recreate (the update's `up -d --build`).
¼ h. Deps P5a done.

Branch `P5c-backup-dir-semantics` (virtual-lab @8beafab base + `.claude-shared`
rebased onto origin/main 3e4fa2a — the claim commit 363daa9 touches only the
P5c row, so the rebase applied without conflict; `git merge` is not in the
coder allowlist, rebase is the sanctioned equivalent here).

## What landed (virtual-lab, 3 commits)

- `528a080` test(P5c): RED — `scripts/test/compose-backup-dir.test.mjs` (4 tests):
  1. the backup service's `environment:` carries the literal `BACKUP_DIR: /backups`
     and never `${BACKUP_DIR…}` — **RED before the fix**: line 127 interpolated,
     so the literal-pin regex failed and the doesNotMatch failed too;
  2. `${BACKUP_DIR` appears exactly once in the backup block, in the mount
     `- ${BACKUP_DIR:-./backup/out}:/backups` — **RED before**: two uses;
  3. selfhost-check keeps `-e BACKUP_DIR=/backups` on the **backup run** child
     (the restore child's flag was already pinned by
     `selfhost-restore.test.mjs:166`; the backup child's had no test) — green
     before and after: it pins the KEEP decision, not the bug;
  4. live `docker compose config --format json` with `BACKUP_DIR=/x`: resolved
     env `/backups`, mount source `/x` (the review's suggested proof). Skips
     without Docker Compose or without a local `.env` (`env_file: .env` is
     required by `config`); pattern of verify-backup's system-tar probe. The
     fs pins 1–2 are the always-on gate.
- `fdbe79c` fix(P5c): `docker-compose.yml` env line → `BACKUP_DIR: /backups`
  with a comment (Compose precedence: `environment:` > `env_file:`, so the
  literal also neutralises the key arriving via `.env`); mount source
  untouched. `scripts/selfhost-check.mjs`: comment only, recording why the
  `-e` workaround is KEPT — the check clones any `--ref`, including pre-P5c
  code whose compose still interpolates.
- `7a6983b` docs(P5c): `docs/backup-restore.md` new section "Where backups
  land: `BACKUP_DIR` is the HOST folder" (semantics, the pre-P5c failure mode,
  why the manual `-e` stays); `docs/self-host.md` «Резервні копії та
  відновлення» host-folder paragraph + a «Що нового» entry (2026-11-21);
  `.env.example` commented `# BACKUP_DIR=./backup/out` block (comment lines
  only — `buildEnv`'s `^([A-Z0-9_]+)=` regex never matches them, and its tests
  compare template-relative line counts, so the added lines are inert).

## Decisions

- **Workaround KEPT** (`-e BACKUP_DIR=/backups` on both run children in
  selfhost-check, and in the documented manual commands): after the fix it is
  redundant for current code but keeps the check and the doc commands correct
  against older checkouts; dropping it would also break the existing pin
  `selfhost-restore.test.mjs:166` (tests are never weakened). New test 3 pins
  the backup child's flag so the decision is enforced, per the row's
  "keep or drop the workaround **with a test**".
- No overlay touched (`docker-compose.{https,selfcheck,scratch,restore}.yml`
  unchanged), no COMPOSE_FILE handling touched (M1.2r lesson). The live test
  deletes `COMPOSE_FILE` from its own child env so the host's overlay list
  cannot leak into the assertion.

## RED reasoning (tests NOT run — verifier's queue)

Before `fdbe79c`, `docker-compose.yml:127` was
`BACKUP_DIR: ${BACKUP_DIR:-/backups}`: test 1's
`/^\s*BACKUP_DIR:\s*\/backups\s*$/m` cannot match a `${…}` value, and test 2
counts 2 `${BACKUP_DIR` uses (env + mount) ≠ 1. After the fix the env line is
the literal and the single interpolation is the mount — both green by
inspection. Test 4 on old code would resolve env to `/x` (≠ `/backups`).

## Verification owed (verifier)

- `npm run test:scripts` (root; `node --test scripts/test/*.test.mjs`) — the
  new file joins the existing suite (was 93/93 at M1.2r).
- Live compose-config assertion needs Docker + a local `.env`; lead handles
  locks (vl-db.lock) if the fuller gates run: `cd backend && npm run
  test:unit`, backend Postgres suite per `tasks/README.md`.
- `selfhost-check` live GREEN is optional for this ¼ h row (compose semantics
  are pinned statically + by the config probe); lead decides.