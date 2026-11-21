# M1.2s research — health-identity claim is false in practice; update section has no rollback

Date 2026-11-20, W3. Source: ROADMAP:81 (P; ¼ h; Claude review of M1.2, 2026-11-19).
virtual-lab worktree HEAD `0bcb578` (main), shared worktree claim base fresh `origin/main`.
Claim: `claims/M1.2s` = `d910b31`, branch `M1.2s-health-doc-rollback` in both repos.
All line numbers verified against those HEADs.

## 1. Fix (1): `/api/health` → `build` cannot identify the running release today

Doc claim — `docs/self-host.md:72-74`:

> Реліз платформи — це стан гілки `main`; тегів версій у репозиторії немає.
> Яка саме збірка у вас працює, показує `GET /api/health` → `build` (рушій —
> окремо: штамп збірки у переглядачі під `?diag=1`).

Code facts — `backend/routes/health.js:21-25`:

```js
const API_BUILD = {
  version: require('../package.json').version,   // :22
  commit: process.env.API_COMMIT || null,        // :23
  startedAt: new Date().toISOString(),           // :24
};
```

- `backend/package.json:3` — `"version": "1.0.0"`, a fixed literal; it does not move with releases (no tags exist, per the doc itself).
- `API_COMMIT` is set **nowhere**: repo-wide grep (excluding node_modules) matches only `backend/routes/health.js` and `backend/test/integration/auth-and-crud.test.js`. `backend/Dockerfile` has one ENV (`NODE_ENV=production`, :4) and no ARG; `docker-compose.yml` backend service passes no such env. So `build.commit` is always `null` in every real deployment.
- The health.js header comment (:18-19) says null is deliberate: "the honest answer for 'built from a working tree' — better than a stale default."
- `build.startedAt` (:24) is captured at module load = backend process start; with `uptimeSeconds` (:28) it reliably confirms *that a restart happened*, not *which code* is running.
- Test anchor — `backend/test/integration/auth-and-crud.test.js:130-134`: asserts `res.body.build.commit === process.env.API_COMMIT || null` (:133), i.e. it enshrines null-when-unset; option (a) would have to extend this test and set the env in the test stack too.

### Option assessment (lead lean: (b) doc-only)

- **(a) pass API_COMMIT**: needs Dockerfile `ARG API_COMMIT` + `ENV`, compose `build.args` + `environment` plumbing (build args don't reach runtime env by themselves), an update-step command substitution (`git rev-parse --short HEAD`) that admins must not forget, `.env`/compose changes, and test extension. That is 4+ files of build plumbing for a deployment model where **the checkout itself is the release** (`git pull` + local rebuild, doc :78-80). Not trivial, and the operational gap it closes is already closed by `git log -1 --oneline` in the checkout — the only way code changes on a self-host is a git operation in that checkout.
- **(b) doc-only**: state that `git log -1 --oneline` in the checkout identifies the release, and `build.startedAt` (plus `"db":"connected"`) confirms the restart/health. Zero code risk, matches the card's minimum, honest about what `build` actually carries.

**Decision: (b).** No real operational gap remains: release identity lives in git, restart evidence lives in `startedAt`. `build.version`/`commit` stay as-is (null commit is deliberate per health.js:18-19). Justification recorded in plan.

## 2. Fix (2): «Як оновитися» has no rollback path

Current section `docs/self-host.md:76-115`: step 1 backup + verify (:82-92), step 2 `git pull` (:94-98), step 3 `docker compose up -d --build` (:100-107), step 4 health + volume note (:109-113). Nothing tells an admin what to do when the update fails.

### Restore mechanics (verified)

- `docker-compose.restore.yml:7-11` header command (exact):

  ```
  docker compose -p <project> \
    -f docker-compose.yml [-f docker-compose.scratch.yml] \
    -f docker-compose.restore.yml \
    run --rm --entrypoint node -e BACKUP_DIR=/backups \
    -v "$PWD/backup/out:/backups" backup restore.mjs <name> [--yes]
  ```

  For the **live** stack: drop `-p <project>` (default project) and the scratch overlay. The file exists because the nightly backup mounts content volumes read-only; restore needs write (:3-5, mounts :19-23).
- `backup/restore.mjs:6-7` — no `--yes` = dry run (default), `--yes` = do it. :9-14 — restore is destructive: drops every table the dump's `--clean --if-exists` statements cover; idempotent. :50-57 — refuses a backup without the `verified` marker **even in dry run**; step 1 of the update procedure already writes that marker (`node scripts/lib/verify-backup.mjs`, doc :86-90).
- Default backup location on the live stack: `docker-compose.yml:133` — `${BACKUP_DIR:-./backup/out}:/backups`; step 1 (`docker compose run --rm -e BACKUP_RUN_ONCE=1 backup`, doc :85) lands backups in `backup/out/<timestamped-dir>`.
- `--entrypoint node` is required because the backup image's entrypoint is `backup.mjs` (`docs/backup-restore.md:88-90`).

### Forward-only migrations (verified)

- `backend/migrations.js:12-13` — "Applies every unapplied file … in filename order"; :48-61 tracks applied names in `schema_migrations` and only ever applies **unapplied** files. There is no down-runner anywhere.
- `backend/migrations/011_drop_is_published.sql:4-8` — "THE POINT OF NO RETURN: take a `pg_dump` before deploying"; the down-migration is a manual SQL comment, not executable tooling.
- Consequence for rollback: after a failed update the database may already carry new migrations; checking out old code alone is not enough — the step-1 backup (pre-update schema **and** data, `schema_migrations` included in the dump) must be restored. The restore drops/recreates the dump's tables, so the applied-migrations set goes back with it and old code will not re-run new migrations.
- Data-loss warning owed to the admin: the step-1 backup predates the update; anything written after it (uploads, approvals, LTI registrations) is lost on restore. State this explicitly.

## 3. Overlap check — no in-flight conflict

- `.claude-shared` claims via `git ls-remote`: `claims/C4`, `claims/M1.2s` (ours), `claims/OPS1` (dropped task, branch kept as parts bin). ROADMAP:124 B1 = editor (Ed repo, W2), :154 C4 = editor (Ed). Neither touches virtual-lab.
- virtual-lab remote branches: `main`, ours, `M2.2-engine-tarball-checks` (0 commits ahead of main, empty diff — verified via `git log/diff origin/main...FETCH_HEAD`), `OPS1-deploy-pipeline` (unmerged parts bin), `plan/nocturne-redesign`. Nothing in flight on `docs/self-host.md`.
- **M1.2r** (ROADMAP:80, ⬜, next task, same file) will add `COMPOSE_FILE` overlay guidance. Scope discipline: M1.2s touches only the :72-74 identity paragraph and adds a rollback subsection inside «Як оновитися». Rollback's rebuild command stays plain `docker compose up -d --build` (COMPOSE_FILE-neutral, same form as step 3 today); the restore command's explicit `-f` flags are a one-shot `run` of the `backup` service — it recreates nothing, so it cannot drop an HTTPS/editor overlay and does not prejudge M1.2r's guidance.

## 4. Verification means (measured)

- Backend unit suite, no Docker: `backend/package.json:9` — `"test:unit": "node --test \"test/unit/*.test.js\""`. Ran in the W3 worktree: **308 tests, 308 pass, 0 fail, 0 skipped** (5.2 s). Note: plain `npm test` (:8) runs unit **and integration**; integration needs `docker-compose.test.yml` up — the card's "npm test, 308 expected, no Docker" actually maps to `npm run test:unit`. Plan uses `test:unit`.
- Option (b) = doc-only: no code changes, no Docker gates needed. Doc accuracy is checked by cross-reading every command/flag against `docker-compose.restore.yml`, `restore.mjs`, `health.js` (adversarial review phase).

## 5. Practice side-check (workspace root, read-only)

`python -I practice/tools/build_daily.py 2026-11-20` raw output:

```
E:\Projects\WebstormProjects\WebEngine\practice\zvit\Звіт_2026-11-20.docx  (задач: 0, злиттів: 2, рисунків: 0; самоперевірка тексту: пройдено)
```

hr5's two Nov-20 merges **do** surface (злиттів: 2), but tasks = 0. Per instructions: captured, not fixed — lead decision whether 0 tasks is expected (hr5 rows may be counted under their claim date).

## 6. Date convention

Claim executed 2026-11-20 (`wk.sh claim` stamped `🟡 W3 2026-11-20` in ROADMAP:81). hr5 used its claim date (2026-11-19) in the ✅ row. Consistent rule: **row date = claim date → `✅ 2026-11-20 W3`**. Practice bundle date 2026-11-20 (collect.py --date 2026-11-20, build_daily 2026-11-20).
