# P5a — backups and HTTPS, repo side (plan)

Standard gate (Sonnet-sized, shell + compose + Node scripts). Source: the P5a row,
`tasks/E-growth.md` P5, `code-foundations/P5a/research.md`.

## Phase 1 — the backup service (build)
- `File scope`: `backup/**` (new dir: `Dockerfile`, `retention.mjs`, `backup.mjs`,
  `restore.mjs`, `test/unit/retention.test.js`), `docker-compose.yml`
- Steps: the retention module (pure: which timestamped backup dirs survive `keepDays`, with
  keep-at-least-one and garbage-tolerant rules); `backup.mjs` (`pg_dump` from the `database`
  service, tar of the three content volumes + the LTI key volume, a `manifest.json`, then
  prune); `restore.mjs` (dry-run by default, `--yes` to restore a chosen backup into the
  running stack — the scratch-stack procedure lives in the docs); the `backup` service in the
  main compose (volumes read-only for the copy, `./backup/out:/backups` for the local target,
  `BACKUP_KEEP_DAYS`/`BACKUP_SCHEDULE_HOURS` from `.env`).
- Unit tests: `backup/test/unit/retention.test.js` (`node --test`), boundary-day, garbage names,
  keep-at-least-one, empty list.

## Phase 2 — the restore, run on a scratch stack (test)
- `File scope`: `docs/backup-restore.md` (new)
- Depends on: Phase 1.
- The written procedure: bring the scratch compose project up (fresh volumes), seed a row
  through the API, back up, tear the scratch stack down `-v`, bring it up again, restore,
  verify the row and the archive are back. Run it once under `vl-db.lock` and paste the
  transcript into the notes.

## Phase 3 — HTTPS for the stack (build)
- `File scope`: `docker-compose.https.yml` (new), `nginx/https.conf` (new),
  `nginx/make-cert.mjs` or `nginx/README` cert generation (new)
- Depends on: none (disjoint files).
- A compose override (same stack, extra `443` publish + a cert volume), an nginx TLS server
  block that reuses the existing location rules (`include` of the existing config fragments,
  HSTS added), and a documented self-signed cert generator for the local proof.

## Phase 4 — checks (Standard)
- `File scope`: none.
- Depends on: Phases 1–3.
- Inside `vl-db.lock`: `cd backend && npm run test:unit`; `docker compose -f
  docker-compose.test.yml up -d --wait` + the DB integration tests + `down`; then the main
  stack up with the backup service, one backup run, the Phase-2 scratch restore, and the
  HTTPS `curl -k` proof. Every failure is a bug: reproduce, fix, regression test, re-run.

## Phase 5 — report + merge (Minimal, last)
- `File scope`: `.claude-shared/**` (ROADMAP row → ✅, `code-foundations/P5a/notes.md`,
  CHANGELOG)
- Depends on: Phase 4. Merge: virtual-lab first, `.claude-shared` last, under `merge.lock`.
