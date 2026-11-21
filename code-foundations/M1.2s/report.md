# M1.2s — honest health-build identity + rollback procedure: task report (W3, 2026-11-20)

Task: M1.2s — Claude review of M1.2 (2026-11-19), two small doc fixes in
`docs/self-host.md` (ROADMAP M1, ¼ h): (1) the doc claimed `/api/health` →
`build` identifies the running release — it cannot; (2) «Як оновитися» had
no rollback path for a failed update.

Branch `M1.2s-health-doc-rollback` in virtual-lab + .claude-shared.
Worktrees: `.workers/W3/virtual-lab` (main `0bcb578`),
`.workers/W3/.claude-shared`. Research `research.md`, plan `plan.md`,
build log `notes.md`. **Doc-only: no backend/Dockerfile/compose/test changes.**

## Decision — option (b), doc-only (why not (a))

The card offered (a) plumb `API_COMMIT` through the build, or (b) correct the
doc. **(b)**, because (a) is not trivial and closes no real gap:

- (a) needs Dockerfile `ARG`+`ENV`, compose `build.args` **and** runtime-env
  plumbing (build args don't reach runtime env), an update-step
  `git rev-parse --short HEAD` substitution admins must not forget, and a
  test extension (`auth-and-crud.test.js:133` enshrines null-when-unset) —
  4+ files of build plumbing.
- The deployment model has no gap to close: **the checkout is the release**
  (no tags; `git pull` + local rebuild). The only way code changes on a
  self-host is a git operation in that checkout, so `git log -1 --oneline`
  there is the authoritative release identity; `build.startedAt` confirms
  the restart. Null commit is deliberate per the `health.js` header comment
  ("the honest answer for 'built from a working tree'").

## Verified facts (file:line, at HEAD `0bcb578`)

- `backend/routes/health.js:21-25` — `version: require('../package.json').version`,
  `commit: process.env.API_COMMIT || null`, `startedAt: new Date().toISOString()`
  at module load (= process start).
- `backend/package.json:3` — `"version": "1.0.0"`, fixed literal.
- `API_COMMIT` set nowhere: repo-wide grep matches only `health.js` and the
  integration test; `backend/Dockerfile` has one ENV (`NODE_ENV`), compose
  passes no such env. `build.commit` is always `null` in real deployments.
- `docker-compose.restore.yml:7-11` — header restore command; read in the
  worktree, **matches research verbatim**. Live-stack adaptation: drop
  `-p <project>` and the scratch overlay.
- `backup/restore.mjs:6-7` — dry run is the default, `--yes` executes;
  `:9-11` destructive + idempotent (`--clean --if-exists`); `:47-56` refuses
  a backup without the `verified` marker even in dry run.
- `docker-compose.yml:133` — `${BACKUP_DIR:-./backup/out}:/backups`.
- `backend/migrations.js:12-13,48-61` — forward-only; no down-runner.
  `migrations/011_drop_is_published.sql:4-8` — "THE POINT OF NO RETURN".

Full per-flag cross-check table: `notes.md`.

## What landed

- **virtual-lab `281d860`** — `docs/self-host.md` only, +53/−2:
  1. Identity paragraph (old :72-74): release identity = `git log -1 --oneline`
     in the checkout; `/api/health` kept for liveness (`"db":"connected"`) and
     restart evidence (`build.startedAt`); `version`/`commit` limitation stated
     honestly; engine `?diag=1` parenthetical kept. No `API_COMMIT` plumbing.
  2. New `### Якщо оновлення не вдалося` inside «Оновлення» (after step 4's
     selfhost-check line, before «Що нового»): forward-only warning first;
     `git checkout <попередній-коміт>` (note the pre-pull commit); plain
     `docker compose up -d --build` (COMPOSE_FILE-neutral — M1.2r layers
     overlay guidance later); live-stack restore of the step-1 backup —
     dry run first, then `--yes`; destructive/idempotent and data-loss
     warnings; `verified` gate, `--entrypoint node`, `BACKUP_DIR` mount note;
     closes with health + catalog re-check and `docs/backup-restore.md` pointer.
- **shared (this commit)** — this report + `notes.md`; ROADMAP:81 →
  `✅ 2026-11-20 W3` (date = claim date, per plan §date convention);
  cross-project CHANGELOG entry under virtual-lab `### 2026-11-20`.

## Verification

- **Unit sanity, no Docker** — `npm run test:unit` in the worktree backend:
  **tests 308, pass 308, fail 0, skipped 0** (duration_ms 4832.4). Matches
  research measurement. (Plain `npm test` includes integration and needs the
  test DB — `test:unit` is the card's "308, no Docker".)
- **Doc-claim cross-check** — every command/flag in the new text read against
  `docker-compose.restore.yml` header, `restore.mjs` arg parsing/gates,
  `docker-compose.yml` backup mount, `health.js` (table in `notes.md`).
  Restore header identical to research — no invented commands.
- **Scope** — `git diff --stat`: one file. Steps 1-4, «Що нового»,
  HTTPS/editor sections untouched; no `COMPOSE_FILE` mention introduced.
- Practice bundle: `practice/tasks/2026-11-20/M1.2s/` (collect.py), daily
  rebuilds 2026-11-20 (1 task, 2 merges) and 2026-11-19 (4 tasks, 6 merges,
  unchanged) — outputs in the bundle's evidence.

## Review verdict

Adversarial doc-accuracy review **PASS** — R1–R7 and A1–A4 all PASS; the
restore command token-verified against the `docker-compose.restore.yml`
header. One note adopted: detached-HEAD clause added to the update step
(`df7106c`). Post-merge verification V1–V5 PASS (unit 308/308 re-run in the
primary worktree, doc truth verified, ROADMAP line ✅).

## Commits

- virtual-lab: `281d860` pushed `0bcb578..281d860 → origin/M1.2s-health-doc-rollback`.
- .claude-shared: this commit, explicit paths (ROADMAP.md, CHANGELOG.md,
  code-foundations/M1.2s/{notes,report}.md), pushed same branch.