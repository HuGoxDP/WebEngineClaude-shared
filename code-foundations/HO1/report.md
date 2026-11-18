# HO1 — self-host kit: task report (W3, 2026-11-18)

Objective: a self-host kit for virtual-lab — from a clean clone to a working platform,
proven by `npm run selfhost-check`; a Ukrainian admin guide (`docs/self-host.md`).
Replaces the dropped OPS1 deploy pipeline (owner, 2026-11-17: no production access;
the university builds and runs the repo itself).

Research `research.md`, plan `plan.md`, build notes `notes.md`. Branch
`HO1-self-host-kit` in both repos; virtual-lab side pushed, HEAD `0d5566a`.
Raw run logs: `C:/Users/HuGox/AppData/Local/Temp/opencode/w3/`.

## What landed (virtual-lab, 6 commits)

- `76710a3` — phase 1: `scripts/selfhost-check.mjs` (driver), `scripts/lib/verify-backup.mjs`
  (backup read-back), `docker-compose.selfcheck.yml` (renamed project/volumes/containers,
  no host ports), root `package.json` scripts (`selfhost-check`, `test:scripts`), 28 tests.
- `2833345` — phase 2: fresh-install smoke — `e2e/playwright.smoke.config.ts`,
  `e2e/smoke-setup.ts`, `e2e/tests/smoke.spec.ts` (7 read-only assertions), `smoke` script.
- `fe8b99c` — `docs/self-host.md` (Ukrainian), Readme link, e2e/README paragraph.
- `93982a9` — fake-git fixture fix (the secret-leak test's fake git answered `rev-parse`
  as a clone and wrote into the repo cwd).
- `2b546bc` — review fixes D1/D3–D7 + smoke reads the engine version from
  frontend/package.json and defaults to base URL 8051.
- `0d5566a` — review fix D2: restore refuses unverified backups (the `verified` marker
  gate, before any spawn, dry-run and `--yes` included); docs/backup-restore.md gained
  the verify step; CLI.

## Bugs caught by the fixtures (before any live run)

1. Tar header checksum parsed as decimal — it is octal; decimal parsing rejected every
   real tar whose byte-sum carries an 8 or 9.
2. Truncated tail accepted — a tar whose last entry promises more bytes than the buffer
   holds walked off the end silently; now a named failure.
3. `BACKUP_DIR` is not a template line in `.env.example` — `buildEnv` appends it so the
   check owns where its backup lands.

## Adversarial review round

7 demonstrated defects, all fixed (`2b546bc`, `0d5566a`), re-review PASS with executed probes:

- D1 teardown skipped when `up` failed/timed out — now runs whenever `up` was attempted.
- D2 restore accepted unverified backups — `verified` marker now enforced.
- D3 read-back trusted the manifest — every manifest volume cross-checked against its archive.
- D4 mid-header truncation passed silently — named failure.
- D5 stale `verified` marker survived a re-run — removed at verify entry.
- D6 a file accepted as the lock — lock must be a directory.
- D7 shell env overrode the generated `.env` — all compose-interpolated vars scrubbed
  from child envs; the generated `.env` is the single source.

Re-review evidence: scripts 42/42 (28 baseline unweakened + 14 new defect tests),
restore 4/4, scrub coverage 21/21 interpolated vars.

## Verification

- **Live `selfhost-check` GREEN, 11/11 steps, twice**: clone@2833345, then clone@0d5566a
  under a deliberately poisoned shell env (`FRONTEND_PORT=8044`, `DB_PASSWORD`,
  `BACKUP_DIR` exported) — scrub held: stack bound 8051, poison backup dir never created,
  zero vlcheck containers/volumes left after teardown.
- Smoke 7/7 also against the local lab stack on spare port 8052.
- Backend full suite (unit + Postgres integration): **1666/1666, 0 skipped**. First
  attempt hung: missing `ADMIN_TOKEN` env — an invocation error, not a code defect.
- Frontend `ng test --watch=false` on the idle machine: **770/770, 50 files**. The earlier
  4 reds were load-induced vitest 5 s timeouts in untouched files; no test weakened.
- Frontend `npm run build` + `check:csp`: green.

## Machine symptoms (not kit defects)

- Docker Desktop down at run start; started it (daemon 29.9.3).
- Port 8044 held by W1's editor harness — used 8052 for the lab-stack smoke and restored
  the stack's prior state; nothing of W1's touched.
- Load-induced frontend vitest timeouts (different tests each run, all untouched files).

## Known limitations / follow-ups (non-blocking, from the re-review notes)

- Verify accepts a manifest with an empty/absent volumes list when `volumes/` is absent
  (requires post-backup tampering; hardening candidate).
- `--keep` after a failed `up` leaves containers for manual teardown (intentional debug flag).
- The `rmSync`-failure catch branch is untested empirically.
- `verify-backup.mjs` missing trailing newline (cosmetic).

ROADMAP follow-ups: P5b (`--https` + restore inside the check), R3 (editor in the kit),
M1.2 (release handoff on a fresh `origin/main`), HO1a (Windows one-command installer).
