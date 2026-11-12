# B6 phase 6 — security suite: build notes (W3, 2026-11-12)

Branch `B6-platform-publish-keys-harden` (virtual-lab + .claude-shared).

## What landed

| File | Role |
|---|---|
| `backend/test/helpers/routes.js` | walks `app._router.stack` (express 4), including mounted routers, so every `METHOD /path` a client can call is enumerated — 26 `:id` routes, 52 method+path pairs, vs. 48 `/…/:…` declarations in `routes/*.js` (the difference: routes declared in a `for` loop over actions and the LTI mounts). |
| `backend/test/integration/rights-table.test.js` | DW-6.1 — the §7 rows of `unity-editor-plan.md`, one `describe` each, rows quoted verbatim in the comments. Callers per row: owning author, another author, moderator, bootstrap, revoked key, the key a rotation replaced, anonymous. Every "Нет" cell asserts the status **and** that the database did not move (title, status, version rows, draft rows, `owner_key_id`). 37/37. |
| `backend/test/integration/bola-sweep.test.js` | DW-6.2 — author B (not the owner) calls every enumerated `:id` route against author A's scenario with a minimal body; expected 403 or 404, never 2xx, except the public-read allow-list (`GET /api/catalog`, `GET /api/catalog/:id`, `GET /api/scenarios/:id`, `GET /api/health`, `GET /play/:id`, `GET /api/scenarios/:id/manifest`). 28/28, plus the floor assertion `idRoutes(app).length >= 26`. |
| `backend/test/integration/escalation.test.js` | DW-6.3 — the alias fields (`ownerKeyId`, `owner_key_id`, `status`) are *not read*: the row keeps the server-derived owner/status/attribution; the listed fields (`AUTHOR_FORBIDDEN_FIELDS`, `archive*`) are 400 on POST and PUT; every moderator-only route 403s an author; the dashboard is an author route but shows the caller only their own rows. 11/11. |
| `backend/test/integration/key-logs.test.js` | DW-6.3 — a whole life cycle (issue → `/auth/me` → create → upload → rotate → old key refused → revoke → wrong token) runs with every `console.*` captured; neither a token, nor `SHA-256(token)`, nor the admin token may appear in the captured lines, while the lines themselves are still forwarded. Also asserts the DB holds exactly the three digests and no clear token. 6/6. |

## Mutation checks (both reverted, nothing committed)

DW-6.2 requires the sweep to fail on a deliberately unprotected route. Done:

- `server.js` gained `app.get('/api/sweep-probe/:id', (req, res) => res.json({ ok: true }));` before the catalog mount → `bola-sweep.test.js`: `✖ GET /api/sweep-probe/bola-victim — AssertionError: answered 200`, 2 failed. `git checkout -- backend/server.js` reverted it; the file is byte-identical to the branch tip (`git status --porcelain backend/server.js` empty).
- DW-6.3 requires the log test to fail on a deliberate leak. Done: `routes/keys.js` gained `console.log('DEBUG-LEAK', token);` right after `generateToken()` in the issue route → `key-logs.test.js`: `✖ neither token appears in the log — the issued token was logged`. Reverted with `git checkout -- backend/routes/keys.js`.

## Facts discovered while building (they corrected first-draft expectations)

- `scenarios.is_published` no longer exists — migration `011` dropped it; `status` (`draft`/`review`/`published`/`rejected`) is the only source of truth.
- A pending draft is a `scenario_versions` row with `state='pending'`, not a `pending_archive_*` column on `scenarios` (the card's sketch was narrower than the shipped Nocturne design). "Accept/reject someone else's draft" is `POST /api/scenarios/:id/versions/:vid/{accept,reject}`, moderator-only — not the `workflow` transitions, which 409 on a published row.
- An anonymous caller (no `Authorization` at all) is **401**, not 403; a presented-but-refused credential is 403. The refusal tables in `rights-table.test.js` encode this as `REFUSED = [403, 403, 401]`.
- `versions.installUpload` short-circuits on identical content: an upload whose sha matches the current (or, for an author on a published row, the pending) version answers 201 with that existing version and writes no new row. Tests that count version rows use distinct manifest versions to stay off that path.
- `installUpload` keeps an author's pending draft when a *moderator* uploads into the same published scenario ("A moderator's upload to a published scenario leaves an author's pending proposal alone"), so the pending row survives.
- `authorUploads` is 20 uploads/hour per key by default (`AUTHOR_UPLOADS_PER_HOUR`), and it is reset per test.

## e2e (DW-6.4e)

`e2e/tests/admin-moderation.spec.ts` carries a second describe, two specs:

- **B6.5 rotate a code from «Доступ»** — the moderator issues a code, a scenario is created
  and uploaded with it, the access page is reloaded and shows `scenario-count` 1; then
  rotate (confirming), the replacement token is shown once, the old code is 403 on
  `/api/auth/me`, the new one is 200 with the same label, the scenario is in the new code's
  own `/api/admin/scenarios` list with `ownerLabel` = the label, and the live row still
  counts 1.
- **B6.5 an archive swapped while the card is open** — the author submits for review, the
  moderator opens the queue card (the «Переглянути у viewer» link proves the card names the
  current version), the author withdraws, uploads v2 and submits again; the click on the
  stale card is answered `Архів змінився після перевірки` on the card, nothing is
  published, and the reloaded card then publishes the version that is current now.

Run against the composed stack from the worker worktree:

```bash
docker compose up --build -d
cd backend && set -a && . ../.env && set +a \
  && node --env-file-if-exists=../.env scripts/publish-release.mjs    --release ../../ScenarioCreator/ReleaseScenarios \
  && node --env-file-if-exists=../.env scripts/import-release-assets.mjs --release ../../ScenarioCreator/ReleaseScenarios
cd ../e2e && set -a && . ../.env && set +a \
  && E2E_BASE_URL=http://127.0.0.1:8044 npx playwright test admin-moderation admin-workflow draft-preview
```

Result: **20 passed**. (`admin-moderation` 5 — the three DW-7.x tests unchanged and green,
plus the two new ones.)

## The one check that objected, and why it is not weakened

`backend/test/integration/keys.test.js` 178 pinned the field set of `GET /api/keys` and
failed once phase 5 added `scenarioCount` to the list query: `deepStrictEqual` actual
`[… , 'scenarioCount']` vs expected the old six. That test's invariant is "no token or hash
field at all", and it is still asserted (`!/token|hash/i.test(body)`); the field list now
carries the new column deliberately, with a comment saying what it guards and an assertion
that a fresh key's count is 0. No test was weakened, skipped or deleted.

`frontend` `ng test --no-watch` failed once in the full-suite run with
`icon-generator.spec.ts` — two 5 s-timeout `execFileSync` tests ("Test timed out in
5000ms") — and passed 5/5 in isolation, as it already did on the unmodified base (recorded
in M2.2/engine-render-test-flake notes: the `Application*`/icon-generator specs are
load-bound here). The re-run of the same suite, unchanged, was **770/770 green**, so it is
a flake under full-suite load, not a defect of this branch.

## Green run (phase 6 close, 2026-11-12, branch `B6-platform-publish-keys-harden`)

| Check | Result |
|---|---|
| `cd backend && npm test` (Postgres test stack, `vl-db.lock`) | **1648 tests, 1648 pass, fail 0, skipped 0** |
| `cd frontend && npx ng test --no-watch` | **770 passed (50 files)** |
| `cd frontend && npm run build` / `npm run check:csp` | exit 0 / exit 0 |
| `cd e2e && playwright test admin-moderation admin-workflow draft-preview` | **20 passed** |

virtual-lab commit: `eadc020` (pushed to `origin/B6-platform-publish-keys-harden`).

