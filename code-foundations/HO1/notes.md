# HO1 — self-host kit: build notes (W3, 2026-11-18)

Task: from a clean clone, `.env.example` → `docker compose up -d --build` gives a working
platform, proven locally by `npm run selfhost-check`; Ukrainian admin guide. Replaces the
dropped OPS1 deploy pipeline (owner 2026-11-17: no production access).

Research `research.md` (D1–D10), plan `plan.md` (4 phases). Branch `HO1-self-host-kit`
(virtual-lab + .claude-shared). Parts reused from the unmerged `OPS1-deploy-pipeline`
branch: the backup read-back idea, wait-healthy, the restart-policy teardown lesson.

## What landed (virtual-lab)

- `76710a3` phase 1 — `scripts/selfhost-check.mjs` (driver), `scripts/lib/verify-backup.mjs`
  (read-back), `docker-compose.selfcheck.yml` (renamed project/volumes/containers, no ports),
  root `package.json` (`selfhost-check`, `test:scripts`), 28 `node --test` tests.
- `2833345` phase 2 — the fresh-install smoke: `e2e/playwright.smoke.config.ts`,
  `e2e/smoke-setup.ts` (health-only gate), `e2e/tests/smoke.spec.ts` (7 read-only
  assertions), `smoke` script in e2e/package.json. Main suite untouched.
- `fe8b99c` phase 4 — `docs/self-host.md` (Ukrainian), Readme link, e2e/README paragraph.
- `93982a9` fixture fix — the fake git in the secret-leak test answered `rev-parse` as a
  clone and wrote `HEAD/.env.example` into the repo cwd; found by the junk check.
- `2b546bc` review fixes D1/D3–D7 (teardown, read-back cross-check, mid-header truncation,
  stale marker, lock type, env scrub) + smoke reads the engine version from
  frontend/package.json and defaults to base URL 8051.
- `0d5566a` review fix D2 — restore refuses unverified backups; docs/backup-restore.md
  gained the verify step (`node scripts/lib/verify-backup.mjs <dir>`).

## Bugs found and fixed (by the fixtures, before any live run)

1. **Tar checksum parsed as decimal.** The header checksum is octal like every other
   numeric tar field; decimal parsing rejected every real tar whose byte-sum carries an
   8 or 9. The first good-backup fixture failed on it.
2. **Truncated tail accepted.** A tar whose last entry promises more bytes than the buffer
   holds walked off the end silently; now a named `truncated tail` failure.
3. **BACKUP_DIR is not a template line** (compose defaults `${BACKUP_DIR:-./backup/out}`);
   `buildEnv` appends it before the file's final newline so the check owns where its
   backup lands.

## Review round (adversarial, same day)

7 demonstrated defects, all fixed in `2b546bc` + `0d5566a`, re-verified:

1. **D1** teardown skipped when `up` failed/timed out — now runs whenever `up` was
   attempted, before the clone is removed; `rmSync` failure non-masking.
2. **D2** restore accepted unverified backups — `restore.mjs` refuses without the
   `verified` marker (before any spawn; dry-run and `--yes` included).
3. **D3** read-back trusted the manifest — every manifest volume now cross-checked
   against its archive.
4. **D4** mid-header truncation passed silently — named failure.
5. **D5** stale `verified` marker survived a re-run — removed at verify entry.
6. **D6** lock file accepted — lock must be a directory (`statSync`).
7. **D7** compose-interpolated vars leaked from the caller env — all scrubbed from child
   envs; the generated `.env` is the single source.

Also: smoke reads the engine version from frontend/package.json (no hardcoded 0.2.0);
smoke default base URL 8051, not the lab's 8044. 14 new defect tests added.

## Verification

- `npm run test:scripts`: **42/42** (28 baseline preserved + 14 review defect tests);
  `node --test backup/restore.test.mjs`: **4/4**.
- **Live `selfhost-check` GREEN, 11/11 steps** on `--ref HO1-self-host-kit --source .`
  under `vl-db.lock` (2026-11-18): clone@2833345 → env (4 keys) → up → healthy 0 s →
  backup **9 checks** (`2026-11-18T16-21-16Z`) → `verified` marker → e2e deps/browser →
  smoke **7 passed (12.2 s)** → teardown. Full log in the run record.
- Smoke also **7/7 against the local lab stack** on spare port 8052 (the lab's 8044 was
  held by W1's editor harness; the stack was returned to its prior stopped state after).
- **Second live `selfhost-check` GREEN, 11/11** at `0d5566a` under a deliberately poisoned
  shell env (`FRONTEND_PORT=8044 DB_PASSWORD=… BACKUP_DIR=<temp>` exported): scrub held —
  stack bound 8051, poison backup dir never created, zero vlcheck containers/volumes left
  after teardown. Settles the review's BACKUP_DIR mount-precedence note: the check's backup
  landed in its own clone dir, not the caller's.
- Backend full suite (unit + Postgres integration, docker-compose.test.yml :55432):
  **1666/1666, 0 skipped**. First attempt hung 40 min: invocation lacked `ADMIN_TOKEN`
  (tests read it from env, CI sets `ci-admin-token`); the undefined token made supertest
  throw before its server closed, leaking handles — an invocation error, not a code
  defect. Green run with `ADMIN_TOKEN=ci-admin-token` finished clean.
- Frontend `ng test --watch=false` on the idle machine: **770/770, 50 files, 21.9 s** —
  confirms the earlier 4 reds were load-induced 5 s vitest timeouts in untouched files;
  no test weakened.
- Frontend `npm run build` + `check:csp`: green.

## Machine symptoms (not kit defects)

- Docker Desktop was down at run start (daemon not running); started it, daemon 29.9.3 up
  in ~10 s. The 2026-11-16 flaky-DNS/restart history did not recur during the check.
- Port 8044 was held by W1's `serve-editor.mjs` (editor-e2e.lock, C4) — the lab frontend
  was started on 8052 for the smoke DW and stopped again; nothing of W1's was touched.
- Frontend vitest 5 s timeouts shift between runs under load (different tests each time,
  all in untouched files) — a machine-load symptom, recorded, no test weakened.

## Decisions kept from research

D4 smoke = 7 read-only assertions; D5 clone source defaults to the local checkout (prints
the sha; proves committed state, no network dependency); D7/D9 backup verified by reading
it back, marker only on success; D8 lock directory required (`--lock`); D10 local hygiene
via the shared `.git/info/exclude` (`/.code-foundations/`, `/e2e/smoke-results/` added).

## Left open (ROADMAP rows)

- P5b — `selfhost-check --https` + one backup restored inside the check; real-certificate
  admin steps.
- R3 — editor container in the kit (`--editor`).
- M1.2 — release handoff: green on a fresh `origin/main` + "what's new / how to update".
- HO1a — one-command installer for Windows admins.