# P5b — selfhost-check --https + in-check restore: build notes (W3, 2026-11-18)

Task (ROADMAP P5b, `PLAN.md` §2.12): `selfhost-check --https`
(`docker-compose.https.yml` + self-signed cert, redirect + HSTS checks), one
backup taken **and restored** inside the check, real-cert admin steps in
`docs/self-host.md`. ½ d. Deps P5a + HO1 done.

Branch `P5b-selfhost-https-restore` (virtual-lab + `.claude-shared`).

## Research summary (verified @71842b1)

- `scripts/selfhost-check.mjs`: 11 steps, injectable exec/probe,
  `COMPOSE_INTERPOLATED` scrub, env 4-key assertion at `:327`,
  `httpProbe` is a plain fetch at `:256`.
- `docker-compose.https.yml`: `REQUIRE_HTTPS`, `${HTTPS_PORT:-8443}:443`,
  cert baked via `make-cert.mjs`.
- HSTS already emitted — `nginx.conf:10,45` (`map $scheme`).
  Redirect **absent** — must add.
- `scripts/restore.mjs`: marker gate + `--yes`; rw mounts via
  `docker-compose.restore.yml`; `pg_dump --clean` makes in-place restore safe.
- `verify-backup.mjs` empty-volumes bypass at `:191` (HO1 deferred — picked up).
- Smoke TLS gaps: smoke config lacks `ignoreHTTPSErrors`, `smoke-setup.ts`
  plain fetch; `REQUIRE_HTTPS` 403s bearer-over-http → smoke must use https base.
- Ports: 8051/8443 free, 8044 held by W1.

## What landed

- **Phase 1 — `5bfeb30` (tests, RED):** `scripts/test/https-redirect.test.mjs`,
  `selfhost-https-judge.test.mjs`, `selfhost-restore.test.mjs`,
  `smoke-tls.test.mjs` (new), `selfhost-check.test.mjs`,
  `verify-backup.test.mjs` (extended). Baseline before edits: 42/42 green;
  RED list printed, failures only on the new expectations.
- **Phase 2 — `f41850b` (impl):** `scripts/selfhost-check.mjs` (`--https` flag,
  `composeArgs`/`teardownCommands` https option, `HTTPS_PORT` env write +
  `COMPOSE_INTERPOLATED` scrub + both-port bind-check, `judgeHttps`, `https`
  step after healthy, `restore` step in both modes, health wait + smoke on the
  TLS base), `scripts/lib/verify-backup.mjs` (missing `volumes/` FAILs),
  `docker-compose.https.yml` (`HTTPS_REDIRECT_PORT` interpolation),
  `docker-compose.selfcheck.yml` (comment), `nginx/10-https-redirect.sh` (new),
  `nginx/nginx.conf` (redirect include), `Dockerfile.frontend` (entrypoint
  copy), `e2e/playwright.smoke.config.ts` (`E2E_INSECURE_TLS` →
  `ignoreHTTPSErrors`), `e2e/smoke-setup.ts` (node:https probe under the same
  opt-in).
- **Phase 3 — docs commit (this phase):** `docs/self-host.md` (HTTPS section
  rewritten: `--https`, redirect/HSTS mechanics, real-cert mount at
  `/etc/nginx/tls/` + renewal, «Що нового» 2026-11-19 bullet, usage line);
  this notes file + `plan.md` committed in `.claude-shared`.

Decisions as built:

- **judgeHttps export contract** (D5): pure judge
  `(probes: {http:{url,status,headers}, https:{status,headers}}, {httpsBaseUrl})
  → {ok, reason}`; exported so unit tests drive it without Docker. Judges
  301 + exact `Location` (scheme/host/port/path/query preserved), 200 +
  non-empty HSTS on TLS, HSTS absent on plain. Header lookup case-insensitive.
- **HTTPS_REDIRECT_CONF override mirrors LTI_PICK_CONF:**
  `out="${HTTPS_REDIRECT_CONF:-/etc/nginx/https-redirect.conf}"` — same seam
  as `15-lti-frame-ancestors.sh`'s `LTI_PICK_CONF`, so the renderer is
  unit-testable to a temp file. Validation: strip whitespace, `^[0-9]{1,5}$`,
  range 1–65535, else `exit 1` (container refuses to start); `set -f` keeps
  globs literal.
- **Restore child compose shape** (D6): base + selfcheck (+ https) overlays
  carried into the child, then `-f docker-compose.restore.yml run --rm
  --entrypoint node -e BACKUP_DIR=/backups -v <dir>:/backups backup
  restore.mjs <name> --yes` — restore.yml's rw volume entries merge over the
  backup service's ro mounts by target path, on the renamed vlcheck_* volumes.
- **backup/restore.mjs path correction vs plan:** the plan/research said
  `scripts/restore.mjs`; the script actually lives in `backup/restore.mjs`
  (inside the backup image, hence `--entrypoint node … backup restore.mjs`).
  Implementation used the real path; no file moved.
- **Step arrays 12/13:** plain = lock, port, clone, env, up, healthy, backup,
  backup marker, restore, e2e deps, e2e browser, smoke (12); https inserts
  `https` after healthy (13). Exact-array pins updated intentionally in
  phase 1, not weakened.
- **https health wait on TLS base:** the redirect makes every plain request
  (incl. `/api/health`) a 301, so `waitHealthy` and the post-restore health
  probe use the https base; `httpProbe` switched from fetch to node:http/https
  with `rejectUnauthorized:false` (undici ignores
  NODE_TLS_REJECT_UNAUTHORIZED). Smoke child env gets
  `NODE_TLS_REJECT_UNAUTHORIZED=0` + `E2E_INSECURE_TLS=1` in https mode only.
- verify-backup: missing `volumes/` directory is a FAIL ("the backup holds no
  archives"), not a skip; trailing-newline fix included.

## Verification

(live gate results appended after the run)

Phase-2 unit evidence: `test:scripts` 79 pass / 0 fail; `backup/restore.test.mjs`
4/4.

## Left open

Live selfhost-check both modes + full repo checks run by the gate after this
phase; results recorded in the report.
