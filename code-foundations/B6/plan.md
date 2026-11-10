# Plan: B6 — author publish keys + drafts an admin accepts: close the gaps, harden, security review
**Created:** 2026-11-10 (Claude, architect lane)
**Status:** ready
**Complexity:** moderate
**Review cadence:** 1
**Check-ins:** quiet
---
## Context
Personal publish keys, roles, ownership, the draft (`pending` version) an admin accepts, the audit journal and
the admin "Доступ" page already shipped in virtual-lab as "Nocturne release 2" (merged `93608dd`, 2026-10-29).
The card's migration `006` / `pending_archive_sha256` column are obsolete and **must not be built**. What remains:
keys still travel over plain HTTP, a lost key cannot be rotated without orphaning a teacher's scenarios, cover
uploads are unlimited, `approve` can publish bytes nobody reviewed, a recreated scenario id reads its
predecessor's history, the test suite does not pin BOLA for future routes, and no adversarial security review was
done. Card: `tasks/B-milestone-1.md` § B6. Research, evidence and every decision: `code-foundations/B6/research.md`
— **read it first; its Findings and Decisions are binding.**

**Success criteria:**
1. With `REQUIRE_HTTPS=true`, no credential is accepted over plain HTTP (403 `https_required`, before any DB
   lookup), and it is accepted over P5a's 443 listener and behind the lti-demo TLS proxy.
2. A moderator rotates a key: the old token is refused everywhere at once; the new one owns every scenario the old
   one owned; the token is returned once with `Cache-Control: no-store`.
3. Author key B cannot read or change anything of author A's scenario through **any** registered route (generated
   sweep), nor escalate scope through body fields; a revoked or rotated-away key is refused on every write route.
4. `approve` with a stale `versionId` is a 409 and publishes nothing; the admin UI always sends it.
5. Preview uploads are rate-limited per author key; history of a deleted scenario is invisible to the next owner
   of its id.
6. No token or token hash appears in captured logs during a full key life cycle.
7. An adversarial security review (Phase 7) finds no open high/medium issue; its report is in
   `code-foundations/B6/security-review.md`.
8. All checks green: backend `npm run test:unit` + full `npm test` on the test Postgres with **0 skipped**,
   frontend `npx ng test --no-watch`, `npm run build && npm run check:csp`, e2e specs named in the DWs.

## Constraints
- Repo: virtual-lab only (+ this task's `.claude-shared` notes and ROADMAP row in the last phase).
- **No new migration.** No change to `publish_keys`/`scenarios`/`scenario_versions`/`audit_events` schema.
- Backward compatible: `ADMIN_TOKEN` stays the bootstrap moderator; un-prefixed keys stay valid; `approve` without
  `versionId` behaves as today; `REQUIRE_HTTPS` defaults to off.
- Never log, audit or echo a token or its hash. Tokens only in a 201 body with `no-store`.
- UI strings Ukrainian; code and comments English; `docs/code-standards.md` applies.
- **Locks:** every run of the Postgres suite (`docker-compose.test.yml`, port 55432) and every run of the full
  Docker stack for e2e happens inside `bash R/.workers/wk.sh lock vl-db W<n> B6` … `unlock vl-db W<n>`.
- Backend green means the README command (`DB_HOST=localhost DB_PORT=55432 DB_NAME=virtual_lab_test
  DB_USER=test_user DB_PASSWORD=test_password ADMIN_TOKEN=ci-admin-token npm test`) with `# skipped 0` in its
  summary — the integration files skip silently without a database.
- Depends on P5a being merged (443 listener, HSTS map in `nginx/nginx.conf`); merge `origin/main` before Phase 2.
- Anything this plan does not answer is a question: park the task (ATTENTION), do not guess.

---
## Implementation Phases

### Phase 1: Token format and constant-time bootstrap comparison
**Skills:** code-foundations:cc-defensive-programming
**Model:** sonnet
**Gate:** Full
**Security-sensitive:** yes
**Depends on:** none
**File scope:** backend/auth.js, backend/routes/keys.js, backend/server.js (start-up warning only), backend/test/unit/auth-and-limits.test.js, backend/test/integration/keys.test.js

**Goal:** new keys are recognisable; no comparison branches on secret length; weak bootstrap tokens are reported.

**Scope:**
- IN: `generateToken()` in `auth.js` → `'vlk_' + randomBytes(32).toString('base64url')`, used by POST `/api/keys`;
  `tokensMatch` compares `sha256(provided)` and `sha256(expected)` digests with `timingSafeEqual` (no length
  branch); start-up `console.warn` when `ADMIN_TOKEN` is set and shorter than 32 characters (message names the
  length rule, never the value). Export `generateToken` for Phase 3.
- OUT: HTTPS (Phase 2), rotation (Phase 3). `test/helpers/keys.js` stays un-prefixed on purpose (it proves legacy
  keys keep working).

**Edge cases:** an empty `ADMIN_TOKEN` (bootstrap off) never matches an empty bearer; a 512-char token is still
refused before hashing (`MAX_TOKEN_LENGTH`); a legacy un-prefixed key still authenticates.

**Done when:**
- [ ] DW-1.1: unit: `generateToken()` matches `/^vlk_[A-Za-z0-9_-]{43}$/`; 1 000 calls give 1 000 distinct values.
- [ ] DW-1.2: unit: `tokensMatch` returns false for a different-length token without throwing, true for equal; source check in the test: `auth.js` contains no `a.length === b.length` style branch before `timingSafeEqual` (assert both inputs to `timingSafeEqual` are 32-byte digests by spying `crypto.timingSafeEqual`).
- [ ] DW-1.3: integration: POST `/api/keys` returns a `vlk_` token whose SHA-256 is the stored `token_hash`, and that token authenticates `/api/auth/me`; a key from `test/helpers/keys.js` (no prefix) also authenticates.
- [ ] DW-1.4: unit: with `ADMIN_TOKEN='short'` the start-up check warns once and the warning text does not contain `short`.

### Phase 2: HTTPS required for credentials
**Skills:** code-foundations:cc-defensive-programming
**Model:** sonnet
**Gate:** Full
**Security-sensitive:** yes
**Depends on:** Phase 1
**File scope:** backend/auth.js, backend/config.js, backend/server.js (warning only), nginx/nginx.conf (`map` + two `proxy_set_header X-Forwarded-Proto` lines), docker-compose.yml (pass `REQUIRE_HTTPS`), docker-compose.https.yml (set `REQUIRE_HTTPS: "true"`), .env.example, backend/test/unit/auth-and-limits.test.js, backend/test/unit/nginx-forwarded-proto.test.js, backend/test/integration/https-required.test.js

**Goal:** with the switch on, a credential is never accepted over plain HTTP; with it off nothing changes.

**Scope:**
- IN: `REQUIRE_HTTPS` read per request (like `bootstrapToken`), true only for the literal `true`/`1`;
  `authenticate` and `optionalAuthenticate`: a presented bearer with `!req.secure` → `403 {error:
  'Потрібне HTTPS-зʼєднання', code: 'https_required'}` before `resolvePrincipal` and **without**
  `failedAuth.consume`; no credential presented → unchanged (public routes keep working on :80).
  nginx: top-level `map $http_x_forwarded_proto $vl_forwarded_proto { default $scheme; https https; }`, used by
  `location /api/` and `location ^~ /api/lti/`. Start-up warning when off. `.env.example` documents it.
- OUT: UI (Phase 5); production switch-on (P5b, owner).

**Edge cases:** the lti-demo stack (two proxies, `TRUST_PROXY: 2`) must see `req.secure === true`; a client
header `X-Forwarded-Proto: https` sent straight to :80 passes the guard (accepted, research D4 — record it in the
test as a documented behaviour, not a bug); LTI routes are unaffected (they use cookies, not bearer).

**Done when:**
- [ ] DW-2.1: integration (supertest, `trust proxy` as in `server.js`): `REQUIRE_HTTPS=true` + valid moderator key + `X-Forwarded-Proto: http` → 403 `https_required`, `publish_keys.last_used_at` unchanged, and `failedAuth` not consumed (31 such calls from one address still answer 403, never 429).
- [ ] DW-2.2: same with `X-Forwarded-Proto: https` → 200 on `/api/auth/me`; with `REQUIRE_HTTPS` unset → 200 over http (today's behaviour); anonymous `GET /api/catalog` → 200 over http with the switch on.
- [ ] DW-2.3: unit test reads `nginx/nginx.conf`: the `map` exists and both `/api/` locations send `X-Forwarded-Proto $vl_forwarded_proto`; no location still sends `$scheme`.
- [ ] DW-2.4: recorded commands (in `code-foundations/B6/notes.md`), inside `vl-db.lock`: `docker compose -f docker-compose.yml -f docker-compose.https.yml up -d --build`, then `curl -k -H "Authorization: Bearer $ADMIN_TOKEN" https://127.0.0.1:8443/api/auth/me` → 200 and `curl -H … http://127.0.0.1:${FRONTEND_PORT}/api/auth/me` → 403 `https_required`.

### Phase 3: Key rotation and ownership transfer
**Skills:** code-foundations:cc-defensive-programming
**Model:** sonnet
**Gate:** Full
**Security-sensitive:** yes
**Depends on:** Phase 1
**File scope:** backend/routes/keys.js, backend/routes/ownership.js (new), backend/server.js (mount only), backend/test/integration/keys-rotate.test.js, backend/test/integration/ownership.test.js

**Goal:** a lost key is replaced without orphaning its scenarios; a moderator can hand a scenario to another key.

**Scope:**
- IN: `POST /api/keys/:id/rotate` (moderator): one transaction — lock the old key row (`FOR UPDATE`), insert a new
  key (same label, role, `generateToken()`), `UPDATE scenarios SET owner_key_id = new WHERE owner_key_id = old`,
  revoke the old key (`COALESCE(revoked_at, NOW())`), audit `key.rotate {fromKeyId, toKeyId, scenarios}`; 201
  `{id, label, role, token}` with `no-store`. `PUT /api/scenarios/:id/owner {keyId: number|null}` (moderator):
  404 unknown scenario, 400 malformed/unknown/revoked key, audit `scenario.owner {from, to}`; under `FOR UPDATE`.
  Id parsing as in revoke (`/^\d{1,10}$/`, ≤ INT max).
- OUT: UI (Phase 5). `scenario_versions.uploaded_by_key_id` is history and never rewritten.

**Edge cases:** rotate an already revoked key (allowed; old `revoked_at` kept); rotate a key that owns nothing
(`scenarios: 0`); rotate the caller's own key (allowed; the response is the caller's new token); two concurrent
rotates of one key → exactly one succeeds, the other 409 `'Ключ уже замінено'` (detect by the key being revoked
by a rotate in this transaction — use the lock and an audit-free re-check of a `key.rotate` row or compare
`revoked_at` before/after; pin with a test); an author or anonymous caller → 403/401.

**Done when:**
- [ ] DW-3.1: integration: author A owns 2 scenarios; rotate A → old token 403 on `/api/auth/me`, PUT `/api/catalog/:id` and archive upload; new token 200 on all three; both scenarios' `owner_key_id` = new id; one `key.rotate` audit row with `scenarios: 2`; response header `Cache-Control: no-store`.
- [ ] DW-3.2: integration: two parallel rotate requests for one key → one 201, one 409; exactly one new key row.
- [ ] DW-3.3: integration: owner transfer A→B: B edits, A gets 403; transfer to a revoked key → 400 and nothing changes; author caller → 403; `null` → only moderators can edit.
- [ ] DW-3.4: the route-table test (`route-table.test.js`) gains rows for both new routes (moderator/bootstrap allowed; every other caller denied, state unchanged).

### Phase 4: Approve bound to the reviewed version; history scoped; preview uploads limited
**Skills:** code-foundations:cc-defensive-programming
**Model:** sonnet
**Gate:** Full
**Security-sensitive:** yes
**Depends on:** Phase 1
**File scope:** backend/workflow.js, backend/routes/workflow.js, backend/audit.js, backend/routes/dashboard.js, backend/rate-limits.js, backend/config.js, backend/routes/previews.js, docker-compose.yml (pass `AUTHOR_PREVIEWS_PER_HOUR`), backend/test/unit/workflow.test.js, backend/test/integration/workflow-transitions.test.js, backend/test/integration/audit.test.js, backend/test/integration/rate-limits.test.js

**Goal:** close research findings F5, F6, F4.

**Scope:**
- IN: `applyTransition(..., { note, versionId })`: for `approve` with `versionId` given, the `current` version
  id read under the row lock must equal it, else 409 `'Архів змінився після перевірки'` and nothing written;
  route parses `versionId` (positive int ≤ INT max, else 400). `listActivity({ scenarioId, sinceScenarioCreated })`:
  for non-moderators, `/history` and the dashboard return only events with `a.created_at >= s.created_at` of the
  live row. `authorPreviews` counter (`AUTHOR_PREVIEWS_PER_HOUR`, default 30) and `limitAuthorPreviews` before
  `receivePreview`.
- OUT: UI sending `versionId` (Phase 5); bulk approve (moderator-authored decision, unchanged — note in review).

**Edge cases:** approve without `versionId` → unchanged; approve of a scenario with no current version → existing
409 first; moderator `/history` still sees the full id history (they need it); preview DELETE is not counted.

**Done when:**
- [ ] DW-4.1: integration: moderator reads current version v1; author withdraws, uploads v2, submits; approve `{versionId: v1}` → 409, status stays `review`, current stays v2, no `scenario.approve` audit row; approve `{versionId: v2}` → 200 published.
- [ ] DW-4.2: integration: author A's `x` with 3 events is deleted by a moderator; author B creates `x`; B's `/api/scenarios/x/history` and dashboard activity contain only B-era events; the moderator's `/history` contains both eras.
- [ ] DW-4.3: integration: with `AUTHOR_PREVIEWS_PER_HOUR=2`, the 3rd preview upload by one author key → 429 with `Retry-After`, before the body is stored (temp dir and preview store unchanged); a moderator key is not limited; archive uploads of the same key are unaffected.

### Phase 5: Admin UI — secure-context sign-in, rotate, transfer, owner visible, approve sends the version
**Skills:** code-foundations:cc-defensive-programming, code-foundations:code-clarity-and-docs
**Model:** sonnet
**Gate:** Full
**Security-sensitive:** yes
**Depends on:** Phases 2, 3, 4
**File scope:** frontend/src/app/services/admin-api.service.ts, frontend/src/app/services/admin.service.ts, frontend/src/app/models/admin.model.ts, frontend/src/app/pages/admin/admin-login.component.ts (+ .spec.ts), frontend/src/app/pages/admin/access/access.component.ts (+ .spec.ts, .scss), frontend/src/app/pages/admin/scenario-list/* , frontend/src/app/pages/admin/scenario-edit/* (owner line + transfer only), frontend/src/app/pages/admin/queue/queue.component.ts (+ .spec.ts), frontend/src/app/pages/admin/upload-wizard/upload-wizard.component.ts (+ .spec.ts)

**Goal:** the UI uses the new safety and shows who owns what.

**Scope:**
- IN: sign-in and key issue disabled with a banner (`'Вхід можливий лише через HTTPS'`) when
  `!window.isSecureContext` (inject a token for tests); a 403 `code: 'https_required'` shows the same message and
  does not store the code; access page: "Замінити" (rotate) → the one-time dialog as for issue, owned-scenario
  count per key, keys unused ≥ 180 days marked (display only, research Q3); owner label in the scenario list and
  editor header; moderator-only "Передати" (owner transfer) in the editor; `transition(id,'approve')` sends
  `{versionId: row.currentVersion.id}` from queue and wizard; a 409 there reloads the row and says the archive
  changed.
- OUT: anything in the editor repo (B7).

**Edge cases:** rotating the session's own key replaces the stored session code with the new token (no
sign-out); the one-time token is cleared by every close path (as issue does today); author UI never shows
rotate/transfer.

**Done when:**
- [ ] DW-5.1: spec: with `isSecureContext=false` the sign-in button is disabled, the banner shows, and `sessionStorage` stays empty after submit.
- [ ] DW-5.2: spec: rotate shows the token once; closing clears it; rotating the own key keeps the session signed in with the new code.
- [ ] DW-5.3: spec: queue approve posts `{versionId}` equal to `currentVersion.id`; a 409 shows the "archive changed" message and refreshes.
- [ ] DW-5.4: spec: owner label rendered in list and editor; transfer visible to moderator only.
- [ ] DW-5.5: `npx ng test --no-watch`, `npm run build && npm run check:csp` green.

### Phase 6: Security test suite — rights table, BOLA sweep, reuse, escalation, logs
**Skills:** code-foundations:cc-quality-practices
**Model:** sonnet
**Gate:** Full
**Security-sensitive:** yes
**Depends on:** Phases 3, 4
**File scope:** backend/test/integration/rights-table.test.js (new), backend/test/integration/bola-sweep.test.js (new), backend/test/integration/key-logs.test.js (new), backend/test/helpers/routes.js (new), e2e/tests/admin-moderation.spec.ts

**Goal:** pin the card's review focus so a future route cannot regress it.

**Scope:**
- IN: (a) **rights table**: one test per §7 row × {author owner, author other, moderator, bootstrap,
  revoked, rotated-away, anonymous}, including every "Ні" cell, asserting status **and** unchanged DB state;
  (b) **BOLA sweep**: `helpers/routes.js` enumerates `app._router.stack` (and nested routers) for every
  method+path containing `:id`; author B calls each against author A's scenario with a minimal body/file;
  expected 403 or 404 (never 2xx), and an explicit allow-list for public reads (`GET /api/catalog/:id`) — a new
  route not in the list and not refusing fails the test; (c) **escalation bodies**: author sends `role`,
  `ownerKeyId`, `owner_key_id`, `status`, `isPublished`, `archiveSha256`, `scenarioUrl` on create/update →
  400 or ignored, and the row never changes those columns; author calls accept/restore/test-run/bulk/keys/
  owner/storage → 403; (d) **logs**: capture `console.log/warn/error` through issue → use → upload → rotate →
  revoke → failed auth; the issued tokens and their SHA-256 hex never appear; (e) e2e: extend DW-7.6 flow with
  rotate (old code refused in a fresh context, new code sees the scenario) and stale-approve message.
- OUT: statistical timing tests (research F8e: covered by construction in DW-1.2).

**Done when:**
- [ ] DW-6.1: rights-table and escalation tests pass; the test file lists the §7 rows verbatim in comments, one `describe` each.
- [ ] DW-6.2: BOLA sweep enumerates ≥ the number of `:id` routes counted by `grep -c "/:id" backend/routes/*.js` (recorded in notes) and passes; a deliberately added unprotected dummy route in a throwaway local edit makes it fail (recorded in notes, edit reverted, not committed).
- [ ] DW-6.3: log test passes; it fails if `console.log(token)` is added to `routes/keys.js` (checked locally, reverted).
- [ ] DW-6.4: full backend suite inside `vl-db.lock`: `# fail 0`, `# skipped 0`; e2e `npx playwright test admin-moderation admin-workflow draft-preview` → all passed (stack inside `vl-db.lock`).

### Phase 7: Adversarial security review
**Skills:** code-foundations:aposd-verifying-correctness, code-foundations:cc-defensive-programming
**Model:** opus (the card asks for an Opus review; sonnet only if opus is unavailable — say so in the report)
**Gate:** Full
**Security-sensitive:** yes
**Depends on:** Phases 5, 6
**File scope:** .claude-shared/code-foundations/B6/security-review.md (new); fixes only inside files already in Phases 1–6 scope, each with its own regression test

**Goal:** an independent attacker's read of the whole key/draft surface, not of the diff alone.

**Scope:**
- IN: review against OWASP API Security Top 10 (2023) API1 BOLA, API2 broken auth, API3 property-level auth
  (mass assignment), API4 resource consumption, API5 function-level auth, API8 misconfiguration; the card's
  focus (timing-safe compare, hash only in DB, no key in logs, no route lets an author key touch another key's
  scenario); every route in `server.js` order; `auth.js`, `workflow.js`, `versions.js`, `archives.js`,
  `catalog-admin.js`, `previews.js`, `version-tools.js`, `keys.js`, `ownership.js`, nginx `/api/` and
  `/scenarios/` locations (no autoindex, no Authorization in `log_format`), frontend session storage and CSP;
  try each attack against the running test stack and record request/response. Findings high/medium are fixed in
  this phase (regression test each); low ones become `⬜` follow-up rows (Phase 8).
- OUT: LTI module (reviewed in P1) except where it shares `auth.js`.

**Done when:**
- [ ] DW-7.1: `security-review.md` has one section per OWASP item above and per card focus point, each with verdict (pass / finding), evidence (file:line or request/response) and, for findings, the fix commit and its test.
- [ ] DW-7.2: every "Accepted, not changed" item of research.md is re-examined and either confirmed with reasoning or turned into a finding.
- [ ] DW-7.3: no open high/medium finding; full checks (backend 0 fail 0 skipped, frontend, CSP check) green after the fixes.

### Phase 8: Docs, API contract for B7, ROADMAP
**Skills:** code-foundations:code-clarity-and-docs
**Model:** sonnet
**Gate:** Minimal
**Depends on:** Phase 7
**File scope:** virtual-lab/docs/publish-api.md (new), virtual-lab/docs/test-plan.md (new rows), virtual-lab/docs/privacy.md (audit retention line), virtual-lab/CLAUDE.md (test counts, `REQUIRE_HTTPS`), virtual-lab/.env.example (if not done), .claude-shared/ROADMAP.md (B6 row + follow-ups), .claude-shared/tasks/B-milestone-1.md (B6 status line), .claude-shared/CHANGELOG.md (virtual-lab section), .claude-shared/code-foundations/B6/*

**Goal:** the owner and B7 find what landed and how to use it.

**Done when:**
- [ ] DW-8.1: `docs/publish-api.md` documents for the editor: key format (`vlk_…`, legacy accepted), `GET /api/auth/me`, `GET /api/admin/scenarios`, `POST /api/scenarios/from-archive`, `POST /api/scenarios/:id/archive` (answer per status: current vs pending, 409 in review), `submit`/`withdraw`, errors (401/403/`https_required`/404/409/413/429 + `Retry-After`), "HTTPS only; keep the key for the tab", examples produced by running `curl` against the test stack (pasted output).
- [ ] DW-8.2: B6 card status line says it was delivered by Nocturne release 2 + this task, and that migration `006`/`pending_archive_sha256` were superseded by `009`/`010`; ROADMAP B6 → `✅ <date> W<n>` + what landed; each low review finding is a `⬜` row; Q1–Q4 appended to `tasks/OWNER-DECISIONS.md` with the recommendations (blank Answer).
- [ ] DW-8.3: `.claude-shared/CHANGELOG.md` virtual-lab entry; `privacy.md` states audit retention as assumed (Q2).

---
## Test Coverage
**Level:** 100% of new/changed routines; every route × caller cell of §7.
## Test Plan
- [ ] Every DW has a named test (or recorded command output for DW-2.4, 6.2, 6.3, 8.1).
- [ ] Dirty tests: 513-char bearer; `Bearer ` with empty token; `bearer` lowercase scheme; `X-Forwarded-Proto: http, https`; `versionId` `0`, `-1`, `2147483648`, `"1"`, `1.5`; rotate id `abc`/`99999999999`; transfer `keyId` of a revoked key; a key revoked mid-request (revoke between auth and write → the write's own row-lock check still uses the principal; document behaviour); concurrent rotate.
- [ ] Integration: issue → author upload → submit → approve(bound) → author upload to published (pending) → accept → rotate → old refused, new owns.
- [ ] Manual: none (DW-2.4 is a recorded command run).

## Assumptions
| Assumption | Confidence | Verify Before Phase | Fallback If Wrong |
|---|---|---|---|
| P5a is merged with `listen 443 ssl` and `docker-compose.https.yml` as on `origin/P5a-backups-restore-https` (`a3eb34f`) | high | 2 | adapt DW-2.4 to the merged file names; if P5a changed to an external TLS proxy, the `map` already covers it |
| Owner Q1–Q4 answered as recommended (no delivery channel, keep audit indefinitely, no expiry, author keys only after `REQUIRE_HTTPS` is on in production) | medium | 8 | change only docs/UI hint (Q3) — no code depends on Q1/Q2/Q4 |
| One backend process (in-memory rate limits are enough) | high | 4 | note in review; a shared store is a separate task |
| `app._router.stack` exposes every route incl. the LTI sub-router (Express 4) | high | 6 | enumerate routers explicitly in `helpers/routes.js` |
| The full e2e stack's fixed container names/ports collide between workers, so it runs inside `vl-db.lock` | high | 6 | — |

## Decision Log
| Decision | Alternatives Considered | Rationale | Phase |
|---|---|---|---|
| Do not build card's migration 006 / `pending_archive_sha256` | build as card says | superseded by 009/010 (versions + roles), already deployed | all |
| `vlk_` prefix, SHA-256 of whole token, no pepper | bcrypt/argon2; HMAC pepper; id-prefixed tokens | 256-bit random tokens: fast hash is correct; prefix aids secret scanning | 1 |
| Backend `REQUIRE_HTTPS` + nginx proto map + secure-context UI | nginx-only redirect | redirect still leaks the first request; fail-closed in the app; works behind two proxies | 2, 5 |
| Rotate moves ownership | revoke + manual reassignment | a lost key must not orphan a teacher's work | 3 |
| `versionId` optional on approve | required | scripts and `PUT {isPublished}` keep working; UI always sends it | 4 |
| Separate preview counter | share the archive counter | covers must not eat the archive budget | 4 |
| No auth-failure audit rows | audit failures | anonymous callers could grow the table; limiter covers it | 4 |
| Opus for the review phase | sonnet | card: "Sonnet + Opus security review" | 7 |

---
## Notes
- Phases 2, 3, 4 share only `backend/auth.js`/`server.js`/`config.js` with Phase 1 or each other: run 1 → 2 → 3 → 4 serially (hub files `auth.js`, `server.js`, `config.js`); 5 and 6 may run in parallel after 4 (disjoint scopes); 7 after both.
- Every Full-gate review must re-run DW-2.1, DW-3.1 and DW-4.1 itself, not trust the phase report.
- Owner questions Q1–Q4: research.md § Owner questions.
- For B7: the editor stores the key per tab, refuses non-HTTPS origins except localhost, and validates `^vlk_` only as a hint (legacy keys exist).
---
## Decided During Build
_Filled by /code-foundations-build — one row per decision an agent made or question it raised:_
| # | Phase | Decision or question | Source | Status |
---
## Execution Log
_To be filled during /code-foundations-build_
