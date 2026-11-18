# HO1 — self-host kit: research (W3, 2026-11-17)

Row: `HO1` (M1, ⬜ → claimed 🟡 W3 2026-11-17). Branch `HO1-self-host-kit` in
`virtual-lab` and `.claude-shared`. Repos: **P, S**. Size 1 d. Depends A10 ✅, P5a ✅.

Owner decision (2026-11-17, `dda384a` on origin/main): there is no production
access — the university downloads the repo, builds it with Docker and runs it on
its own server. The OPS1 deploy pipeline is dropped; its unmerged branch is a
parts bin. HO1 replaces it.

## What the row asks for

1. From a clean clone: `.env.example` → `docker compose up -d --build` gives a
   working platform.
2. `docs/self-host.md` **in Ukrainian** for the university's admins: requirements,
   install, update (= pull + rebuild), backup/restore → `docs/backup-restore.md`,
   HTTPS → `docker-compose.https.yml`, editor → `docker-compose.editor.yml`.
3. `npm run selfhost-check`: clones a fresh `origin/main` into a temp dir, builds
   it, starts it on **spare ports** inside **`vl-db.lock`**, runs the **e2e smoke**
   against it, tears it down.
Reuse what fits from `OPS1-deploy-pipeline` (backup verification, wait-healthy,
the rehearsal's restore). No ssh, no deploy.lock, no time window.

## What is already there (origin/main)

- `docker-compose.yml`: database (postgres:16-alpine) + backend + frontend
  (nginx, built by `Dockerfile.frontend`) + backup (P5a). `env_file: .env` in all
  four; volumes **explicitly named** (`virtual_lab_pgdata`, …); containers pinned
  (`VirtualLab*`).
- `docker-compose.https.yml` (TLS on `${HTTPS_PORT:-8443}:443`, self-signed cert
  built into the image), `docker-compose.editor.yml` (builds the editor from the
  **sibling** checkout `../../WebEngineTSEditor` — optional, R3's row),
  `docker-compose.scratch.yml` (renamed volumes/containers, TLS port 3998).
- `.env.example` (6.8 kB, already Ukrainian), `docs/backup-restore.md` (P5a's
  proven restore procedure), `backup/` (backup.mjs, retention.mjs, restore.mjs).
- The engine bundle is served from `/engine/0.2.0/…` by nginx: `angular.json`
  copies `node_modules/WebEngineTS/dist/WebEngineTS.standalone.js` into
  `/engine/0.2.0/` at build time, and `Dockerfile.frontend` fetches the engine as
  a GitHub Release **tarball** (A10). So a clean build serves the engine — no
  import step needed.
- `e2e/`: Playwright suite, `E2E_BASE_URL` (default `http://localhost:8044`),
  `global-setup.ts` **refuses an empty catalog** (`total === 0` → "publish a
  release first"). README: "this repo deliberately stores none [scenario
  content]" — the suite is a pre-release gate, not a fresh-install gate.
- No root `package.json` → `npm run selfhost-check` has to be added.

## Findings / decisions (each with its evidence)

**D1. A clean clone cannot start without the `.env` copy.** Verified in a temp
dir with only `docker-compose.yml`: `docker compose config` answers
`env file …\.env not found` (and blank-variable warnings for everything else).
So install = `cp .env.example .env`, then `up -d --build`. The kit's docs say
exactly that, and the check does exactly that.

**D2. The check must not share names with a running stack.** Volumes are
explicitly named and containers are pinned: a second project under different
`-p` would collide on both (`container name VirtualLabDatabase already in use`),
and its `down -v` would **delete the live stack's data**. So the check runs the
clone with an override that renames volumes and containers — the same pattern as
`docker-compose.scratch.yml` (P5a's exercise) and the OPS1 rehearsal
(`compose.rehearsal.yml`), both recorded as "never touches the live stack".

**D3. Ports: spare and configurable.** The live lab stack owns 8044/8045
(project rule), the editor-csp harness 8046, the OPS1 rehearsal 8047/8049, the
scratch TLS 3998. The check takes `SELFHOST_FRONTEND_PORT` (default **8051**,
currently free — checked), refuses if it cannot bind it, and never touches the
lab ports.

**D4. The e2e smoke must be fresh-install-safe.** The full suite's
`global-setup.ts` gate (`total === 0`) and its specs (they open real scenarios)
cannot run against a fresh install — and the repo stores no scenario content on
purpose. So the smoke is a **new, additive** spec set: its own
`playwright.smoke.config.ts` + `smoke-setup.ts` (health-only gate) +
`tests/smoke.spec.ts`, run through a new `npm run smoke` in `e2e/package.json`.
Nothing existing is changed, weakened or re-gated. The smoke is read-only.
What it asserts (all reachable on a fresh install):
  1. `GET /api/health` → 200, `db: connected`, a `build.version`;
  2. the page boots: `GET /` serves `<app-root>`, `page.goto` raises **no**
     console error / page error (an Angular boot + CSP pass);
  3. `GET /engine/0.2.0/WebEngineTS.standalone.js` → 200, platform CSP
     (`default-src 'self'`), `nosniff`, immutable cache (the frame's contract);
  4. `GET /player/player.html` → 200, the "only runs inside the viewer" guard;
  5. `GET /api/catalog` → 200 JSON with a numeric `total` (0 is expected);
  6. `POST /api/keys` without a credential → **401** (`auth.js`: "Потрібна
     авторизація");
  7. with `ADMIN_TOKEN` (the check generates one): `GET /api/keys` → 200 — the
     bootstrap moderator works on a fresh install. **Skipped with a reason when
     ADMIN_TOKEN is unset**, the same pattern `streaming.spec.ts` and
     `editor-csp.spec.ts` already use.

**D5. Clone source: the local checkout by default.** The row says "a fresh
`origin/main`". The check defaults to cloning the checkout it runs in
(`git clone --depth 1 --branch main <repo dir>` → the default branch as this
checkout sees it), prints the sha it cloned, and takes `--remote` to clone the
origin URL instead. Reason: this machine's DNS is flaky (github.com was
unreachable for part of 2026-11-16 and intermittently since), and the point of
the check is the *committed state* of the default branch, not the network. A
worker runs `git fetch` before it (step 2 of the run loop), so the local `main`
is origin/main.

**D6. Reuse from the parts bin.** `ops/deploy/` is not carried across (it is a
deploy pipeline; the deploy rows are gone). What is reused as code:
  - wait-healthy (poll the student's port and `/api/health`, bounded timeout,
    print every check);
  - the D-9 backup verification (the read-back that makes a backup a backup:
    `gzip -t`, table count, valid manifest, readable volume archives, and the
    `verified` marker an unverified dump never gets) — as a Node module
    `scripts/lib/verify-backup.mjs` with the same checks over a fixture;
  - the rehearsal's discipline (recorded in the phase-5 notes): rename every
    container/volume/project, ports of its own, `restart: unless-stopped` brings
    a torn-down project back (so teardown disables the policy first — the 2026-11-16
    Docker-restart lesson), and the bring-back's unhealthy container is a
    machine symptom to report, not a kit defect.
  The rehearsal's *restore* stays where it is proven: `docs/backup-restore.md`
  (P5a) which the new doc points to; a full restore inside the check is P5b's
  (`selfhost-check --https` and the restored backup are that row's).

**D7. The check also proves the backup path once.** One `docker compose run --rm
-e BACKUP_RUN_ONCE=1 backup` into a temp dir, then the D-9 verification of what
it wrote. Cheap (~30 s), and it proves the nightly job works out of the box —
the failure mode P5a exists for. A full destroy/restore cycle is out of scope
(D6).

**D8. `vl-db.lock` is the caller's job, and the check says so.** The check takes
`--lock <dir>` and refuses to start without it (the same contract
`wk.sh lock vl-db` provides), so a stray run cannot fight the lab stack. `npm
run selfhost-check` alone does not take it — the docs and the task README row say
`bash .workers/wk.sh lock vl-db W<n> HO1` first.

**D9. Ukrainian docs match the register already in the repo.** `.env.example`,
the compose file headers and the backend's 401 answers are Ukrainian; the e2e
config pins `uk-UA`. `docs/self-host.md` is written in that register, addressed
to the university's admins (not to developers), and keeps the platform's own
naming (`/editor/`, `backup/out`, `docker-compose.https.yml`).

**D10. Local scratch hygiene.** `.code-foundations/` is not ignored in
virtual-lab (the OPS1 phase-5 note sits untracked in the worktree), and
`e2e/smoke-results/` (OPS1's smoke output) is untracked too. The smoke writes
nothing new (Playwright's own `test-results/` is already ignored); the two
existing untracked paths go into the shared `.git/info/exclude` at report time
so the junk check is honest, and that is recorded in the report.

## Plan phases

1. **Phase 1 — the check driver + its tests** (`package.json`,
   `scripts/selfhost-check.mjs`, `scripts/lib/verify-backup.mjs`,
   `scripts/test/*.test.mjs`, `docker-compose.selfcheck.yml`). Standard gate,
   adversarial subagent review at the end.
2. **Phase 2 — the e2e smoke** (`e2e/playwright.smoke.config.ts`,
   `e2e/smoke-setup.ts`, `e2e/tests/smoke.spec.ts`, `e2e/package.json`,
   `e2e/README.md` — no, README goes to phase 4 per the docs rule).
   Depends on 1 (the check runs it).
3. **Phase 3 — the check, live** (run it under `vl-db.lock` on the branch; fix
   what it finds; this is the Debug phase's main gate).
4. **Phase 4 — docs + report** (`docs/self-host.md`, `Readme.md` link,
   `e2e/README.md` smoke paragraph, CHANGELOG, ROADMAP, `.claude-shared`
   code-foundations/HO1/ copies). Minimal gate.