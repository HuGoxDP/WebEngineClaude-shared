# P5b — selfhost-check --https + in-check restore: task report (W3, 2026-11-19)

Objective (ROADMAP P5b, `PLAN.md` §2.12): `selfhost-check --https` starts with
`docker-compose.https.yml` + self-signed cert and checks the redirect and the HSTS
header; one backup taken **and restored** inside the check; real-cert admin steps in
`docs/self-host.md`. Build notes `notes.md`. Branch `P5b-selfhost-https-restore`.

## Deliverable (virtual-lab, 4 commits, pushed)

- `5bfeb30` — phase 1 tests RED: exact step-array pins 12/13, new pins for `--https`
  compose/env/scrub/bind, redirect rendering + validation, `judgeHttps`, restore
  sequence + failure path, verify-backup missing-volumes FAIL, smoke TLS opt-in.
- `f41850b` — phase 2 impl: `--https` flag + https/restore steps, `HTTPS_REDIRECT_PORT`
  interpolation + `nginx/10-https-redirect.sh` (numeric validation, exit 1 on bad
  port), redirect include, `judgeHttps`, restore child compose (base+selfcheck+https
  + restore.yml rw mounts), health wait + smoke on the TLS base, verify-backup
  missing `volumes/` now FAILs.
- `12f7e26` — phase 3 docs: `docs/self-host.md` HTTPS section rewritten (`--https`,
  redirect/HSTS mechanics, real-cert mount at `/etc/nginx/tls/` + renewal,
  «Що нового» 2026-11-19 bullet).
- `7fce7d2` — review coverage fix: direct unit tests for `httpProbe` and smoke
  `fetchHealth`.

CS: `81ffcde` claim, `d994b4b` plan+notes.

## Gate evidence

- Unit: `npm run test:scripts` **88/88** (42 baseline, +46 new/updated);
  `backup/restore.test.mjs` **4/4**.
- Static: backend unit **308/308**; frontend `ng test` **770/770** (50 files,
  statements 96.55%), build + `check:csp` ok; e2e tsc only the 2 pre-existing
  TS2683 in untouched `viewer.spec.ts:100,374`.
- Docker (vl-db.lock): Postgres integration **1666/1666** (:55432); full browser
  e2e on scratch stack :8144 → **136 passed / 19 skipped** of 155 specs (documented
  skip policy: streaming viewer variants + editor-csp without the editor stack).
- LIVE gate (vl-db.lock, task-branch clone @`7fce7d2`):
  - plain: `selfhost-check: steps=12 ok=12 GREEN` — restore proof row back (1),
    smoke 7 passed (6.1s).
  - `--https`: `selfhost-check: steps=13 ok=13 GREEN` — https step: 301 →
    `https://127.0.0.1:8443`, HSTS max-age=31536000; restore proof row back (1);
    smoke 7 passed (12.2s) over TLS.
  - Teardown clean, no leftover containers/volumes. Logs:
    `C:/Users/HuGox/AppData/Local/Temp/opencode/p5b-live-plain.log`, `p5b-live-https.log`.

## Review verdict

Adversarial batch review of phases 1–2 (`review-phases-1-2.md`): functional **PASS**
(live nginx probes: valid port → 301 `Location: https://127.0.0.1:8443/some/path?q=1`
+ HSTS https-only; bad port → container Exited(1); unset → empty include, plain 200;
injection battery; restore isolation; judge adversarial variants). Initial **FAIL on
2 coverage gaps** (`httpProbe`, `fetchHealth`) → fixed in `7fce7d2` → re-review
**PASS**.

## Open items

None blocking. Pre-existing, not P5b (observations only):

- 7 ScenarioCreator release archives lack `catalog-metadata.mjs` entries
  (`publish:release` exits 1 while all 12 catalog scenarios are created+approved).
- `e2e/tests/viewer.spec.ts` TS2683 ×2 (`:100`, `:374`).
- `nginx.conf;C` / `csp.conf;C` ignored leftovers in some checkouts.