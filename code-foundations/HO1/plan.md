# HO1 — self-host kit: plan (W3, 2026-11-17)

Research: `.code-foundations/research/2026-11-17-ho1-self-host-kit.md` (decisions
D1–D10). Branch `HO1-self-host-kit` in `virtual-lab` (+ `.claude-shared`).
Repos: **P, S**. Graphify: not applicable (no engine files).

## Deliverables

1. `package.json` + `scripts/selfhost-check.mjs` (+ `scripts/lib/verify-backup.mjs`,
   `scripts/test/…`, `docker-compose.selfcheck.yml`) — `npm run selfhost-check`:
   clone the default branch → `.env.example` → `.env` with generated secrets and a
   spare port → `up -d --build` on a renamed stack → wait healthy → one verified
   backup → the e2e smoke → teardown. Refuses without its lock (D8).
2. The e2e smoke (additive): `e2e/playwright.smoke.config.ts`,
   `e2e/smoke-setup.ts`, `e2e/tests/smoke.spec.ts`, `npm run smoke` — the seven
   fresh-install assertions of D4.
3. `docs/self-host.md` (Ukrainian) + links.
4. Report: ROADMAP row → `✅ … W3`, CHANGELOG, `.claude-shared/code-foundations/HO1/`.

## Phase 1 — the check driver

**File scope:** `package.json`, `scripts/selfhost-check.mjs`,
`scripts/lib/verify-backup.mjs`, `scripts/test/selfhost-check.test.mjs`,
`scripts/test/verify-backup.test.mjs`, `docker-compose.selfcheck.yml` (all new).
**Model:** this worker. **Gate:** Standard.

- `package.json` (root): `{ name, private, version, description, scripts:
  { selfhost-check: "node scripts/selfhost-check.mjs" } }` — no dependencies.
- `docker-compose.selfcheck.yml`: renames the five volumes
  (`vlcheck_*`) and the containers (`VLCheck*`); **no ports block** (the base
  publishes `${FRONTEND_PORT}:80`, and the generated `.env` sets the spare one).
  Comment records why: a second project under different `-p` still collides on
  names, and `down -v` would delete the live stack's data (D2).
- `scripts/lib/verify-backup.mjs` — the D-9 read-back as a Node module over a
  backup directory: `db.sql.gz` present + valid gzip + names ≥ 1 table +
  `manifest.json` valid JSON + every `volumes/*.tar.gz` a readable tar + write the
  `verified` marker last. Pure (fs only), `(backupDir) => {ok, checks[], error}`.
- `scripts/selfhost-check.mjs` — the driver, every step printed and every failure
  named (`step=… ok=0 reason=…`), exit non-zero, teardown in a `finally` that also
  disables the restart policy first (D6):
  1. parse flags (`--ref`, `--source`, `--frontend-port`, `--lock`, `--keep`);
  2. lock check (D8): `--lock <dir>` must exist, else refuse;
  3. bind-check the port (D3) — refuse if taken;
  4. clone: `git clone --depth 1 --branch <ref> <source>` into a temp dir,
     print `source sha=<short>` (D5);
  5. write `.env` from `.env.example` (D1): copy verbatim except
     `DB_PASSWORD` / `ADMIN_TOKEN` (random 32 bytes hex, once), `FRONTEND_PORT`
     (the spare port), `BACKUP_DIR` (temp). Values never printed;
  6. `docker compose -p vl-selfcheck -f docker-compose.yml
     -f docker-compose.selfcheck.yml up -d --build`;
  7. wait healthy (D6): poll `http://127.0.0.1:<port>/` and `/api/health`
     (`status: ok`, `db: connected`) for ≤ 300 s, one line per second of wait;
  8. backup once: `docker compose … run --rm -e BACKUP_RUN_ONCE=1
     -e BACKUP_DIR=/backups -v <tmp>/backups:/backups backup`, then
     `verifyBackup()` (D7). A failed verification is the step's refusal;
  9. smoke: `npm ci` in the clone's `e2e`, `npx playwright install chromium`
     (idempotent), then `E2E_BASE_URL=http://127.0.0.1:<port> ADMIN_TOKEN=<generated>
     npm run smoke` (D4);
  10. teardown: `down -v --remove-orphans` (after `stop`/policy disable),
     remove the temp dir, print a summary line (`steps=n ok=n failed=…`).
- `scripts/test/*.test.mjs` (`node --test`): the pure parts with fixtures —
  `.env` generation (verbatim copy, secrets changed exactly once, port/BACKUP_DIR,
  no secret echoed in any return value), port bind check (taken port → refuse),
  compose argument assembly (both `-f` flags, project, env order),
  `verify-backup` (a fixture backup passes; a truncated gzip, a manifest that is
  not JSON, an unreadable tar and a missing `db.sql.gz` each fail with their named
  reason; the `verified` marker only on success), the wait-healthy parser over a
  fake `/api/health` (status/db fields), teardown command list (policy disable
  before `down -v`). Docker and git are injected, never called.
**DW:** `node --test scripts/test` green; `npm run selfhost-check -- --help`
prints usage; no secret appears in any output object (asserted by a test).

## Phase 2 — the e2e smoke (additive)

**File scope:** `e2e/playwright.smoke.config.ts`, `e2e/smoke-setup.ts`,
`e2e/tests/smoke.spec.ts`, `e2e/package.json`. **Depends on:** phase 1 (the
driver runs `npm run smoke`). **Model:** this worker. **Gate:** Standard.

- `playwright.smoke.config.ts`: the main config's `use` (locale `uk-UA`,
  timezone `Europe/Kyiv`, chromium) + `testMatch: /smoke\.spec\.ts$/` +
  `globalSetup: './smoke-setup.ts'` + serial/one worker, same reasoning as the
  main config (read-only here, but the same shape).
- `smoke-setup.ts`: health-only gate — `/api/health` must answer 200 or the run
  stops with "start the stack first". The main suite's empty-catalog gate stays
  exactly where it is (D4): a fresh install has no scenarios and the full suite
  knows that; the smoke is the layer that can prove a fresh install.
- `tests/smoke.spec.ts`: the seven assertions of D4, each naming the contract it
  pins (engine bundle headers, the player guard, 401 without a credential, the
  bootstrap moderator with `ADMIN_TOKEN` — skipped with a reason when unset).
- `e2e/package.json`: `"smoke": "playwright test -c playwright.smoke.config.ts"`.
**DW:** `npm run smoke` against the live local stack: 7/7 green (run under
`vl-db.lock`); the main suite's config and gate untouched (diff shows only
additions).

## Phase 3 — the check, live

**File scope:** anything phases 1–2 got wrong, plus their fixes. **Depends on:**
phases 1–2. **Gate:** Standard + adversarial review (a read-only subagent reviews
`selfhost-check.mjs` and the smoke for file:line defects before this phase closes).

- `bash .workers/wk.sh lock vl-db W3 HO1`; run
  `node scripts/selfhost-check.mjs --ref HO1-self-host-kit --source .`
  on the branch (the local branch is the clone source before the merge, D5).
- Watch for the OPS1 lessons: the bring-back's unhealthy container (report as a
  machine symptom with `docker logs` kept, not a kit defect), `restart:
  unless-stopped` resurrection at teardown, path forms on Windows (the compose
  file is resolved by the docker CLI, the bind mount by the daemon — the host's
  own form goes to each).
- Full repo checks for this task: `cd backend && npm run test:unit`
  (+ the Docker/Postgres suite when the daemon allows it), `cd frontend &&
  npx ng test --no-watch`, the e2e smoke (phase 2), `node --test scripts/test`,
  and `node scripts/selfhost-check.mjs` end to end.
**DW:** the check green end to end on the branch; every touched repo's checks
green in one run; the adversarial review's findings fixed or recorded as
follow-up rows.

## Phase 4 — docs and report (Minimal)

**File scope:** `docs/self-host.md`, `Readme.md`, `e2e/README.md`,
`.claude-shared/` (ROADMAP, CHANGELOG, `code-foundations/HO1/`, follow-up rows).
**Depends on:** phases 1–3.

- `docs/self-host.md` (Ukrainian, for the university's admins): what the platform
  is; requirements (Docker + Compose, 2 GB, ports `FRONTEND_PORT`); install
  (`git clone`, `cp .env.example .env`, secrets, `docker compose up -d --build`,
  first moderator login with `ADMIN_TOKEN`); update (`git pull` +
  `docker compose up -d --build`, what is kept — the volumes — and what is not);
  backup/restore → `docs/backup-restore.md`; HTTPS → `docker-compose.https.yml`
  (self-signed proof, real certificate = mount at `/etc/nginx/tls/`, P5b);
  editor → `docker-compose.editor.yml` (needs the WebEngineTSEditor checkout);
  logs, stop, reset (`down -v`); `npm run selfhost-check` as the "does my install
  work?" command and why it needs a spare port.
- `Readme.md`: one link to `docs/self-host.md` where install is described.
- `e2e/README.md`: one paragraph — the smoke, what it proves on a fresh install,
  how to run it.
- CHANGELOG *Added*/*Fixed*; ROADMAP row → `✅ 2026-11-17 W3` + what landed;
  follow-up rows (⬜) for what the plan leaves open (e.g. `selfhost-check
  --https`/restore = P5b, editor kit = R3, a one-command installer for Windows
  admins); the research/plan/build notes copied to
  `.claude-shared/code-foundations/HO1/`.
- Local hygiene (D10): `.code-foundations/` and `/e2e/smoke-results/` into the
  shared `.git/info/exclude`; junk check on both repos.
**DW:** junk check clean; every branch pushed; the report written.