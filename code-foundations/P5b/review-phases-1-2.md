# Review: Phase 1 - tests-first pins (5bfeb30)

Repo: `.workers/W3/virtual-lab`, branch `P5b-selfhost-https-restore`. Base `71842b1`, phase 1 `5bfeb30`, phase 2 `f41850b` (HEAD at review: `12f7e26`, phase-3 docs-only, out of scope). Working tree clean at review start. `docs/self-host.md` ignored per dispatch.

## Executed Results (Step 0)

Suite run once for the batch; cited in both phase blocks. Heartbeats sent before/after (`wk.sh beat W3 review P5b`).

- `npm run test:scripts` → **79 pass, 0 fail** (raw tail: `tests 79 / pass 79 / fail 0 / cancelled 0 / skipped 0 / duration_ms 6632.0875`). No hang.
- `node --test backup/restore.test.mjs` → **4 pass, 0 fail** (`tests 4 / pass 4 / fail 0`).
- `bash -n nginx/10-https-redirect.sh` → OK; `sh -n nginx/10-https-redirect.sh` → OK.
- Typecheck (extra, not dispatch-listed): `frontend/node_modules/.bin/tsc -p e2e/tsconfig.json --noEmit --typeRoots frontend/node_modules/@types` → exit 2 with exactly 2 errors, both pre-existing `TS2683` in `e2e/tests/viewer.spec.ts:100,374` — file untouched by either phase (`git diff 71842b1 f41850b -- e2e/tests/viewer.spec.ts` empty). `e2e/smoke-setup.ts` and `e2e/playwright.smoke.config.ts` compile clean (0 errors reference them). Not attributable to these phases → Note, not FAIL.
- Lint: no lint script exists for `scripts/` or `e2e/` (node --test repo); N/A.
- alsp: N/A — JS repo, no `Cargo.toml`.

## Requirement Fulfillment

### DW-1.1
PREMISE:  "pinned exact step arrays updated intentionally: plain 12 steps (lock,port,clone,env,up,healthy,backup,backup marker,restore,e2e deps,e2e browser,smoke), https 13 (+https after healthy). No OTHER pre-existing assertion weakened, skipped or deleted — verify by `git diff 71842b1 5bfeb30 -- scripts/test/selfhost-check.test.mjs scripts/test/verify-backup.test.mjs` that removed lines are only the intentional pin updates."
EVIDENCE: `git diff 71842b1 5bfeb30` — removed lines in selfhost-check.test.mjs are exactly 4: the fs-import line (replaced by a superset adding `unlinkSync` + `createServer`), two `parseArgs` pins (each gains `https: false`), and the plain step-array pin (11 entries → 12, `+restore` after `backup marker`). verify-backup.test.mjs diff has **zero removed lines** (`grep "^-"` empty), +21 added. New pins: plain 12 at scripts/test/selfhost-check.test.mjs:301, https 13 at :711. Top-level test count 18 → 20 (`grep -c "^test("`; the dispatch's "21" is a `grep -c "test("` artifact counting three `.test(` regex calls — see Notes).
TRACE:    diff 71842b1→5bfeb30 → removed-line inventory = 4 intentional pin/import updates, nothing else → no assertion weakened; both new arrays match DW wording entry-for-entry; suite 79/79 green with the new pins.
VERDICT:  PASS

### DW-1.2
PREMISE:  "new tests exist and are meaningful (not tautological) for: --https compose selection; HTTPS_PORT env write/scrub/bind-check; redirect include rendering + numeric validation exit 1; judgeHttps (301/Location, HSTS present/absent); restore-step sequence incl. failure path; verify-backup missing volumes/ FAIL + trailing newline; smoke TLS config opt-in."
EVIDENCE:
- compose selection: selfhost-check.test.mjs:547 (`composeArgs: --https adds the https overlay after base + selfcheck`).
- HTTPS_PORT write/scrub/bind: :556 (buildEnv five keys), :724 (env write + poison scrub on every docker child), :568 (default-8443 bind check), :608 (bound HTTPS port refuses before clone), :599 (COMPOSE_INTERPOLATED covers https.yml).
- redirect rendering/validation: https-redirect.test.mjs:36 (unset/blank → empty), :44 (numeric → if-with-return 301), :53 (non-numeric/out-of-range → exit 1, no file), :63 (wiring: nginx.conf include + Dockerfile + https.yml interpolation). The first three execute the real script under `sh`.
- judgeHttps: selfhost-https-judge.test.mjs — 12 tests importing the real export: green 301+HSTS, path+query preserved, plain-200 fail, 302 fail, wrong port/host fail, missing Location fail-safe, HSTS absent/empty fail, HSTS-on-plain fail, non-200 https fail, case-insensitive headers, missing probes named.
- restore sequence + failure: selfhost-restore.test.mjs:126 (seed→backup→delete→restore→smoke order, count match, marker seen at restore, health re-probed), :152 (compose run shape incl. selfcheck overlay — the live-volume guard), :174 (psql in-stack, draft row), :193 (failed restore → named failure, `down -v` ran, smoke never started, tmpRoot empty).
- verify-backup: verify-backup.test.mjs:257 (no volumes/ dir → FAIL named, no marker), :271 (trailing newline).
- smoke TLS opt-in: smoke-tls.test.mjs:35/:42/:48 — fresh child process per env case, asserts `ignoreHTTPSErrors` iff `E2E_INSECURE_TLS=1` (also `=0` is not the opt-in).
TRACE:    each listed behavior → a named test that drives real code (real runCheck with injected exec/probe seams, real judgeHttps import, real sh execution, real config import in a child) → all ran green in Step 0; assertions inspect real outputs (step arrays, child envs, rendered files, exit codes), not mock internals.
VERDICT:  PASS

**All requirements met:** YES

## Test-DW Coverage
- [x] All DW items have corresponding tests (ran in Step 0): DW-1.1 by the diff audit + the green suite carrying the new pins; DW-1.2 by the named tests above.
- [x] Test coverage matches the stated level — 100%; gaps: none. Phase 1 changes only test files; the new harness helpers (`httpsHarness`, restore `harness`, `makeBackup`) are exercised by every test that uses them. No implementation routine changed in this phase.

## Dead Code
None found.

## Correctness Dimensions
| Dimension | Status | Evidence |
|-----------|--------|----------|
| Concurrency | N/A | Test-only phase; harnesses are serial (`--test-concurrency=1`), each owns its tmp dirs. |
| Error Handling | PASS | Failure-path tests assert named failures + teardown (selfhost-restore.test.mjs:193, selfhost-check.test.mjs:831). |
| Resources | PASS | Every harness cleans up in `finally`; tests assert tmpRoot empty after runs (:201, :720). |
| Boundaries | PASS | Port-validation boundary cases pinned (https-redirect.test.mjs:53); judge boundary cases (wrong port/host, missing headers) pinned. |
| Security | PASS | No test weakens verification: plain-mode test asserts `NODE_TLS_REJECT_UNAUTHORIZED === undefined` (:823); TLS opt-in tested both ways incl. `=0`. |

## Loaded-Skill Criteria
N/A — no skills loaded (dispatch has no `## Additional Skills`).

## Notes (non-blocking)
1. verify-backup.test.mjs:260-261 comment says "today the missing-dir bypass … lets exactly this shape pass" — written red-first in phase 1, stale after phase 2 fixed it. Confidence: high. Severity: trivial (comment only).
2. selfhost-check.test.mjs:576-581: the default-8443 bind-check test silently returns when 8443 is already held on the host. Honest skip (comment says so), but coverage of that one case vanishes on busy hosts without a skip marker. Confidence: high. Severity: low.
3. "Existing 21 tests" (DW-2.6 wording) vs reality: old file has 18 top-level `test(` + 3 `.test(` regex calls = 21 grep hits; new file 20 top-level. No test was deleted (zero removed lines). Confidence: high. Severity: informational.

## Issues (if FAIL)
None.

**Verdict: PASS**

---

# Review: Phase 2 - implementation (f41850b)

## Executed Results (Step 0)

Same single batch run, cited here:
- `npm run test:scripts` → **79 pass, 0 fail** (`tests 79 / pass 79 / fail 0 / cancelled 0 / skipped 0 / duration_ms 6632.0875`).
- `node --test backup/restore.test.mjs` → **4 pass, 0 fail**.
- `bash -n` / `sh -n nginx/10-https-redirect.sh` → OK / OK.
- Typecheck: e2e tsc exit 2, only pre-existing `viewer.spec.ts` TS2683 (untouched file); changed TS files clean. See Phase 1 block.
- Live observed behavior (reviewer-run, throwaway containers on a private network, removed afterwards): real `nginx:alpine` with the repo's `nginx.conf`, `10-https-redirect.sh`, a self-signed cert and a stub `/api/health` backend; plus direct invocation of the real `httpProbe` body and the tsc-compiled real `smoke-setup.ts`. Details per DW below.

## Requirement Fulfillment

### DW-2.1
PREMISE:  "`--https` flag appends docker-compose.https.yml after base+selfcheck; HTTPS_PORT (default 8443) in env write (5 keys https mode), COMPOSE_INTERPOLATED scrub (incl HTTPS_REDIRECT_PORT), every docker child scrubbed, bind-check BOTH ports before clone."
EVIDENCE: scripts/selfhost-check.mjs:82 (`--https` parse), :196-197 (`composeArgs` = base+selfcheck then https overlay last), :110-130 (buildEnv appends HTTPS_PORT; .env.example has no HTTPS_PORT/BACKUP_DIR → append path), :165-171 (COMPOSE_INTERPOLATED incl. HTTPS_PORT, HTTPS_REDIRECT_PORT, REQUIRE_HTTPS), :181 (scrubComposeEnv), :410 (dockerEnv) used at every docker child :416/:429/:440/:451/:457/:488/:537, :379-383 (both ports checked) before clone :387, :405 (env step expects 5 keys https / 4 plain). Tests: selfhost-check.test.mjs:547, :556, :568, :599, :608, :724.
TRACE:    `--https` → parseArgs https:true → composeArgs appends overlay last → env write owns HTTPS_PORT=8462 (poison test :724 proves shell value never reaches a docker child) → bind check with 8443 held returns `failed:'port'` with **zero** exec calls (reviewer live probe: held 8443 with a net server, injected exec counted 0 calls) → clone never started.
VERDICT:  PASS

### DW-2.2
PREMISE:  "nginx/10-https-redirect.sh renders include from HTTPS_REDIRECT_PORT (override HTTPS_REDIRECT_CONF): unset/blank → empty file; numeric in-range → if ($scheme = http) with return 301 https://$host:<port>$request_uri; bad → exit 1 no file. Wired: nginx.conf include, Dockerfile.frontend copies+runs, https.yml sets the env. Plain stack unaffected (empty include). ADVERSARIAL: can a crafted HTTPS_REDIRECT_PORT inject nginx config? Is the numeric validation airtight (leading zeros, +, whitespace, 0, 65536, newline)? Does the entrypoint run it in the right order / fail the container on exit 1?"
EVIDENCE: nginx/10-https-redirect.sh:13-14 (`set -eu; set -f`), :16 (HTTPS_REDIRECT_CONF override), :17 (whitespace strip), :19-21 (blank → empty file, exit 0), :24 (`^[0-9]{1,5}$`), :28 (1–65535 range), :30-33 (render). nginx/nginx.conf:65 (`include /etc/nginx/https-redirect.conf;` in the server block). Dockerfile.frontend:59 (`COPY --chmod=0755 … /docker-entrypoint.d/10-https-redirect.sh`), :60 (`EXPOSE 80 443`). docker-compose.https.yml:29 (`HTTPS_REDIRECT_PORT: ${HTTPS_REDIRECT_PORT:-${HTTPS_PORT:-8443}}`). Tests: https-redirect.test.mjs:36/:44/:53/:63.
TRACE (live, reviewer-run nginx:alpine containers with the repo script mounted at /docker-entrypoint.d/):
- `HTTPS_REDIRECT_PORT=8443` → entrypoint log "Launching /docker-entrypoint.d/10-https-redirect.sh" (before 15-lti… and the stock 10/20/30 scripts, `sort -V` order) → rendered file exactly `if ($scheme = http) { return 301 https://$host:8443$request_uri; }` → `curl http://…/some/path?q=1` → **301, Location: https://127.0.0.1:8443/some/path?q=1**; https listener → 200 + `Strict-Transport-Security: max-age=31536000`.
- `HTTPS_REDIRECT_PORT='8443; return 200 hacked;'` → script exit 1 ("must be a port number (1-65535)") → **container Exited (1)** — entrypoint `set -e` propagates. No include written.
- unset → `wc -c` = **0** on the include, container Up, plain `/` → **200, zero Location headers** — plain stack untouched.
- Injection battery (earlier sh probes): `+8443`, `8443;…`, backticks, `$(…)`, letters, hex `0x20FB`, `1e4`, `65536`, `0`, overflow, newline payloads → all exit 1, no file. `set -f` keeps `*` literal (fails validation, no glob).
- Nested compose default verified live: `docker compose -f docker-compose.yml -f docker-compose.selfcheck.yml -f docker-compose.https.yml config` exits 0 on Compose v5.7.0, renders `HTTPS_REDIRECT_PORT: "8443"` and published `"8443"`.
VERDICT:  PASS (leading-zero and internal-whitespace acceptance are normalization quirks, not injection — Notes 1–2)

### DW-2.3
PREMISE:  "judgeHttps pure export: http must be 301 + Location exactly https scheme/host/port + same path+query; HSTS non-empty on https, absent/empty on http; case-insensitive headers; missing probes fail. ADVERSARIAL: Location with different case host, default-port elision, trailing slash, credentials in URL, header arrays."
EVIDENCE: scripts/selfhost-check.mjs:245-270 — pure, no I/O; :252-253 missing probes fail-safe; :254 strict 301; :257-258 expected derived from the probe's own URL pathname+search; :264 strict string equality on Location; :265 https must be 200; :266-267 HSTS non-empty after trim; :268 HSTS-on-plain rejected; :246-249 case-insensitive header lookup. Tests: selfhost-https-judge.test.mjs (12, all green).
TRACE (adversarial probes executed against the real export): Location host-case differing from base → `ok:false` (strict equality); default-port elision (`https://host/` vs expected `:8443`) → false; trailing-slash mismatch → false; credentials in Location (`https://u:p@host:8443/`) → false; Location as array → `location !== expected` → false (fail-safe); missing http/https probe → named false. HSTS as array `['max-age=1']` → `String()` coercion → ok:true (Note 3 — node:http never returns arrays for HSTS; not a demonstrated requirement violation).
VERDICT:  PASS

### DW-2.4
PREMISE:  "https step probes both listeners (node:https rejectUnauthorized:false — throwaway stack only), health wait in https mode uses TLS base; failure named 'https'."
EVIDENCE: scripts/selfhost-check.mjs:311-330 (httpProbe: node:http/https by protocol, `rejectUnauthorized:false` :315, no redirect follow, headers returned, timeout destroy :326), :348 (default probe), :424-427 (healthBase = httpsBaseUrl in https mode), :436-443 (both listeners probed via Promise.all, judgeHttps, `failed:'https'` + frontend logs on failure). Tests: selfhost-check.test.mjs:747 (both listeners probed), :760 (health wait on TLS base), :831 (no redirect → named 'https' failure + `down -v`).
TRACE (live observed, real httpProbe body against the reviewer's nginx stack): plain probe → `{status:301, headers.location:'https://127.0.0.1:8443/some/path?q=1'}`; TLS probe of the self-signed listener → `{status:200, headers['strict-transport-security']:'max-age=31536000'}` (cert accepted, no throw); unreachable host with 800ms timeout → rejects `probe timed out after 800ms`. Harness tests drive the same paths through runCheck green.
VERDICT:  PASS (DW satisfied by tests + observed behavior; httpProbe's missing unit test is the coverage FAIL below, not a DW failure)

### DW-2.5
PREMISE:  "restore step BOTH modes after 'backup marker': seed draft proof row (in-stack psql) → backup → verify → marker → DELETE row → compose run with base+selfcheck+restore.yml, --entrypoint node, BACKUP_DIR=/backups, -v <dir>:/backups, backup restore.mjs <name> --yes → row back + count match + /api/health. Failed restore = named failure, teardown runs, smoke never starts. ADVERSARIAL: does the DELETE+restore touch ONLY the throwaway selfcheck stack (renamed volumes)? Could the restore child ever write live volumes (missing selfcheck overlay)? Is the proof row invisible to smoke? SQL injection via row id? Does teardown still run on every new failure path?"
EVIDENCE: scripts/selfhost-check.mjs:451-452 (psql via `compose exec -T database`, seed `'vl-selfcheck-restore-proof'` status `'draft'`), :453-456 (seed failure named), :457-475 (backup → verifyBackup → marker gate), :483-487 (count + DELETE, same literal id), :488 (restore child: `composeArgs(['-f','docker-compose.restore.yml','run','--rm','--entrypoint','node','-e','BACKUP_DIR=/backups','-v',dir+':/backups','backup','restore.mjs',name,'--yes'],{https})` — composeArgs :196 ALWAYS includes base+selfcheck), :489-493 (count match + post-restore /api/health), :497-498 (named 'restore' failure), :529-551 (finally teardown on every return path). docker-compose.selfcheck.yml:24-30 renames all five volumes `vlcheck_*`; docker-compose.restore.yml entries merge by target path onto the selfcheck-renamed volumes. Tests: selfhost-restore.test.mjs:126/:152/:174/:193 (both modes: the plain harness at selfhost-check.test.mjs:782 also walks restore).
TRACE (adversarial):
- Live-volume write: impossible via the check — composeArgs hardcodes COMPOSE_FILES = [base, selfcheck] (:43, :196); the restore child adds restore.yml on top; test :161-162 pins the selfcheck overlay's presence explicitly. `down -v` likewise always carries selfcheck (teardownCommands :210) → deletes vlcheck_* only.
- Proof row vs smoke: seed is `status='draft'`; public catalog and smoke read only `status='published'` (PUBLIC_ROW) → invisible. Test :187-189 pins draft.
- SQL injection: id is the hardcoded literal `vl-selfcheck-restore-proof` (:483), interpolated into fixed SQL strings; no untrusted input reaches psql. Safe.
- Teardown on new failure paths: seed fail (:455), backup fail (:460/:465/:469), marker fail (:473), restore fail (:498), https fail (:441) all `return` inside the try → finally :534-540 runs `teardownCommands({https})` (restart=no first, then `down -v` with all overlays) and removes the clone. Tests :193-202 and :831-848 assert `down -v` ran and tmpRoot is empty after failures.
VERDICT:  PASS

### DW-2.6
PREMISE:  "verify-backup.mjs: missing volumes/ dir FAILs named + no marker; volumes:[] FAILs; trailing newline. Existing 21 tests unchanged in intent."
EVIDENCE: scripts/lib/verify-backup.mjs:194-197 (missing dir → named FAIL 'volumes/ directory is missing'), :198-201 (dir present but zero archives → FAIL), :141 (stale marker removed on re-verify), :211 (marker written only on the all-green exit), file ends with newline (test :271). Tests: verify-backup.test.mjs:257 (manifest `volumes: []` + dir removed → FAIL named, no marker), :271 (newline), plus the 18 pre-existing tests — diff 71842b1→f41850b removes **zero** lines from this test file.
TRACE:    backup dir with `volumes:[]` manifest and no volumes/ → verifyBackup → `ok:false`, error names the missing directory, marker absent (test :257 green). The empty-backup shape is what "volumes:[] FAILs" denotes: `volumes:[]` with archives present still passes — required by the unchanged good-backup test (:43-59 fixture carries `volumes: []`), see Note 4. "21" reconciles to 18 top-level tests + 3 `.test(` regex hits (Note 5); all 18 unchanged in intent, +2 new = 20, suite green.
VERDICT:  PASS

### DW-2.7
PREMISE:  "smoke https mode: child env E2E_BASE_URL=https://127.0.0.1:<httpsPort>, NODE_TLS_REJECT_UNAUTHORIZED=0 child-only (never leaked to host process env permanently), E2E_INSECURE_TLS=1; playwright.smoke.config.ts ignoreHTTPSErrors iff =1; smoke-setup.ts works over TLS. Plain mode unchanged."
EVIDENCE: scripts/selfhost-check.mjs:506-511 (env = spread copy of process.env + overrides; TLS pair added only when https; process.env itself never assigned), :508 (E2E_BASE_URL = httpsBaseUrl), :512/:516/:520 (all three e2e children get that env). e2e/playwright.smoke.config.ts:16 (`INSECURE_TLS = … === '1'`), :40 (`ignoreHTTPSErrors: INSECURE_TLS`). e2e/smoke-setup.ts:17-36 (fetchHealth: fetch unless `E2E_INSECURE_TLS==='1'`, then node:https `rejectUnauthorized:false`, 15s timeout). Tests: selfhost-check.test.mjs:765 (https child env), :782 (plain child: http base, `NODE_TLS_REJECT_UNAUTHORIZED === undefined`), smoke-tls.test.mjs:35/:42/:48 (=1 / unset / =0).
TRACE (live observed, tsc-compiled real smoke-setup.ts against the reviewer's nginx TLS stack + stub /api/health):
- `E2E_BASE_URL=https://… E2E_INSECURE_TLS=1` → `smoke → https://127.0.0.1:18443 (API p5b-probe, db connected)` — **works over TLS with the self-signed cert**.
- same URL without the opt-in → throws "Cannot reach …" (undici refuses the self-signed cert — verification stays on, as designed).
- plain base with the redirect include emptied → `smoke → http://… (API p5b-probe, db connected)` — plain path unchanged.
- down stack → named "Cannot reach" error; 502 health → named "returned 502" error.
- Child-only: env built by object spread (:507); poison-scrub test :740 also asserts no scrubbed value leaks into printed results; host process.env untouched (no assignment anywhere in the diff).
VERDICT:  PASS (DW satisfied; fetchHealth's missing unit test is the coverage FAIL below)

### DW-2.8
PREMISE:  "docker-compose.selfcheck.yml comment describes shipped https overlay + restore (no future tense)."
EVIDENCE: docker-compose.selfcheck.yml:17-22 — "With `selfhost-check --https` (P5b) the check also appends docker-compose.https.yml after this overlay — the TLS listener on ${HTTPS_PORT} — and its restore step runs backup/restore.mjs through docker-compose.restore.yml on these renamed volumes. Plain runs never see either overlay." Present tense throughout; matches the shipped behavior verified in DW-2.1/2.5.
TRACE:    comment text → present-tense description of composeArgs/restore behavior → agrees with code at selfhost-check.mjs:196/:488.
VERDICT:  PASS

**All requirements met:** YES (all eight DW items PASS; the phase fails on coverage level, below)

## Test-DW Coverage
- [x] All DW items have corresponding tests or recorded observed behavior (ran in Step 0): DW-2.1/2.3/2.5/2.6/2.8 automated; DW-2.2/2.4/2.7 automated + live observed behavior recorded above.
- [ ] Test coverage matches the stated level — **100%; gaps: FAIL (f)**:
  1. `scripts/selfhost-check.mjs:httpProbe` (:311-330) — rewritten in phase 2 (fetch → node:http/https, headers returned, rejectUnauthorized:false, timeout). **No unit test exercises it**: it is not exported, and every runCheck test injects `probe:` (grep across scripts/test finds zero references to httpProbe; the only coverage is the reviewer's live observation, which is not a repo test).
  2. `e2e/smoke-setup.ts:fetchHealth` (:17-36) — new routine, both branches (fetch vs node:https opt-in) plus timeout/error paths. **No test file references smoke-setup.ts at all**; smoke-tls.test.mjs tests only playwright.smoke.config.ts. The changed `smokeSetup` body (:38-54, delegation + health shape) is likewise only exercised by the reviewer's live run, not by a repo test.

## Dead Code
None found. The phase-2 diff adds one `console.log` in the `isMain` CLI banner (legitimate output, not debug). No unreachable code, no commented-out blocks, no unused imports introduced.

## Correctness Dimensions
| Dimension | Status | Evidence |
|-----------|--------|----------|
| Concurrency | PASS | `Promise.all` on the two probes (:437) — independent requests, no shared mutable state; all docker/git children are spawnSync (serial). No interleaving defect found. |
| Error Handling | PASS | httpProbe timeout/error reject (live: `probe timed out after 800ms`); waitHealthy catches probe throws (:287-289); fetchHealth error paths live-observed (down stack, strict-TLS refusal, 502); judgeHttps missing-probe fail-safe (tests); seed/backup/restore failures all named. |
| Resources | PASS | finally-teardown covers every new failure path (tests :193-202, :831-848 assert `down -v` + empty tmpRoot); `req.destroy` on timeout in both probes; restore child `--rm`; backup dir under the removed workdir. |
| Boundaries | PASS | Port validation: 0, 65536, overflow, `+`, hex, `1e4`, letters, newline payloads all exit 1 (live sh probes); blank → empty include (live container). Leading zeros / internal whitespace accepted but normalize to digits only — no injection, fail-safe downstream (Notes 1–2). judgeHttps strict equality rejects case/port/slash/credential variants (probed). |
| Security | PASS | nginx include injection: crafted ports exit 1 and kill the container (live); `set -f` blocks glob expansion. Env scrub: poison test :724-745 proves no interpolated var reaches any docker child. Restore writes only vlcheck_* volumes (selfcheck overlay hardcoded, test :161). SQL id is a literal — no injection surface. TLS relaxation is child-env-only and opt-in-gated (tests :765/:782, smoke-tls 3 cases). |

## Loaded-Skill Criteria
N/A — no skills loaded (dispatch has no `## Additional Skills`).

## Notes (non-blocking)
1. Leading-zero port accepted: `HTTPS_REDIRECT_PORT=08443` passes `^[0-9]{1,5}$` + range and renders `https://$host:08443`. nginx's integer parse tolerates it, but judgeHttps's strict Location equality (`:08443` vs expected `:8443`) would fail the https step named — fail-safe, not a defect. Confidence: high. Severity: low.
2. Internal whitespace stripped, not rejected: `84\n43` → `8443` (tr -d '[:space:]' at nginx/10-https-redirect.sh:17). Digits-only result makes injection impossible; an operator typo silently becomes a different valid port. Confidence: high. Severity: low.
3. judgeHttps HSTS array coercion: `headers['strict-transport-security'] = ['max-age=1']` → `String()` → ok:true (probed). node:http never produces arrays for HSTS (only set-cookie), so unreachable in practice; "non-empty" reading is literally satisfied. Confidence: high. Severity: low.
4. DW-2.6 "volumes:[] FAILs" is satisfied as the empty-backup shape (`volumes:[]` + missing dir, test :257). A manifest with `volumes:[]` but archives present passes — required by the unchanged good-backup fixture (:46). The two DW clauses only cohere under this reading. Confidence: high. Severity: informational.
5. "Existing 21 tests" counts `.test(` regex calls; actual top-level tests 18 → 20, zero removed lines. Confidence: high. Severity: informational.
6. judgeHttps called without the opts object throws TypeError (destructured `{ httpsBaseUrl }`); the sole caller (:438) always passes it. Confidence: high. Severity: low.
7. `restoreOk` (:492-493) would accept `heldCount===0 && restoredCount===0`; unreachable in the serial check because seed.status is asserted (:453) and nothing else deletes the row between seed and count. No `heldCount===1` assert, but no demonstrated path to a false green. Confidence: medium. Severity: low.
8. Default-8443 bind-check test self-skips when the port is held (Phase 1 Note 2) — the implementation behavior itself was verified live by the reviewer (held 8443 → `failed:'port'`, 0 exec calls). Confidence: high. Severity: low.
9. e2e typecheck carries 2 pre-existing TS2683 errors in `e2e/tests/viewer.spec.ts:100,374` (file untouched by both phases); changed TS files compile clean. Confidence: high. Severity: low (pre-existing, out of phase scope).

## Issues (if FAIL)
1. Coverage-level gap (f): `httpProbe` has no unit test.
   - File: scripts/selfhost-check.mjs:311-330
   - Demonstrated by: grep of scripts/test/*.test.mjs — zero references to httpProbe; every runCheck test injects `probe:`; routine is not exported, so no test can reach it as written. Reviewer live run proves it works, but the 100% level requires a repo test.
   - Fix: export httpProbe (or inject it through a testable seam) and add unit tests against a local node:http/https server: 301 + headers returned without following, self-signed TLS accepted, non-JSON body → undefined, timeout rejection.
2. Coverage-level gap (f): `fetchHealth` (and the changed `smokeSetup` delegation) has no unit test.
   - File: e2e/smoke-setup.ts:17-36 (fetchHealth), :38-54 (smokeSetup)
   - Demonstrated by: no test file references smoke-setup.ts (grep); smoke-tls.test.mjs imports only playwright.smoke.config.ts. Reviewer live run proves both branches work, but the 100% level requires a repo test.
   - Fix: a small node --test file that drives the compiled setup (or exports fetchHealth) against a local HTTP + self-signed HTTPS server: plain fetch branch, E2E_INSECURE_TLS=1 branch, strict-TLS refusal, non-2xx named error, unreachable named error.

**Verdict: FAIL — coverage level 100%: two new/changed routines without unit tests (httpProbe, fetchHealth). All eight DW items PASS; no demonstrated correctness defect.**

---

## Cross-Phase Coherence

- **Pins match the exposed interfaces.** The 12/13-step arrays (test :301/:711) match runCheck's `step()` call sequence exactly, including `restore` after `backup marker` and `https` after `healthy`. `composeArgs` test shape matches the real invocation (base+selfcheck[+https], `-p` project, subcommand last). judgeHttps tests import the real export with the real `(probes, { httpsBaseUrl })` signature (caller at :438). Env-key pins (HTTPS_PORT, HTTPS_REDIRECT_PORT, REQUIRE_HTTPS) match COMPOSE_INTERPOLATED (:165-171) and the compose files (test :599 re-derives the list from https.yml text). No test passes for the wrong reason: harnesses inject only exec/probe/time seams and drive the real runCheck, real verifyBackup, real backup fixtures (gzip+tar written to disk), real sh script execution, real config import in fresh children.
- **No regressions.** Plain mode: 11→12 steps is the intentional restore addition; env stays 4 keys plain / 5 https (:405, tests :556/:782); teardown order restart=no → `down -v --remove-orphans` intact (:210-216); scrub intact (:410, used at every docker child :416/:429/:440/:451/:457/:488/:537 + poison test :724-745). Plain smoke child keeps full TLS verification (:823). The 18 pre-existing verify-backup tests and all pre-existing selfhost-check tests survive with zero removed assertion lines.
- **End-to-end wiring agrees.** Script output path `/etc/nginx/https-redirect.conf` = nginx.conf:65 include = Dockerfile.frontend:59 COPY target; env name `HTTPS_REDIRECT_PORT` set by https.yml:29 = read by script :17; `HTTPS_REDIRECT_CONF` override honored (:16). Proven live end to end: entrypoint runs the script (log line), valid port → 301 with preserved path+query, bad port → container exit 1, unset → empty include + plain 200. Nested `${HTTPS_REDIRECT_PORT:-${HTTPS_PORT:-8443}}` renders correctly under Compose v5.7.0 (`config` exit 0).
- **Phase boundary.** Phase 3 (12f7e26) touches only docs/self-host.md (61+/6-, out of scope) — no code drift after f41850b. The coverage FAIL lives entirely in phase-2 files; phase 1 introduced no gap (its deliverables are the tests themselves).
- No cross-phase defect demonstrated. The stale red-first comment (Phase 1 Note 1) is the only phase-1 artifact left outdated by phase 2 — cosmetic.

## Overall Verdict

**FAIL** — batch blocked by Phase 2's Test Coverage Level gap (f): `scripts/selfhost-check.mjs:httpProbe` and `e2e/smoke-setup.ts:fetchHealth` (+ changed `smokeSetup` body) have no unit tests. Phase 1 is clean. All 10 DW items across both phases PASS with execution evidence; no failing test, no demonstrated correctness defect, no cross-phase seam defect. Fix scope: add the two unit-test files (or testable seams) named in Phase 2 Issues; nothing else needs touching.

---

## Re-review after fix-forward (2026-11-19)

Re-reviewer: independent, read-only. Repo `.workers/W3/virtual-lab`, branch `P5b-selfhost-https-restore`, HEAD `7fce7d2`, working tree clean (`git status --porcelain` empty before and after). Scope: the two coverage-level (f) gaps from the batch FAIL above; functional DW-2.1-2.8 spot-checked for drift only. Heartbeats sent before/after (`wk.sh beat W3 review P5b`).

### Executed Results

- `npm run test:scripts` -> **88 pass, 0 fail, 0 skipped, 0 cancelled** (`tests 88 / pass 88 / fail 0 / cancelled 0 / skipped 0 / duration_ms 18222.1677`, exit 0). No hang (<3 min). 79 -> 88 = exactly the 9 new tests. All 9 ran (openssl 3.5.7 present, so no `{ skip: !hasOpenssl }` case skipped):

```
ok httpProbe: a 301 comes back with its headers and the redirect is NOT followed (64.9753ms)
ok httpProbe: a JSON body is parsed; a non-JSON body is undefined, never a throw (24.3854ms)
ok httpProbe: https with the stack's self-signed cert is accepted (rejectUnauthorized:false) (434.8049ms)
ok httpProbe: a silent server hits the timeout and rejects with the named error (166.6929ms)
ok smokeSetup: plain HTTP health passes and the banner names API build and db (353.9502ms)
ok smokeSetup: self-signed HTTPS passes with E2E_INSECURE_TLS=1 + NODE_TLS_REJECT_UNAUTHORIZED=0 (620.5766ms)
ok smokeSetup: strict TLS refuses the self-signed cert - named Cannot reach, not a raw stack (298.2929ms)
ok smokeSetup: a non-2xx health answer is refused with the status, not treated as up (299.1532ms)
ok smokeSetup: an unreachable base URL is the Cannot reach error with the start hint (298.076ms)
```

- `node --test backup/restore.test.mjs` -> **4 pass, 0 fail** (`tests 4 / pass 4 / fail 0 / cancelled 0 / skipped 0 / duration_ms 3437.7068`, exit 0).

### Export diff audit

`git show 7fce7d2 -- scripts/selfhost-check.mjs` - exactly one hunk, 1+/1- (numstat `1 1`):

```
-async function httpProbe(url, timeoutMs = 5000) {
+export async function httpProbe(url, timeoutMs = 5000) {
```

Truly one word. Body :312-330 byte-identical; the sole internal call site (`probe = httpProbe` default, scripts/selfhost-check.mjs:348) untouched. Behavior unchanged.

### No existing test weakened/skipped/deleted

`git show 7fce7d2 --numstat`: exactly 3 files - `scripts/selfhost-check.mjs` (1/1, the export), `scripts/test/selfhost-probe.test.mjs` (102/0, new), `scripts/test/smoke-setup.test.mjs` (142/0, new). Zero deletions in any test file; no pre-existing test file touched at all. `git diff f41850b 7fce7d2` on all six pre-existing phase test files: empty. Suite skip count 0.

### Gap 1 - httpProbe unit test: CLOSED

PREMISE (prior Issue 1): export httpProbe + unit tests against local servers: 301 + headers without following, self-signed TLS accepted, non-JSON body -> undefined, timeout rejection.
EVIDENCE: scripts/test/selfhost-probe.test.mjs (read fully, 102 lines). Imports the real export (:22). Real `node:http`/`node:https` servers on 127.0.0.1 **port 0** (:43), closed in `finally` with `closeAllConnections` (:46, :65, :80, :94, :101); cert generated per-run via the image's own `nginx/make-cert.mjs` into a mkdtemp dir, removed in `test.after` (:31-37) - nothing committed.
Meaningfulness (not tautologies):
- :52-66 - server counts hits on the redirect target and the test asserts `redirectedHits === 0` (:64) plus exact `status`, `headers.location`, custom header round-trip. Proves no-follow against real server behavior, not a mock.
- :68-81 - real JSON body deep-equals `{status:'ok'}`; HTML body resolves `body: undefined` without throw (:79). Drives the real `JSON.parse` catch at selfhost-check.mjs:321.
- :83-95 - real self-signed TLS listener; probe resolves 200 + parsed body + HSTS header, proving `rejectUnauthorized:false` (:315) on the https branch (:313).
- :97-102 - server accepts and never answers; `assert.rejects(..., /probe timed out after 150ms/)` drives the real timeout->destroy path (:326).
TRACE: each test -> real socket -> real httpProbe code path -> asserted observable output. All 4 green in the suite run above.
VERDICT: **PASS - gap closed.**

### Gap 2 - fetchHealth/smokeSetup unit test: CLOSED

PREMISE (prior Issue 2): test driving the setup against local HTTP + self-signed HTTPS servers: plain fetch branch, E2E_INSECURE_TLS=1 branch, strict-TLS refusal, non-2xx named error, unreachable named error.
EVIDENCE: scripts/test/smoke-setup.test.mjs (read fully, 142 lines). Fresh node child per case imports the real `e2e/smoke-setup.ts` (:60, node 24 type-stripping; smoke-tls.test.mjs technique) and calls the real default export `smokeSetup` -> real `fetchHealth`. **Async** spawn (:67) so the parent keeps serving its port-0 servers; env built per case with explicit unset of `E2E_INSECURE_TLS`/`NODE_TLS_REJECT_UNAUTHORIZED` (:64-65, :76); 30s child kill guard (:71); servers closed in `finally`, cert dir removed in `test.after` (:38).
Meaningfulness - asserts child exit codes AND exact stdout/stderr strings produced by the real code (e2e/smoke-setup.ts:44-53), against real servers:
- :78-89 - plain HTTP: server asserts the request path is `/api/health` (:80); child exit 0, banner `smoke -> <url> (API 9.9.9-test, db connected)` - exercises the fetch branch (:18) AND smokeSetup's json()/build/db shape (:52-53), i.e. the changed delegation body too.
- :91-104 - self-signed HTTPS with `E2E_INSECURE_TLS=1` + `NODE_TLS_REJECT_UNAUTHORIZED=0` (mirrors the driver's child env, selfhost-check.mjs:506-511): exit 0 + banner - exercises the node:https opt-in branch (:19-35) end to end.
- :106-119 - same cert, opt-in unset: exit 1, `Cannot reach <url>` + `docker compose up -d` hint + `fetch failed` carried - proves strict TLS stays on by default (undici refuses).
- :121-131 - real 503 answer: exit 1, `<url>/api/health returned 503` + `the API or its database is down` - drives `health.ok === false` (:49-50).
- :133-142 - port taken then released, nothing listening: exit 1, `Cannot reach` + hint + `E2E_BASE_URL` - drives the catch wrapper (:42-47).
TRACE: each case -> real child running real TS -> real fetch/node:https against a real local listener -> asserted exit code + message. All 5 green.
VERDICT: **PASS - gap closed.**

### Functional spot-check (prior DW-2.1-2.8 PASS evidence still holds)

`git diff f41850b 7fce7d2 --stat`:

```
 docs/self-host.md                    |  67 +++++++++++++++--
 scripts/selfhost-check.mjs           |   2 +-
 scripts/test/selfhost-probe.test.mjs | 102 +++++++++++++++++++++++++
 scripts/test/smoke-setup.test.mjs    | 142 +++++++++++++++++++++++++++++++++++
 4 files changed, 306 insertions(+), 7 deletions(-)
```

Only implementation-side change since f41850b is the single export keyword (behavior-neutral, call site unchanged); `docs/self-host.md` is phase-3 commit 12f7e26, out of scope as before. nginx script, compose overlays, judgeHttps, restore step, verify-backup, smoke config/setup bodies all byte-identical to the reviewed f41850b - the prior live-probe/injection-battery/restore-isolation evidence carries over unchanged. All 79 pre-existing suite tests still green inside the 88.

### Notes (non-blocking)

1. `fetchHealth`'s node:https 15s-timeout line (e2e/smoke-setup.ts:32) is not directly exercised by the 5 cases (httpProbe's timeout is). The routine has unit tests on both branches and all named error paths, which is what the 100% level (routine granularity) and the prior fix prescription require - note, not a gap. Confidence: high. Severity: trivial.
2. smoke-setup.test.mjs:133-136 releases an ephemeral port before probing it; a racing process could theoretically grab it in between. Port-0 allocation makes this negligible; observed green. Confidence: high. Severity: trivial.
3. Both new files gate TLS cases on `openssl` availability (`{ skip: !hasOpenssl }`) - honest, marked skips; on this host all ran (skip count 0). On an openssl-less host 3 of 9 would skip visibly. Confidence: high. Severity: informational.

### Verdict

Both coverage-level (f) gaps closed with meaningful, hermetic repo tests; export diff is one word; no existing test weakened; suites 88/88 and 4/4 green; no implementation drift beyond the export.

**PASS**
