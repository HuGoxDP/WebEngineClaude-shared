# M1.2s build notes — W3, 2026-11-20

Doc-only task, option (b) per plan. Worktrees: `.workers/W3/virtual-lab`
(main `0bcb578`), `.workers/W3/.claude-shared` (`22cbf67`). Branch
`M1.2s-health-doc-rollback` in both.

## P1 — doc edits (`docs/self-host.md`, one file, +53/−2)

### Edit 1 — identity paragraph (old :72-74)

Before:

```
Реліз платформи — це стан гілки `main`; тегів версій у репозиторії немає.
Яка саме збірка у вас працює, показує `GET /api/health` → `build` (рушій —
окремо: штамп збірки у переглядачі під `?diag=1`).
```

After (first line kept, rest rewritten):

```
Реліз платформи — це стан гілки `main`; тегів версій у репозиторії немає.
Який саме реліз у вас працює, показує `git log -1 --oneline` у чекауті: стек
збирається саме з нього. `GET /api/health` підтверджує, що API живий
(`"db":"connected"`), а `build.startedAt` — час старту процесу: за ним видно,
що перебудова справді перезапустила backend. Поля `build.version` і
`build.commit` реліз не ідентифікують: `version` — фіксована `1.0.0` з
`package.json`, `commit` — `null`, якщо образ не зібрано зі змінною
`API_COMMIT` (за замовчуванням її ніхто не задає). Рушій — окремо: штамп
збірки у переглядачі під `?diag=1`.
```

### Edit 2 — new `### Якщо оновлення не вдалося`

Inserted after the selfhost-check line of «Як оновитися» (old :115), before
«Що нового». Structure per plan: forward-only warning first, then
(i) `git checkout <попередній-коміт>` (note the pre-pull `git log -1 --oneline`
output), (ii) plain `docker compose up -d --build` (COMPOSE_FILE-neutral),
(iii) live-stack restore of the step-1 backup — dry run first, then `--yes`.
Destructive/idempotent + data-loss warnings explicit; `verified`-marker gate,
`--entrypoint node` rationale, `BACKUP_DIR` mount note, pointer to
`docs/backup-restore.md`; closes with health + catalog re-check.

Restore command as written:

```bash
docker compose -f docker-compose.yml -f docker-compose.restore.yml \
  run --rm --entrypoint node -e BACKUP_DIR=/backups \
  -v "$PWD/backup/out:/backups" backup restore.mjs <каталог-бекапу-кроку-1>
```

## Command cross-check (every flag against the files at HEAD `0bcb578`)

| Doc claim | Source | Verified |
|---|---|---|
| header command shape | `docker-compose.restore.yml:7-11` — read in worktree, **matches research verbatim** | ✅ |
| live-stack adaptation: drop `-p <project>` + scratch overlay | research §2 ("For the live stack: drop `-p` … and the scratch overlay") | ✅ |
| restore overlay gives write mounts | `docker-compose.restore.yml:3-5` (header), `:19-23` (rw volume entries) | ✅ |
| dry run default, `--yes` executes | `backup/restore.mjs:6-7` usage header; `:33` `const yes = args.includes("--yes")` | ✅ |
| destructive + idempotent (`--clean --if-exists`) | `restore.mjs:9-11` header | ✅ |
| `verified` marker required even in dry run | `restore.mjs:47-56` (gate before anything is read/spawned) | ✅ |
| `--entrypoint node` (image entrypoint is backup.mjs) | `docs/backup-restore.md:88-90` per research §2 | ✅ (research-cited) |
| default backup path `./backup/out` | `docker-compose.yml` backup service `- ${BACKUP_DIR:-./backup/out}:/backups` (read at :133) | ✅ |
| `BACKUP_DIR` override → mount that dir instead | same compose line, `${BACKUP_DIR:-…}` | ✅ |
| `build.version` fixed `1.0.0` | `backend/package.json:3`; `health.js` `version: require('../package.json').version` | ✅ |
| `build.commit` null unless `API_COMMIT` | `backend/routes/health.js` `commit: process.env.API_COMMIT \|\| null`; nothing sets it (research §1 repo-wide grep; Dockerfile/compose carry no such env) | ✅ |
| null is deliberate | `health.js` header comment "the honest answer for 'built from a working tree'" (read in worktree) | ✅ |
| `startedAt` = process start, restart evidence | `health.js` `startedAt: new Date().toISOString()` at module load; `uptimeSeconds` from `process.uptime()` | ✅ |
| forward-only migrations, 011 point of no return | `backend/migrations.js:12-13`, `:48-61`; `migrations/011_drop_is_published.sql:4-8` (research §2, verified at research time) | ✅ (research-cited) |

## Unit sanity (no Docker)

`npm run test:unit` in `.workers/W3/virtual-lab/backend`, raw tail:

```
ℹ tests 308
ℹ suites 0
ℹ pass 308
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 4832.3977
```

**308/308 pass, 0 fail** — matches research measurement (308/308, 5.2 s).
Doc change breaks nothing.

## Scope check

`git diff --stat` before commit: `docs/self-host.md | 55 +++…` — one file,
+53/−2. No backend/Dockerfile/compose/test changes. Steps 1-4, «Що нового»,
HTTPS/editor sections untouched (M1.2r territory). No `COMPOSE_FILE` mention
introduced; rebuild command stays plain `docker compose up -d --build`.

## Commits

- virtual-lab: `281d860` `docs(M1.2s): honest health-build identity + rollback
  procedure in self-host guide` (1 file, +53/−2), pushed
  `0bcb578..281d860 → origin/M1.2s-health-doc-rollback`.
- .claude-shared: see report.md (this commit).

## Worker metadata

`.workers/W3/state.json` `repos` still listed hr5's
`["WebEngineTS", ".claude-shared"]`; fixed to
`["virtual-lab", ".claude-shared"]` via direct JSON edit (`wk.sh state_set`
writes strings only, cannot express a list). Confirmed by re-read:
`['virtual-lab', '.claude-shared']`.