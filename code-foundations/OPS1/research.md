# Research: OPS1 — the autonomous deploy pipeline
**Date:** 2026-11-12 (Claude, architect lane)
**Base:** virtual-lab `main` `e4b0df7` · WebEngineTSEditor `master` `b615af1` · `.claude-shared` `main` `bba16d6`
**Feeds:** OPS1b (first contact with the server), then M1.2, P5b, R3 (and P1b through P5b).

## Why this task exists

The owner moved production deploys from himself to the workers (2026-11-12, `bba16d6`;
`~/.zcode/AGENTS.md` WebEngine → *Deploy*). The rules are fixed there and are binding here:
a deploy runs only through `wk.sh deploy`, only inside `deploy.lock` **and** `merge.lock`, only
outside teaching hours (Europe/Kyiv 21:00–07:00 on weekdays, any time at weekends), only from a
fresh `origin/<default>` whose full checks are green, only after a database backup the pipeline
reads back, and is followed by an e2e smoke against the live site; a red smoke rolls back to the
previous image tag and the backup, and the worker writes `HALT` + ATTENTION. Server access lives
only in the untracked `.workers/deploy.env`, which never reaches a commit, a log, a note or a report.

Nothing about the production server is recorded anywhere yet (ATTENTION 2026-11-12T21:30Z:
`known_hosts` has only github.com). So the pipeline has to be built and proven **without** the
server, and its first contact with the server has to be a separate, read-first step.

## Facts (with evidence)

- F-1 **How production is deployed today: by hand.** `virtual-lab/Readme.md:90-137` — copy the
  folder to the server "any way you like", `docker compose up --build -d`, check with `curl`. No
  image tags, no record of what runs, no rollback. Images are built on the host from the working tree.
- F-2 **The stack** (`docker-compose.yml`): `database` (`postgres:16-alpine`, healthcheck),
  `backend` (`build: ./backend`, healthcheck on `/api/health`), `frontend` (`build: .`,
  `Dockerfile.frontend`, `${FRONTEND_PORT}:80`, **no healthcheck**), `backup` (`build: ./backup`).
  Every service has a fixed `container_name` (`VirtualLabDatabase`, …) and every volume a fixed
  `name:` (`virtual_lab_pgdata`, `_archives`, `_assets`, `_lti`, `_previews`) — so the data
  survives any project directory, but **two projects cannot run the same file set side by side**
  (container-name clash). `docker-compose.scratch.yml` renames both (Scratch*, `scratch_*`,
  TLS port `${SCRATCH_FRONTEND_PORT:-3998}`), which is what makes a parallel local stack possible.
- F-3 **Bind mounts that must exist next to the compose files at run time:** `./db/init.sql`
  (database), `${BACKUP_DIR:-./backup/out}` (backup), and with the editor override
  `./nginx/editor.conf`, `./nginx/csp-editor.conf` (frontend). Everything else is baked into images.
- F-4 **A latent P5a defect: `BACKUP_DIR` means two different things.** `docker-compose.yml:127`
  passes `BACKUP_DIR: ${BACKUP_DIR:-/backups}` into the container (the path `backup.mjs:33` writes
  to) and `:133` mounts `${BACKUP_DIR:-./backup/out}:/backups` (the host source). With the default
  both work; the moment a host sets `BACKUP_DIR=/srv/…` in `.env` (exactly what P5b's off-host
  target needs), the container writes to `/srv/…` *inside itself*, which is not mounted, and every
  backup disappears with the container. Every documented run passes `-e BACKUP_DIR=/backups -v …`
  by hand (`docs/backup-restore.md:65,84`), which is why it never showed. The pipeline needs a
  host backup directory, so OPS1 fixes it (Plan, Phase 2: a separate `BACKUP_HOST_DIR`).
- F-5 **Backups** (`backup/backup.mjs`, P5a): one timestamped directory per run with `db.sql.gz`
  (plain `pg_dump --clean --if-exists --no-owner --no-privileges`, gzipped), `volumes/<name>.tar.gz`
  for archives/assets/previews/lti, `manifest.json`; `BACKUP_RUN_ONCE=1` runs once and exits
  (`backup.mjs:121`). `restore.mjs` restores the dump **and** untars every volume over the live one
  (`restore.mjs:94-104`) — right for disaster recovery, wrong for a rollback (see D-10).
- F-6 **Migrations** run at backend start-up, forward only: `backend/migrations.js` applies every
  file of `backend/migrations/` (001–013 today) not yet in `schema_migrations`
  (`migrations.js:42-61`), under an advisory lock. There is no down-migration. So an old backend
  image on a database a newer image migrated may fail — the rollback has to know whether the
  deploy migrated.
- F-7 **The API reports its own commit**: `GET /api/health` → `{status, db, build: {version,
  commit, startedAt, uptimeSeconds}}`, `commit = process.env.API_COMMIT || null`
  (`backend/routes/health.js:21-25`). Nothing sets `API_COMMIT` today — the smoke can prove *which*
  release answers once the release compose sets it.
- F-8 **Images and their inputs.** Frontend: `npm install` fetches the engine from the GitHub
  Release URL (`frontend/package.json:39`, A10), builds Angular, bakes a **self-signed** TLS cert
  into `/etc/nginx/tls` (`Dockerfile.frontend`; production mounts its own over it — P5b).
  Editor (`WebEngineTSEditor/Dockerfile`): builds from `app/` with the committed
  `app/WebEngineTS-0.1.0.tgz`, serves under `/editor/`; `docker-compose.editor.yml` builds it
  from `context: ../../WebEngineTSEditor` — a path that is right for the owner's old
  `testv/virtual-lab` layout and **wrong in every worker worktree** (`.workers/W<n>/virtual-lab` →
  `.workers/WebEngineTSEditor`, which does not exist). The pipeline must build the editor image
  from an explicit directory, not through that context.
- F-9 **The e2e suite is not production-safe as it stands** (`e2e/README.md`): `global-setup.ts`
  requires `ADMIN_TOKEN` and a populated catalog; specs publish, upload and delete `e2e-` rows;
  `ktx2.spec.ts` publishes a bench scene. It takes `E2E_BASE_URL`. Reusable read-only pieces:
  `helpers/engine.ts` (`playerFrame(page)`, evaluates in the player iframe, `renderStats.drawCalls`),
  `engine-url.spec.ts` (the `/engine/<version>/` immutable path), `csp.spec.ts`,
  `compression.spec.ts`, `editor-csp.spec.ts` (skips without `/editor/`).
- F-10 **`wk.sh`** (unversioned, `.workers/wk.sh`): `lock <name>` accepts any name, so
  `deploy.lock` needs no change to the lock code; `unlock` refuses a lock that is not the caller's
  (exit 3); `note` appends to ATTENTION; stale = heartbeat older than 45 min. `eligible.py` (also
  unversioned) hides `OPS1` and every row whose Depends names `OPS1` while `deploy.env` is absent
  (added 2026-11-12T21:30Z).
- F-11 **Billing rules close the usual answers.** A registry on GitHub (GHCR) is GitHub Packages —
  metered, forbidden (*Git hygiene*, owner 2026-11-12). Docker Hub or any other registry means a
  new account (an owner action). GitHub Actions are off. So images cannot travel through a registry.
- F-12 **Local Docker is shared.** The worker machine runs the owner's own local stack on 8044
  (`VirtualLabFrontend`, ATTENTION 2026-11-12T06:50Z) and the workers' test stacks; any
  `docker compose` of virtual-lab and the lab ports 8044/8045 belong inside `vl-db.lock`.

## Decisions (binding for the plan)

- **D-1 Where the code lives.** The pipeline is versioned code in **virtual-lab `ops/deploy/`**
  (plain Node ≥ 20 ESM `.mjs`, no new dependency, tests with `node --test`), reviewed and merged like
  any other change. `.workers/wk.sh` gets only a thin wrapper (HALT, `deploy.env` present, locks,
  exit codes → HALT/ATTENTION) whose text the plan gives verbatim — `.workers/` is not a repo and
  every worker depends on `wk.sh`, so no logic lives there.
- **D-2 How images travel: built on the worker, shipped over SSH.** `docker build` on the worker
  machine, `docker save <images> | gzip | ssh … 'gunzip | docker load'`. No registry (F-11), the
  server needs neither git, repo access nor npm, and the bytes that pass the local preflight are the
  bytes that run. An image whose ID the server already has is not sent again. The server pulls only
  `postgres:16-alpine` (public) when missing. The server's CPU architecture must match the
  worker's (`uname -m` in `inspect`); a mismatch refuses (cross-building is not in scope).
- **D-3 What a release is.** Tag = the source commit's first 12 hex. Images:
  `virtual-lab/backend|frontend|backup:<vl12>`, `webengine-editor/editor:<ed12>` (editor only when
  enabled). A **release record** `{id, vl, ed|null, composeFiles, images: {name: imageId},
  builtAt, deployedAt}` — the id is `<vl12>` or `<vl12>-ed<ed12>`. The server keeps
  `DEPLOY_PATH/releases/<id>/` (the compose bundle, D-4), `DEPLOY_PATH/shared/.env` (secrets,
  never transferred), `DEPLOY_PATH/backups/` (until P5b moves it off-host),
  `DEPLOY_PATH/state.json` (`current`, `previous`, `history` of the last 10 records). A deploy
  always deploys the **whole stack**: `deploy platform` takes a new virtual-lab commit and keeps the
  current editor tag; `deploy editor` takes a new editor commit (and enables the editor files).
- **D-4 The compose bundle.** Exactly the files compose reads at run time: `docker-compose.yml`,
  `ops/deploy/compose.release.yml` (image names + `pull_policy: never` + `API_COMMIT`), the
  restore override, `db/init.sql`, and — when the editor is enabled —
  `docker-compose.editor.yml`, `ops/deploy/compose.release-editor.yml`, `nginx/editor.conf`,
  `nginx/csp-editor.conf`; plus any repo compose file the server's `shared/deploy.json`
  `extraComposeFiles` lists (P5b adds HTTPS/production there). The list is computed and checked
  against `docker compose config --format json` (every bind source inside the repo is in the
  bundle). `releases/<id>/.env` is a symlink to `../../shared/.env`. Compose always runs with
  `--project-name` from `shared/deploy.json` (the adopted project's name, D-12) and `up -d
  --no-build`; never `down -v`, never `docker system prune`, never `--remove-orphans`.
- **D-5 Fresh source.** The pipeline refuses unless, for each source repo it builds from,
  `git fetch --prune` then `HEAD == origin/<default>` and `git status --porcelain` is empty. The
  only exception is `--rehearsal`, which is accepted only with the local transport (D-14).
- **D-6 The teaching-hours window** is a pure function of the instant, computed with
  `Intl.DateTimeFormat(…, { timeZone: "Europe/Kyiv" })` (DST included): Mon–Fri a deploy may
  **start** from 21:00 until 06:00 local (one hour of margin before 07:00 — the rehearsal measures
  deploy + rollback and the notes must show it fits); Saturday and Sunday any time, which joins
  Friday 21:00 to Monday 06:00. `inspect`, `status` and `--dry-run` are allowed at any time.
  No override flag.
- **D-7 Locks.** The wrapper takes `deploy`, `merge` and `vl-db` (the local preflight runs a
  virtual-lab compose stack, F-12), releases them in reverse on every exit path (`trap … EXIT`),
  and passes the lock directories to the pipeline, which rewrites their `heartbeat` at every step
  so a long deploy never looks stale.
- **D-8 Gates before production changes, in order:** HALT absent → window → fresh source →
  images built → **local preflight** (the very images, on a scratch project with scratch volumes,
  seeded with the release catalog, smoke-tested green) → server reachable and `inspect` clean
  (disk ≥ 3× the images to ship + 1 GB) → **verified backup** (D-9) → ship → up.
  The full repo checks are the deploy row's own Done-when (M1.2, P5b, R3), run before
  `wk.sh deploy`; the pipeline's preflight does not replace them.
- **D-9 "Read-back verified" means**, on the server, for the backup just taken by the *current*
  release's `backup` image (`BACKUP_RUN_ONCE=1`): `gzip -t` of every file; the dump ends with
  `-- PostgreSQL database dump complete`; the dump restores with `ON_ERROR_STOP=1` into a
  throwaway `postgres:16-alpine` container (`--network none`, tmpfs data, removed after); in it the
  table list equals the live table list and `schema_migrations` equals the live set; the
  `scenarios` row count equals the live count read just before the dump (one retry with a new
  backup on a mismatch, then refuse); `manifest.json` parses and lists every volume. Only a fresh
  install (no database container and no `virtual_lab_pgdata` volume) skips this, and the record says
  `backup: none (fresh install)`.
- **D-10 Rollback.** Triggered by any failure after `up` starts: a service not healthy within
  5 min (frontend has no healthcheck — "healthy" for it is a 200 on `/` through the published
  port), or a red smoke. It brings the **previous** release record up (`up -d --no-build`, images
  still on the server — the last three releases' images are never pruned) and restores the
  **database only, and only if the deploy migrated**: `schema_migrations` after ⊋ before. The DB
  restore is: stop `backend`, `DROP DATABASE … WITH (FORCE)` + `CREATE DATABASE` through the
  container's own superuser, load the pre-deploy `db.sql.gz` with `ON_ERROR_STOP=1`, start the
  previous backend. Content volumes are never restored on rollback: they are content-addressed and
  append-only (F-5), so a newer object is harmless and restoring them could only lose data. Then
  the smoke runs against the previous release. Exit codes: `10` rolled back (smoke of the previous
  release green), `11` rollback failed or its smoke red — both → wrapper writes HALT + ATTENTION.
- **D-11 The production smoke** is a separate Playwright config, `e2e/playwright.smoke.config.ts`
  with `testDir: ./smoke`, no `globalSetup`, no `ADMIN_TOKEN`, one worker, Chromium. Read-only:
  `/api/health` ok and `build.commit` equal to `SMOKE_EXPECT_COMMIT` when set; the catalog API and
  page list ≥ 1 scenario; the first (or `SMOKE_SCENARIO`) scenario plays in the player frame with
  `drawCalls > 0`; the engine bundle under `/engine/<version>/` is served `immutable`; the CSP
  header is present (and HSTS on https); with `SMOKE_EDITOR=1`, `/editor/` answers and carries its
  nonce. Every non-GET request a smoke page makes is recorded and asserted against an allow-list
  (the viewer's own telemetry, named in the notes); the smoke's user agent carries
  `VirtualLabSmoke` so those rows can be told apart.
- **D-12 First contact is its own row (OPS1b).** OPS1 builds and rehearses everything without
  the server. OPS1b, eligible once `deploy.env` exists, runs `inspect` (read-only: OS, `uname -m`,
  Docker and Compose versions, whether the SSH user may use Docker, free disk, running containers
  with their compose project/working-dir labels, the five named volumes, `DEPLOY_PATH` contents —
  never the content of any `.env`) and `prepare`: create `DEPLOY_PATH/{releases,shared,backups}`;
  **adopt** a hand-made deployment if one runs (copy its `.env` server-side into `shared/.env`
  with `cp -n` — never through the worker; `docker tag` its running images as
  `…:adopted-<date>`; write an `adopted` release record with its compose files; keep its project
  name); on a fresh host, generate `shared/.env` on the server from `.env.example` with random
  `DB_PASSWORD`/`ADMIN_TOKEN` (`openssl rand`, never printed). Without either `.env` (adoption
  ambiguous) → park with ATTENTION.
- **D-13 Secrets.** `deploy.env` keys: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KEY` (path to the
  private key), `DEPLOY_DOMAIN`, `DEPLOY_PATH`; optional `DEPLOY_PORT` (22), `DEPLOY_HOSTKEY` (a
  `known_hosts` line). Every line the pipeline prints or logs goes through `redact()`, which
  replaces each of those values (and the key file's basename) with `<DEPLOY_HOST>` etc. — child
  process output (ssh, docker, Playwright) included. Logs go to `.workers/W<n>/deploy-logs/` (not a
  repo). The pipeline never reads, prints or transfers the server's `.env`. Remote scripts take
  values only as positional arguments quoted by one tested `shq()`; nothing is interpolated into a
  script body. SSH runs with `BatchMode=yes`, `IdentitiesOnly=yes`, `StrictHostKeyChecking=yes`
  and `UserKnownHostsFile=.workers/deploy.known_hosts`; a host key is trusted from
  `DEPLOY_HOSTKEY`, or once by `inspect --trust-new-host` (TOFU: the fingerprint goes to ATTENTION).
- **D-14 Two transports, one pipeline.** `ssh` (production) and `local` (runs the same remote
  scripts with `bash -s` on this machine, `DEPLOY_PATH` a temp directory, project
  `vlrehearsal`, the scratch override added for names/volumes, `FRONTEND_PORT` 8047). Only
  `--transport local` accepts `--rehearsal` (unpushed commits allowed, for the induced-migration
  case). `wk.sh deploy` always uses `ssh`.
- **D-15 What OPS1 does not do:** the production certificate and HTTPS ports, the off-host backup
  target and a restore on production (P5b); the first production deploy (M1.2); the editor's first
  deploy (R3); LTI (P1b); cross-architecture builds; any change to the student-facing app.

## Risks

- The worker machine's upload bandwidth: three images ≈ 250–400 MB raw per platform deploy
  (gzip ≈ ⅓). Shipping only changed image IDs keeps a frontend-only change to one image. The
  rehearsal records the sizes; if a deploy cannot fit the window, that is an ATTENTION finding.
- Windows tooling: Git Bash `ssh`, Node `child_process` piping across `docker save` → gzip → ssh.
  The plan pins this with a local-transport rehearsal; the ssh argv itself is unit-tested and its
  first real use is OPS1b.
- Adoption is the riskiest moment and the least known (what runs there today is unknown): it is
  isolated in OPS1b, read first, and parks on anything ambiguous.
