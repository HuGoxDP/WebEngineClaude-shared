# P5b — selfhost-check --https + in-check restore: plan (W3, 2026-11-18)

Research: `notes.md` (this dir), verified against virtual-lab @`71842b1`.
Branch `P5b-selfhost-https-restore` (virtual-lab + `.claude-shared`).
Repos: virtual-lab (+ `.claude-shared` report). Graphify: not applicable (no engine files).
Task: ROADMAP P5b, `PLAN.md` §2.12. ½ d. Deps P5a + HO1 done.

## Deliverables

1. `selfhost-check --https`: `docker-compose.https.yml` overlay + self-signed cert,
   redirect + HSTS checks.
2. One backup taken **and restored** inside the check — a `restore` step in both
   plain and https modes.
3. `verify-backup` empty-volumes bypass fixed (HO1 deferred item, picked up here).
4. Smoke runs over TLS when the stack requires it.
5. Real-cert admin steps in `docs/self-host.md` + report.

## Design (D1–D10)

- **D1 — flag + compose selection.** `--https` adds `-f docker-compose.https.yml`
  (base + selfcheck + https). `HTTPS_PORT` env (default `8443`, from
  `${HTTPS_PORT:-8443}:443` in https.yml): added to the env write, to
  `COMPOSE_INTERPOLATED` scrub, and to the bind-check (both ports must be free).
- **D2 — redirect.** Absent today. Add entrypoint-rendered include
  `nginx/10-https-redirect.sh` + `HTTPS_REDIRECT_PORT` env in https.yml.
  Empty include = plain stack unaffected. Numeric validation of the port,
  `exit 1` on bad value. `if`-in-server only with `return` (safe form).
- **D3 — HSTS assert-only.** Already emitted by `nginx.conf:10,45`
  (`map $scheme`). The check asserts, nothing to implement in nginx.
- **D4 — https probe.** `node:https` with `rejectUnauthorized: false` —
  throwaway selfcheck stack only, never the live stack.
- **D5 — new `https` step.** Judge: http → 301 + correct `Location`;
  HSTS header present on https, absent on http. Pure judge helper, unit-tested.
- **D6 — new `restore` step, BOTH modes.** Seed a draft proof row → backup →
  verify → `verified` marker → DELETE the row → `restore --yes`
  (`docker-compose.restore.yml` rw mounts, `--entrypoint node`) → row back +
  row-count match + `/api/health` ok. Draft is invisible to the smoke.
  `restore.mjs` marker gate + `pg_dump --clean` make in-place restore safe.
- **D7 — verify-backup.** Empty-volumes case FAILs (`:191` bypass) + newline fix.
- **D8 — smoke TLS.** `E2E_INSECURE_TLS` in the smoke config
  (`ignoreHTTPSErrors`), https base URL, `NODE_TLS_REJECT_UNAUTHORIZED=0`
  in the child env only (smoke-setup's plain fetch). `REQUIRE_HTTPS` 403s
  bearer-over-http, so the smoke must use the https base.
- **D9 — docs.** `docs/self-host.md`: real-cert mount + renewal steps,
  `--https` flag, «Що нового» bullet.
- **D10 — selfcheck.yml comment** updated for the https overlay + restore step.

## Phase 1 — tests first (RED)

**File scope:** `scripts/test/selfhost-check.test.mjs`,
`scripts/test/verify-backup.test.mjs`, new judge/restore-step tests.
**Model:** this worker. **Gate:** Standard.

- Update pinned step arrays (exact-array unit tests — intentional updates
  allowed, weakening not): plain 11+restore, https 11+https+restore.
- New tests: compose selection with `--https`; `HTTPS_PORT` env/scrub/port-check;
  redirect include rendering + numeric validation (`exit 1`); https judge
  (301/Location, HSTS present/absent); restore-step sequence (seed → backup →
  verify → marker → delete → restore --yes → proof); verify-backup
  empty-volumes FAIL; smoke TLS env wiring.
**DW:** RED list printed — `node --test scripts/test` fails only on the new
expectations, nothing else.

## Phase 2 — implementation

**File scope:** `scripts/selfhost-check.mjs`, `scripts/lib/verify-backup.mjs`,
`docker-compose.https.yml`, nginx entrypoint + `nginx/10-https-redirect.sh`,
`docker-compose.selfcheck.yml` (comment), `e2e/playwright.smoke.config.ts`,
`e2e/smoke-setup.ts`, restore-step wiring to existing `scripts/restore.mjs` +
`docker-compose.restore.yml`. **Depends on:** phase 1. **Gate:** Standard.

- Implement D1–D8 + D10 per the design; no weakening of phase-1 assertions.
**DW:** full `test:scripts` green; `restore.test` 4/4; `bash -n` on the
entrypoint/redirect scripts.

## Phase 3 — docs + push

**File scope:** `docs/self-host.md`, `.claude-shared/code-foundations/P5b/`.
**Depends on:** phase 2. **Gate:** Minimal.

- D9 docs; notes.md filled with what landed + verification; branches pushed.
**DW:** docs accurate against the code; push done. CHANGELOG/ROADMAP left to
the lead's gate.

## REVIEW + LIVE gate + merge

- Adversarial review (read-only subagent, file:line defects) before the live run.
- **Lead** runs LIVE `selfhost-check --https` under `vl-db.lock`, both modes:
  plain run stays GREEN (11+restore steps); https run GREEN (https+restore steps).
- Merge after the gate. Worker does not commit `.claude-shared` report rows.

## Risks

- nginx `if`-in-server safe only with `return`; empty include file is a no-op.
- Ports: merge base+https publishes both — bind-check both (8051/8443 free,
  8044 held by W1).
- `REQUIRE_HTTPS` breaks bearer-over-http smoke — https base mandatory (D8).
- `pg_dump --clean` idempotent in-place; restore.yml volume entries merge by
  target (rw over the backup service's ro).
- Unit tests pin exact step arrays — intentional updates allowed, weakening not.
