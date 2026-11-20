# M1.2r research — plain `docker compose` update commands silently drop the HTTPS/editor overlays

Date 2026-11-20, W3. Source: ROADMAP:80 (P; ¼ h; Claude review of M1.2, 2026-11-19).
virtual-lab worktree HEAD `ea95355` (fresh `origin/main`, includes merged M1.2s), shared
worktree claim base fresh `origin/main` (`3f8eed2`). Claim: `claims/M1.2r` = `c5ebfa4`,
branch `M1.2r-compose-file-overlays` in both repos. All line numbers verified against those HEADs.

## 1. The defect, confirmed in the current doc

`docs/self-host.md` («Як оновитися», :82-121):

- Step 1 backup (:91): `docker compose run --rm -e BACKUP_RUN_ONCE=1 backup` — plain form.
- Step 3 rebuild (:109): `docker compose up -d --build` — plain form.
- M1.2s rollback subsection «Якщо оновлення не вдалося» (:123-170), step 2 (:145):
  `docker compose up -d --build` — same plain form (M1.2s plan deliberately kept it
  "COMPOSE_FILE-neutral — M1.2r layers overlay guidance later").
- «Логи, зупинка, скидання» (:377-383): `logs -f`, `stop`, `down`, `down -v` — all plain.
- The only explicit `-f` pair in the update area is the restore command (:156-158):
  `docker compose -f docker-compose.yml -f docker-compose.restore.yml run …` — correct
  as-is (explicit `-f` replaces any `COMPOSE_FILE`, so the restore pair is unaffected by
  the fix and must stay).

Overlay facts (card's :19/:23 verified):

- `docker-compose.https.yml:19` — `REQUIRE_HTTPS: "true"` on backend;
  `:23` — `"${HTTPS_PORT:-8443}:443"` on frontend; `:29` — `HTTPS_REDIRECT_PORT`.
- `docker-compose.editor.yml:2` — editor served at `/editor/`; `:35-36` — the overlay
  mounts `nginx/editor.conf` + `csp-editor.conf` into frontend; `:14-29` — the `editor`
  service itself. Without the overlay, `/editor/` 404s and the editor container is gone.

Consequence on a stack started per the doc's HTTPS section (:210,
`docker compose -f docker-compose.yml -f docker-compose.https.yml up -d`): the plain
step-3 `up -d --build` recreates frontend/backend from `docker-compose.yml` alone —
8443 listener dropped, `REQUIRE_HTTPS` unset (bearer tokens accepted over http :8044
again — `backend/auth.js` B6 gate), every Moodle launch fails (LTI needs https). With
the editor overlay (:368), `/editor/` disappears the same way. `down`/`stop`/`logs`
without the overlay also miss the editor service and (for `down`) leave its container
behind as an orphan.

## 2. `COMPOSE_FILE` in `.env` — semantics verified empirically

Docker Compose reads `COMPOSE_FILE` from the project-directory `.env` (same precedence
as other env vars: shell > `.env`); it selects the compose file list so **every plain
`docker compose` command keeps the overlays**. Separator is the OS path-list separator:
`:` on Linux/macOS, `;` on Windows.

Live proof on this host (Docker Compose v5.7.0, Windows): temp dir with
`docker-compose.yml` (service `base`), `docker-compose.ovl.yml` (service `extra`), and
`.env` containing only `COMPOSE_FILE=docker-compose.yml;docker-compose.ovl.yml`:

```
$ docker compose config --services
base
extra
exit=0
```

Both services resolved from `.env` alone — no `-f`, no shell export. The `;` Windows
separator is thereby verified, not just doc-quoted. (Docker docs, "Environment variables
precedence" / `COMPOSE_FILE`: path separator follows the OS, `;` on Windows.)

Repo-internal precedent for the override semantics: `.code-foundations/build/2026-11-16-ops1-deploy-pipeline-phase-5.md:81`
— "release.env wrote COMPOSE_FILE, overriding the deploy's own compose list" (the OPS1
lesson; that pipeline is unmerged/dead, the semantics lesson stands).

### Existing `COMPOSE_FILE` mentions (repo-wide grep, excluding node_modules/.git)

- `scripts/selfhost-check.mjs:43` — `const COMPOSE_FILES = ['docker-compose.yml', 'docker-compose.selfcheck.yml'];`
  (a JS constant, **not** the env var) and `:197` — `composeArgs` appends
  `docker-compose.https.yml` when `--https`. The check always passes explicit `-f`, so a
  `COMPOSE_FILE` in the admin's `.env` cannot affect it — but see §5 scrub note.
- `.env.example` — **no** `COMPOSE_FILE` (nearest: `REQUIRE_HTTPS` comment :30-33).
- `docs/` — zero mentions. `Readme.md` commands (:111, :137, :204, …) are plain-form
  too, but Readme is out of card scope (self-host.md is the admin guide).
- `docs/backup-restore.md` — all commands use `-p vlabscratch $F …` with an explicit
  scratch `-f` list (:48-103); unaffected by `COMPOSE_FILE`, no edits needed.

## 3. selfhost-check `--https` structure — why no update leg

`scripts/selfhost-check.mjs`: `parseArgs` `--https` (:82); port probe holds 8051+8443
(:379-383); `buildEnv` owns `HTTPS_PORT` (:113-116); `composeArgs` (:196-199) and
`teardownCommands` (:210-215) carry the overlay on both up and down; `judgeHttps`
(:245-269) judges 301+HSTS. The driver is **fresh-clone only** (clone → env → up →
backup → restore proof → smoke → teardown); there is no git-pull/rebuild leg, and an
update leg would need a second full build + the `vl-db.lock` + both ports for the
whole duration — exactly the cost the lead lean says to avoid. The defect is in the
**doc's commands**, not in the check's (the check already preserves overlays on
teardown). **Decision: cheap doc-grep test, no `--https` update leg.**

## 4. Where the test lives — `scripts/test/*.test.mjs`, `node --test`

- Runner: root `package.json:8` — `"test:scripts": "node --test --test-concurrency=1 \"scripts/test/*.test.mjs\""`.
  Measured now: **88 tests, 88 pass, 0 fail** (`npm run test:scripts`, ~10 s, no Docker).
- Pattern precedent for a file-reading, no-Docker test: `scripts/test/https-redirect.test.mjs`
  reads repo files directly (`:64-70`: `readFileSync(path.join(ROOT, 'docker-compose.https.yml'))`
  etc.); `scripts/test/selfhost-check.test.mjs:600-608` greps `docker-compose.https.yml`
  text for interpolated vars; `verify-backup.test.mjs:272` reads a script's own source.
  Imports are `node:test` + `node:assert/strict` + `node:fs` + `node:path`, repo root via
  `path.dirname(fileURLToPath(import.meta.url))` + `..`/`..`.
- No existing test asserts `docs/self-host.md` content (grep: no `self-host` hit in
  `scripts/test/`). A new file `scripts/test/selfhost-doc.test.mjs` fits the glob
  automatically — no runner change.

### What it asserts (deterministic, section-scoped)

Read `docs/self-host.md`, slice sections by their `##`/`###` headings, then:

1. **HTTPS section** (`## HTTPS` … next `##`): contains a `COMPOSE_FILE=` value naming
   both `docker-compose.yml` and `docker-compose.https.yml`, and mentions the Windows
   `;` separator.
2. **Editor section** (`## Редактор сценаріїв` …): contains `COMPOSE_FILE` guidance
   naming `docker-compose.editor.yml`.
3. **Update area** (`## Оновлення` … next `##`, which includes «Як оновитися» **and**
   the M1.2s rollback subsection): mentions `COMPOSE_FILE` (the mechanism that makes
   its plain commands safe), and its `docker compose up` commands are either plain
   (no `-f` — overlay preservation delegated to `.env`) or carry explicit `-f` lists;
   no command may mix a *partial* `-f` list that drops an overlay silently.
4. **Logs/stop section** (`## Логи, зупинка, скидання` …): mentions `COMPOSE_FILE`
   (one sentence suffices) so plain `down`/`stop` are covered by the same mechanism.
5. **Restore pair intact**: the rollback restore command still uses the explicit
   `-f docker-compose.yml -f docker-compose.restore.yml` pair (guards M1.2s text
   against accidental "simplification").

RED→GREEN is natural: `COMPOSE_FILE` appears **nowhere** in the doc today (§2 grep),
so assertions 1-4 fail on the pre-fix doc; after the doc edit they pass. Mutation
check for review: revert the doc (or strip one section's guidance) → suite must fail.

## 5. One adjacent one-liner worth taking (D7 consistency)

`scripts/selfhost-check.mjs:164-172` `COMPOSE_INTERPOLATED` + `scrubComposeEnv` (:181-185)
exist so an operator's exported shell vars cannot beat the check's generated `.env`
(the D7 lesson). `COMPOSE_FILE` is the same hazard class — an exported `COMPOSE_FILE`
would redirect the check's docker children to the wrong file list — and the doc now
actively tells admins about this variable. Adding `'COMPOSE_FILE'` to the list is one
line; the existing scrub tests iterate the list, so coverage is automatic. The
generated `.env` never sets it, and explicit `-f` wins anyway — belt and braces, zero
behavior change for clean shells. (Optional per lead lean; recommended, cost ≈ 0.)

## 6. Baselines + overlap

- `npm run test:scripts` — **88/88 pass** (measured, this worktree, no Docker).
- `cd backend && npm run test:unit` — **308/308 pass** (measured, ~4.6 s, no Docker).
- In-flight claims (`ls-remote claims/*`): `C4` (W1, editor repo — no overlap),
  `OPS1` (old parked W3 claim, deploy pipeline — dead branch, no file overlap),
  `M1.2r` (ours). M1.2s merged (`ea95355`); its rollback text is in the base and the
  plan keeps it intact except the one added mechanism sentence.
- ROADMAP row: `M1.2r` at **:80**, currently `🟡 W3 2026-11-20 — ⬜`.
