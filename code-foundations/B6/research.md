# B6 — Author publish keys + drafts an admin accepts (+ security review): research (Claude, 2026-11-10)

**Status:** confirmed by Claude (architect lane); the plan beside it (`plan.md`) is `ready`.
**Base:** virtual-lab `main` `eaeccc3`; P5a in flight on `origin/P5a-backups-restore-https` (`a3eb34f`).
Card: `tasks/B-milestone-1.md` § B6 (consumer: § B7). Design: `WebEngineTSEditor/docs/unity-editor-plan.md` §7,
`PLAN.md` §2.6, §2.9 (done), §2.12; owner decision 2026-10-09 (a published scenario is updated only through a
draft an admin accepts).

## The headline: most of B6 already shipped — as "Nocturne release 2" (2026-10-27 → 10-29)

The card (written before 2026-10-23) asks for migration `006` with `publish_keys`, `owner_key_id` and a
`pending_archive_sha256` column. None of that is to be built: virtual-lab's own plan
`.code-foundations/plans/2026-10-23-nocturne-release-2-admin.md` (status *complete*, merged `93608dd`) built a
superset of it — with roles, a status workflow and a full version history instead of a single pending column
(its "Rejected approaches" explains why). **B6 is therefore a gap-closing + hardening + security-review task,
not a build-from-scratch task.** The card's migration number is obsolete (`006` is `006_categories_and_features`).

### What exists (checked against the code at `eaeccc3`)

| Card / §7 requirement | Where it is | State |
|---|---|---|
| `publish_keys` (`label`, `token_hash` SHA-256, `created_at`, `last_used_at`, `revoked_at`) + `role` (`author`/`moderator`) | `backend/migrations/009_keys_roles_audit.sql` | done |
| `scenarios.owner_key_id` (FK, keys never deleted) | 009 | done |
| Token: 32 random bytes base64url, shown once, `Cache-Control: no-store`, never stored or listed | `backend/routes/keys.js` POST `/api/keys` | done |
| Lookup by `SHA-256(token)` (unique index); `ADMIN_TOKEN` = bootstrap moderator, `timingSafeEqual` | `backend/auth.js` `resolvePrincipal`, `tokensMatch` | done (see F1) |
| Revocation immediate (every request reads the row; no cache), idempotent | `auth.js`, `routes/keys.js` revoke | done |
| Rights table: create always hidden (`draft`) and owned by the key | `routes/catalog-admin.js` POST `/api/catalog`, `routes/archives.js` `from-archive` | done |
| Edit own metadata; forbidden author fields (`scenarioUrl`, `manifestUrl`, `imageUrl`, `author`, `isPublished`, `archive*`) | `catalog-input.js` `AUTHOR_FORBIDDEN_FIELDS`, PUT `/api/catalog/:id` (re-checked under `FOR UPDATE`) | done |
| Upload to own hidden → current; to own published → **pending** (one per scenario, replaces the previous one) | `versions.js` `installUpload`; partial unique indexes in 010 | done |
| Accept / reject a draft in one transaction (moderator); restore an archived version (rollback) | `routes/versions.js` | done |
| Publish / unpublish / delete / other people's scenarios / storage / telemetry: moderator only | `workflow.js` `TRANSITIONS`, `routes/catalog-admin.js` DELETE, `routes/storage-admin.js`, `routes/bulk.js`, `routes/telemetry.js` | done |
| Draft preview `/play/<id>?draft=<sha256>` | `routes/catalog-public.js` `?version=`; e2e `draft-preview.spec.ts` | done |
| GC keeps every archive a version row references (the "log" of §7 is `scenario_versions`) | `routes/storage-admin.js` `referencedArchives` | done |
| Audit line per key action (create, update, archive, transitions, versions, preview, key create/revoke) | `audit.js` + every write route, same transaction | done |
| Rate limits: failed auth per IP (30 / 15 min), archive uploads per author key (20 / h) | `rate-limits.js` | done (see F4) |
| `/admin` "Доступ": issue (shown once), list with last use, revoke | `frontend/src/app/pages/admin/access/access.component.ts` | done |
| Owner shown per scenario | `scenario-rows.js` `ownerLabel`; shown only in the moderation queue | partial (F7) |
| Tests: route × caller table incl. "no" cells; author rules; keys; rate limits; audit; versions; e2e issue → upload → submit → publish → pending → accept → revoke | `backend/test/integration/route-table.test.js`, `author-rules.test.js`, `keys.test.js`, …; `e2e/tests/admin-moderation.spec.ts` DW-7.6 | done (see F8) |
| Isolation before keys (§2.9) | player-isolation plan, virtual-lab `9b0ae09`, `2bf3a12` | done |
| HTTPS (keys never over plain HTTP) | production is plain HTTP today (`access.component.ts`: "The server runs plain HTTP in places"); P5a adds a 443 listener | **open** (F2) |
| Opus security review of the key code | phase reviews of Nocturne exist (`.code-foundations/build/…-phase-2-review.md`), no dedicated adversarial review | **open** |

Workflow beyond §7 (kept, it is the owner-accepted Nocturne design): `draft → review → published | rejected`,
`unpublish → draft`; an author may `submit`/`withdraw`, never `approve`. Uploads are refused in `review` (409).

## Findings — what B6 still has to do

Each finding names its evidence. Severity is for this platform (teachers with personal keys; students anonymous).

- **F1 (low) `ADMIN_TOKEN` comparison leaks its length and accepts a weak value.** `auth.js` `tokensMatch`
  short-circuits on length before `timingSafeEqual`; `.env.example` only *suggests* `openssl rand -hex 32`.
  Fix: compare `SHA-256(provided)` with `SHA-256(expected)` by `timingSafeEqual` (fixed 32-byte inputs, no length
  branch); warn at start when `ADMIN_TOKEN` is set and shorter than 32 characters. Personal keys are looked up by
  hash in an index: the attacker controls the input, but a timing difference only reveals a prefix of
  `SHA-256(guess)`, which gives nothing toward a preimage — the standard argument for hash-indexed API keys
  (GitHub, Stripe store and look up digests the same way). No change there.
- **F2 (high until fixed) Keys travel over plain HTTP.** Production serves `:80`; P5a (`origin/P5a-…`) adds
  `listen 443 ssl` in the same nginx server with `$scheme`-based HSTS, and keeps `:80` serving everything. nginx
  sets `X-Forwarded-Proto $scheme` on `/api/` (`nginx/nginx.conf` `location /api/`), and `TRUST_PROXY` is set,
  so Express's `req.secure` is correct for a single TLS-terminating nginx. **But** behind a second TLS proxy
  (`lti-demo/proxy/nginx.conf` sets `X-Forwarded-Proto https`, the platform nginx then overwrites it with `http`)
  `req.secure` is false. Fix (decided below): a `REQUIRE_HTTPS` switch in the backend, an nginx `map` that keeps
  an upstream `https`, and the admin sign-in refusing outside a secure context.
- **F3 (medium) No rotation, no ownership transfer.** Revoking a lost key (`POST /api/keys/:id/revoke`) leaves
  the teacher's scenarios owned by a dead key: only moderators can touch them afterwards, and no route changes
  `owner_key_id` (grep: written only by the two create routes). Fix: `POST /api/keys/:id/rotate` (new token, same
  label/role, ownership moved, old key revoked — one transaction) and a moderator-only
  `PUT /api/scenarios/:id/owner`.
- **F4 (medium) Cover uploads are not rate-limited.** `routes/previews.js` POST `/api/scenarios/:id/preview` has
  no `limitAuthorUploads` (archives and `from-archive` do). 5 MB each, unlimited per hour per author key
  (OWASP API4:2023 Unrestricted Resource Consumption). Fix: a separate per-key preview counter (cheap images
  should not eat the archive budget).
- **F5 (medium) `approve` is not bound to the version the moderator reviewed (TOCTOU).** `workflow.js` allows
  `approve` from `draft` and `rejected` as well as `review`, and an author can `withdraw → upload → submit`
  between the moderator's test run and the click; the approve then publishes bytes nobody looked at. Pending
  drafts are safe (accept is by version id; a new upload deletes and re-inserts the row → the old id 404s). Fix:
  `approve` accepts `versionId` (the `currentVersion.id` the UI shows) and answers 409 when the current version
  differs; the admin UI always sends it; scripts that omit it (`publish-release.mjs`, the `PUT {isPublished}`
  compatibility path, moderator bulk) keep today's behaviour — they are moderator-authored bytes.
- **F6 (low) History of a deleted scenario leaks to the next owner of its id.** `audit_events.scenario_id` has
  no FK by design (009); `GET /api/scenarios/:id/history` and the dashboard filter only by id/owner. Scenario ids
  are slugs from the manifest (`from-archive`), so author B recreating id `x` after a moderator deleted A's `x`
  reads A's events (labels, sha256s, reject notes). OWASP API1 (BOLA) in spirit. Fix: for non-moderators,
  only events with `created_at >= scenarios.created_at`.
- **F7 (low, UX the card asks for) Owner visible in the list/editor, keys show what they own.** `ownerLabel` is
  rendered only in `queue.component.ts`. Card: "owner shown per scenario". Fix in the admin UI, with the
  rotate/transfer actions.
- **F8 (test gaps against the card's review focus).** Present: route × caller table, revoked key, author field
  rules. Missing: (a) a *generated* BOLA sweep — every registered route with `:id` exercised by author B against
  author A's scenario, so a future route cannot forget the owner check (OWASP API1/API5); (b) "no key in logs" —
  capture `console.*` through a full key life cycle and assert the token and its hash never appear; (c) key
  reuse after revoke and after rotate on every write route; (d) scope escalation: an author sending `role`,
  `ownerKeyId`, `owner_key_id`, `status`, `isPublished`, `archiveSha256` in bodies; an author calling
  accept/restore/test-run/bulk/keys; (e) timing: a *unit* test that both comparison paths go through
  fixed-length `timingSafeEqual` (statistical timing tests are flaky and are not used).
- **F9 (info) B7 has no written API contract.** The editor's Publish (B7) needs: validate a key, list own
  scenarios, create from archive, upload to own scenario (current or pending), read state. All routes exist;
  no document says which ones the editor uses, what each status answers and which errors to show. Fix:
  `docs/publish-api.md` (in the final docs phase).
- **Accepted, not changed (record in the review):** 409 on a taken id reveals that a hidden scenario id
  exists (ids are public slugs; low value); a pending archive is fetchable by its sha256 (§7: "not a secret, not
  guessable"); authors edit metadata and cover of their **published** scenarios directly (§7 table "Так";
  Nocturne constraint; text is rendered as text only); an author can fill their own scenario's 50-version cap
  (only hurts themselves; a moderator deletes archived versions); `last_used_at` written on every request
  (one indexed UPDATE).

## Decisions

- **D1 Key format.** New tokens: `vlk_` + 32 random bytes base64url (43 chars) — a recognisable prefix makes a
  leaked key findable by secret scanners and log greps (GitHub `ghp_`, Stripe `sk_live_` practice) and lets the
  editor (B7) reject a mis-paste before a request. Stored value unchanged: `SHA-256` of the **whole** token
  (prefix included). Existing un-prefixed keys keep working (no migration; lookup is by hash). No pepper/HMAC
  and no slow hash: the token has 256 bits of entropy, so a stolen hash table cannot be brute-forced and a slow
  hash would only add latency to every request (OWASP Password Storage CS: slow hashes are for low-entropy
  secrets). Recorded with the evidence above.
- **D2 Lookup.** By `token_hash` unique index (exists). No key-id prefix in the token: a hash lookup is already
  O(1) and timing-neutral (F1 argument); an id in the token would add a second format for no gain.
- **D3 Scopes = roles.** Keep the two roles; the author scope is exactly §7's table as implemented (create
  hidden, edit own metadata, upload own hidden, upload own published as pending, submit/withdraw, delete own
  pending). No per-key custom scopes (YAGNI; nothing asks for them).
- **D4 HTTPS enforcement.** Three layers: (1) **backend** `REQUIRE_HTTPS=true` → `authenticate` and
  `optionalAuthenticate` answer `403 {error, code: 'https_required'}` for any presented credential when
  `req.secure` is false, **before** the lookup and without counting a failure; default off (dev, tests, the
  plain stack), a start-up warning when off; (2) **nginx** forwards `X-Forwarded-Proto` as `https` when an
  upstream proxy said so, else `$scheme` (`map $http_x_forwarded_proto $vl_forwarded_proto`). A client can
  spoof `https` over plain HTTP, but only to send *its own* key in clear — the guard exists against
  misconfiguration and honest clients, which never spoof; (3) **admin UI** refuses to sign in or issue keys when
  `!window.isSecureContext` (true for https and for `localhost`, so local dev and e2e still work). P5a supplies
  the 443 listener and HSTS; `docker-compose.https.yml` sets `REQUIRE_HTTPS=true`. Production switch-on is P5b
  (owner). Keys are issued to teachers only after that (owner question Q4).
- **D5 Rotation and transfer.** `POST /api/keys/:id/rotate` (moderator): inserts a new key with the same label
  and role, moves every `scenarios.owner_key_id` and nothing else (`scenario_versions.uploaded_by_key_id` stays
  history), revokes the old key, audits `key.rotate {fromKeyId, toKeyId, scenarios: n}`, returns the token once
  (`no-store`). Rotating a revoked key is allowed (the lost-key case is "revoke now, rotate later"). `PUT
  /api/scenarios/:id/owner {keyId}` (moderator): target key must exist, be an `author` or `moderator` key and not
  revoked; `null` makes it moderator-only; audits `scenario.owner`. No schema change.
- **D6 Approve binding.** `POST /api/scenarios/:id/approve {versionId?}`; mismatch → 409
  `'Архів змінився після перевірки'`. Optional for API compatibility, always sent by the admin UI (queue and
  upload wizard).
- **D7 Rate limits.** Keep the two existing counters; add `authorPreviews` (per author key,
  `AUTHOR_PREVIEWS_PER_HOUR`, default 30) on the preview upload. In-memory fixed windows are acceptable: one
  backend process (`docker-compose.yml`), and a restart only resets in the author's favour. Not added: a
  general per-key write limit (metadata writes are cheap and audited; revisit if abuse is seen).
- **D8 Audit.** Keep `audit_events` as is (same transaction as the change). New actions: `key.rotate`,
  `scenario.owner`. No auth-failure rows (they would let an anonymous caller grow the table; failures go to the
  rate limiter). Retention: unchanged (owner question Q2).
- **D9 Migration / compatibility.** **No new migration.** `ADMIN_TOKEN` stays the bootstrap moderator (no row,
  `keyId: null`); un-prefixed keys stay valid; `approve` without `versionId` behaves as today.
- **D10 Draft model.** Keep `scenario_versions` (`pending` row) — it is §7's `pending_archive_sha256` plus
  history; author/time/size/engine version are columns there already. The card's column is not added.

## Test strategy

- Backend unit (`npm run test:unit`, no DB): token format, digest compare, `REQUIRE_HTTPS` decision, the nginx
  map (text test like `test/unit/nginx-lti-frame.test.js`), rate counters.
- Backend integration on the throwaway Postgres (`docker-compose.test.yml`, port 55432) **inside
  `wk.sh lock vl-db W<n> B6`**; the run must show `skipped 0` — the integration files `t.skip` silently when no DB
  is reachable, so a green run without Docker proves nothing. Command: `.claude-shared/tasks/README.md` "Checks
  per repo".
- Security tests (Phase 6): generated BOLA sweep over `app._router.stack`; key reuse after revoke/rotate on every
  write route; scope escalation bodies; no token/hash in captured logs; timing by construction (unit).
- e2e (Playwright, needs the full stack + a published catalog, `e2e/README.md`): extend
  `admin-moderation.spec.ts` with rotate → old code refused, new code still owns the scenario; approve with a
  stale version → error shown. The full stack uses fixed container names and ports, so it also runs inside
  `vl-db.lock`.
- Frontend: `npx ng test --no-watch` for the access page, owner column, secure-context refusal.

## Owner questions (the plan proceeds with the recommendation as an Assumption)

| # | Question | Recommendation |
|---|---|---|
| Q1 | How does a teacher receive their key? | In person or through the institution's messenger, copied from the one-time dialog; never e-mail; the moderator rotates on any doubt. Platform builds no delivery channel. |
| Q2 | How long are audit events kept? | Indefinitely for now (rows are tiny; no personal data beyond a label the moderator typed); revisit at 1 M rows or with a privacy request. `docs/privacy.md` states it. |
| Q3 | Do keys expire? | No automatic expiry; the access page shows last use, and a key unused for 180 days is flagged in the list (display only). |
| Q4 | Issue author keys in production only after HTTPS is live with `REQUIRE_HTTPS=true` (P5b)? | **Yes** — until then keys go only to moderators on the local network. |

## Risks

- Auth code is small but central: every phase that touches `auth.js`, `workflow.js` or a route's owner check
  is Full-gate with `Security-sensitive: yes`.
- P5a lands first and also edits `nginx/nginx.conf` (top-level `map`, `listen 443`); Phase 2 adds one `map` and
  changes two `proxy_set_header` lines — merge `origin/main` before starting it.
- The e2e suite needs a ScenarioCreator release in the catalog (`npm run publish:release`), not available in
  every container; the e2e DW therefore names the exact spec and accepts "ran: N passed" only.
