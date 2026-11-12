# B6 security review (phase 7, DW-7.1–7.3)

Independent adversarial pass over the whole publish-key/draft surface of
`B6-platform-publish-keys-harden` (8 commits, `origin/main..HEAD`), not just the diff:
`auth.js`, `workflow.js`, `versions.js`, `archives.js`, all `routes/*.js`, `nginx/nginx.conf`
(`/api/`, `/scenarios/`), `docker-compose.yml` and the frontend session/CSP surface. Live
evidence from the composed stack on `http://127.0.0.1:8044` and from a probe of the real
`auth.js`. Every route in `server.js` order was classified and, where the verdict is "pass",
tried: 52 method+path entries, 26 with a parameter.

Verdicts are for this platform: teachers with personal keys, students anonymous, one
moderator (the bootstrap).

## Findings

| id | severity | OWASP / focus | state |
|---|---|---|---|
| F-R1 | **medium** | API2 broken authentication — a revocation is not atomic with an in-flight request | **fixed** in this phase, with a regression test |
| F-R2 | low | API8 misconfiguration — the nginx comment on `$vl_forwarded_proto` asserts what the map does not do | **fixed** (comment) in this phase |
| F-R3 | low | API3 — the journal's era filter is anchored to the row, not to the owner, so a transferred scenario hands its new owner the previous owner's journal | follow-up row ⬜ |
| F-R4 | low | API4/API1 — `POST /api/telemetry/session` is an unauthenticated existence oracle over hidden scenario ids | follow-up row ⬜ |
| F-R5 | info | the sweep's public-read allow-list names three routes the app no longer serves | follow-up row ⬜ |
| F-R6 | info | the shipped `.env` carries a 26-character `ADMIN_TOKEN`; the new start-up warning fires as designed | owner (P5b) |

### F-R1 — a key revoked mid-request still wrote · medium · API2 · fixed

`auth.js` resolved the principal once, at the start of the request; every write route then
re-checked only *ownership* under its row lock, never `revoked_at`.

Reproduction against the live stack (key `25`, `rev-D-race`, owning `b6-rev-target`):
a 31 MB `POST /api/scenarios/b6-rev-target/archive` started streaming at `03:21:56`;
`POST /api/keys/25/revoke` answered `200` at `03:22:12.095`; a *new* request with the token
was correctly `403`; the in-flight upload answered **`201`** at `03:23:23.938` and committed
`scenario_versions` row 36 (`state=pending`, `bytes=31467335`) plus a `scenario.archive`
journal row. The window was the whole body stream — nginx allows `client_max_body_size 512m`
and `proxy_send_timeout 300s` against `MAX_ARCHIVE_BYTES` 200 MB.

**Fix.** `auth.requireLiveKey(db, principal)` re-reads the key row `FOR UPDATE` as the
**first** statement of every write transaction, and throws `httpError(403, 'Ключ відкликано')`
when it is gone or revoked. It is called in `workflow.applyTransition`, `versions.installUpload`,
`routes/{archives,catalog-admin,previews,versions,version-tools,ownership,keys,categories,storage-admin}.js`
— so create, edit, delete, upload, from-archive, every transition, accept/reject/restore,
version delete, checks, cover set/remove, transfer, key create/rotate/revoke, category
mutations and gc. Ordering note: the key row is locked *before* any scenario row, which is
the order `rotate` uses, so a rotation and a write cannot deadlock.
`routes/archives.js` also carries an unlocked pre-read (`revokedAlready`) before the bytes are
stored, so a revoked key's upload is never even written to disk — the transaction's guard is
the authority, the pre-check only saves bytes the garbage collector would have to reclaim.

**Regression test.** `test/integration/key-revocation-race.test.js`: a multipart upload
streamed half at a time over a real `http` listener with the key revoked while the body is in
flight; asserts 403 `Ключ відкликано`, no version row, no journal row, no stored object and
an untouched scenario row; plus a live key still uploading and submitting, and a guard-level
test that a revocation landing while the transaction is open is refused. Mutation check:
with the two guards disabled the test fails (`no object was stored`), with them it passes 10/10.

Full checks after the fix (DW-7.3): backend `npm test` **1658 tests, 1658 pass, fail 0,
skipped 0**; frontend `npx ng test --no-watch` **770 passed (50 files)**, `npm run build` and
`npm run check:csp` exit 0; e2e `admin-moderation admin-workflow draft-preview` **20 passed**
against the rebuilt stack. Two intermediate frontend runs showed 4–7 five-second timeouts
(`icon-generator`, `icon.component`, `scenario-edit`, `upload-wizard`); each passes in
isolation and the same suite was green in the run before and after — the documented
load-bound flake, not the fix, which touches no frontend file.

### F-R2 — the nginx comment asserts what the map does not do · low · API8 · fixed (comment)

`nginx/nginx.conf:12-14` claimed "a client cannot set it when it arrives on :80 directly, so
the value here names the real listener", while line 15 maps `$http_x_forwarded_proto`, which
*is* the client's header. Verified on a probe of the real `auth.js` with `REQUIRE_HTTPS=true`
and `trust proxy 1`: a client-supplied `X-Forwarded-Proto: https` passes the guard, `http` and
`http, https` do not. Impact is nil today — a client that spoofs only puts its own key on the
wire (research D4) — but the comment would mislead the next maintainer into believing the
guard is enforced. The comment now states exactly that, and where a second TLS proxy really
stands in front (the lti-demo stand).

### F-R3 — a transferred scenario hands its new owner the old owner's journal · low · API3

`audit.js:40` anchors the era filter to `scenarios.created_at`, i.e. the row's whole life.
F6's fix covers a deleted-and-recreated id, not a transfer. Live: after
`PUT /api/scenarios/b6-rev-target/owner {"keyId":21}`, key `21` read the previous owner's
`scenario.create`, `scenario.archive`, `scenario.submit` and `scenario.update` events through
both the dashboard and `/api/scenarios/:id/history`. Low: it takes a deliberate moderator
transfer, and the version list already carries `uploadedByKeyId`/`uploadedByLabel` for the
same scenario. Follow-up row ⬜.

### F-R4 — telemetry is an anonymous existence oracle for hidden ids · low · API4/API1

`scenarioExists` (`db.js:39-42`) filters nothing by status, so
`POST /api/telemetry/session {"scenarioId":"<a draft slug>"}` answers `201` while a bogus id
answers `404`: a yes/no oracle over the slug space with no credential. Rate-limited
(300/15 min) and the rows are tiny, so the consumption half is negligible; the disclosure
half is the finding. Fix: bind the insert to published rows. Follow-up row ⬜.
(The anonymous half of the 409-on-taken-id acceptance below is worse than research recorded
and is this same oracle.)

### F-R5 — the sweep's allow-list names dead routes · info

`test/helpers/routes.js:54-61` lists `GET /api/scenarios/:id`, `GET /play/:id`,
`GET /api/scenarios/:id/manifest`, none of which the live app serves (52 entries, 26 with a
param, none of those three). The allow-list is a superset today so the sweep is not weakened,
but a future route with one of those exact paths would be silently skipped. Follow-up row ⬜.

### F-R6 — the shipped ADMIN_TOKEN is 26 characters · info

The running `.env` carries the shipped placeholder. The new start-up warning fires exactly as
designed (`[AUTH] ADMIN_TOKEN is 26 characters; use at least 32 …`, value never printed). No
code change; production is P5b's.

## Verdicts

**API1 BOLA — pass** (F-R3 adjacent, low). Cross-owner battery as author key 21 against key
22's scenario — `PUT /api/catalog/:id`, `submit`, `withdraw`, `approve`, `reject`,
`unpublish`, `GET versions`, `GET history`, `DELETE preview`, `POST archive` — all 403. The
draft preview returns the same 404 for an anonymous caller and for a non-owner author, so it
confirms nothing.

**API2 Broken authentication — finding (F-R1), fixed.** Credential handling itself: SHA-256-only
index lookup, `tokensMatch` hashes both sides to fixed 32-byte digests with no length branch
(`auth.js:73-77`), a 512-character cap before hashing, a correct 401/403/429 split, 30
failures / 15 min per IP (measured: 29×403 then 429 with `Retry-After` while a valid key still
answered 200), nginx appends to `X-Forwarded-For` so a client cannot pick its bucket.

**API3 Property-level authorization — pass** (F-R3 adjacent). Live: an author's `POST
/api/catalog` with `ownerKeyId`, `owner_key_id`, `status`, `role`, `author`, `scenarioUrl`,
`archiveBytes` → `400 "Автору заборонено поля: isPublished, author, scenarioUrl,
archiveBytes"`; the clean attempt created the row with `owner_key_id=21`, `status=draft`,
`author` = the key label — all server-derived. The PUT refusals behave the same.

**API4 Unrestricted resource consumption — pass** (F-R4 adjacent). Per-key archive counter
(20/h) and a separate cover counter (30/h), both before the body is read; `express.json`
100 kB; archive caps 200 MB / 20 000 entries / 10 MB per entry with a hostile declared-count
pre-check; telemetry and LTI each carry their own limiter; catalog reads index-backed
(21–86 ms at current scale). Not stress-tested at production volume; the in-memory windows
cover one process and reset on restart (documented, D7).

**API5 Broken function-level authorization — pass.** The full route table classified: anonymous
only `/api/catalog`, `/api/catalog/:id`, `/api/config`, `/api/health`, the telemetry POSTs;
any principal `/api/auth/me`, `/api/admin/scenarios`, `/api/admin/dashboard`,
`/api/categories*` reads, the `:id` reads and writes that then re-check ownership under
`FOR UPDATE`; moderator-only `/api/keys*`, `revoke|rotate`, `PUT /api/scenarios/:id/owner`,
version `accept|reject|restore`, `test-run`, `DELETE /api/catalog/:id`, `bulk`,
`/api/admin/storage[/gc]`, `/api/telemetry/summary`, every category mutation. Live: an author
key got 403 on all of the last group; the dashboard answered 200 but scoped. The one
`:id` route without an owner check, `POST …/versions/:vid/test-run`, is `authorize('moderator')`
— correct.

**API8 Security misconfiguration — finding (F-R2), fixed.** No autoindex anywhere
(`/scenarios/`, `/previews/`, `/a/`, `/a/objects/`, `/engine/` → 403). Traversal
(`/scenarios/../backend/Dockerfile`, `..%2f`, `%2e%2e/`, `....//`, `/a/../db/init.sql`, with
`--path-as-is`) normalised to the SPA shell, never file bytes. The access log is the stock
`main` format — no `$http_authorization`, no `$http_cookie` — and a grep of both containers'
full logs after an entire key life cycle matched nothing. CORS off unless `CORS_ORIGIN` names
an origin. CSP repeated in every header-setting location, no `unsafe-inline` on `script-src`.
Minor: `X-Powered-By: Express` is still emitted.

Card focus points:

- **timing-safe comparison — pass.** `auth.js:73-77`; keys are looked up by a unique hash
  index and nothing about the token is compared in place; `npm run test:unit` 308/0/0, with
  DW-1.2 spying on `timingSafeEqual`.
- **only the SHA-256 in the DB — pass.** `routes/keys.js` stores `sha256Hex(token)` in both
  issue and rotate; `publish_keys.token_hash` is UNIQUE; clear text exists only in the two 201
  bodies, both `Cache-Control: no-store`; `KEY_COLUMNS` has no token column.
- **no key in logs — pass.** Covered by the grep above and pinned by `key-logs.test.js`.
- **no route lets an author key touch another key's scenario — pass**, with F-R1 fixed and
  F-R3 noted.

## Tried and could not break it

Cross-owner 403 battery (10 routes) · 11 moderator-only routes as an author key · mass
assignment on create and update · header games (`Bearer `, `bearer`, `Basic`, empty, 513
characters; 40 wrong tokens → 29×403 then 429 while a valid key still got 200) · nginx
autoindex and five traversal shapes · draft-preview visibility for anonymous and non-owner ·
`versionId` 999 / 0 / `"31"` → 409/400/400, the real-but-stale id while the current was
another → 409 with the status left at draft · two concurrent rotates → exactly one 201 and one
409 · rotate ids `abc`/`-1`/`99999999999`/`2147483648` → 400, `0` → 404 · transfer to
unknown/revoked → 400, same owner → 409, a string keyId → 400, `null` moderators-only, an
author caller → 403 · a rotated-away key refused on `/api/auth/me`, PUT, archive upload and
`submit` while the successor key answered 200 · frontend: `sessionStorage` only, the one-time
token in an in-memory signal cleared on every close path and on destroy, no inline `<script>`
in the built `index.html`, `script-src 'self'`, sign-in disabled outside a secure context, and
every moderator-only route re-authorizes server-side · `/api/lti/*` with `LTI_PUBLIC_URL`
unset → 503 across the board.

**Only F-R1 broke it, and it is fixed.**

## "Accepted, not changed" of research.md — re-examined (DW-7.2)

1. **409 on a taken id reveals a hidden scenario id exists — confirmed**, with new evidence:
   `POST /api/scenarios/from-archive` with a draft's manifest id → 409, an unused id → 201.
   Author-to-author slug enumeration only. The anonymous half is worse than recorded and is
   F-R4.
2. **A pending archive is fetchable by its sha256 — confirmed.** Anonymous
   `GET /scenarios/<sha256>.zip` returns all 31 467 335 bytes of the unreviewed pending
   version; the sha appears in no public output, only in the owner's/moderator's version list
   and journal. Still right to accept: learning it needs ownership, moderator rights, or
   brute-forcing 256 bits.
3. **Authors edit metadata and cover of their own published scenarios directly —
   confirmed.** PUT and cover upload worked for the owning author on a `published` row, the
   archive upload correctly landed as a pending draft, and a non-owner got 403.
4. **An author can fill their own scenario's 50-version cap — confirmed by code** (the 409 and
   the pending-only delete for a non-owner author).
5. **`last_used_at` written on every request — confirmed**, and it is the same statement that
   exposed F-R1: the key row is read, a revocation can land, and the write then commits. The
   fix's guard runs inside each write transaction, which closes that path; accepting the
   per-request UPDATE stays right for one moderator plus a handful of teacher keys.
