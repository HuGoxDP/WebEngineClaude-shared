# P5f - blank HTTPS_REDIRECT_PORT turns the redirect off (plan)

**Status:** ready (owner pre-approved)
**Track:** Quick. Repo: virtual-lab. Milestone MS-1, AC-5 + U-1.
**Risk:** normal
**Review cadence:** 1
**Check-ins:** quiet
**Depends on:** P5d (already landed).
Research: `../P1e/research.md` (section P5f). Gate (all phases): from the repo root `node --test scripts/test/*.test.mjs`.

## Phase 1 - blank-aware fallback in the overlay (fix + test)
**File scope:** virtual-lab: docker-compose.https.yml, scripts/test/https-redirect-blank.test.mjs
**AC:** AC-5, U-1
**Risk:** normal
**Gate:** Standard
- **Skills:** code-foundations:cc-defensive-programming
- **Model:** sonnet (tier B)
- **Depends on:** none.
- **Goal:** `docker compose -f docker-compose.yml -f docker-compose.https.yml config` gives the frontend an empty
  `HTTPS_REDIRECT_PORT` when the variable is set blank, `HTTPS_PORT` (else `8443`) when it is unset.
- **Scope:** line 29 becomes `HTTPS_REDIRECT_PORT: ${HTTPS_REDIRECT_PORT-${HTTPS_PORT:-8443}}` (outer `-`, inner `:-`
  unchanged); rewrite the comment above it: blank = redirect off, unset = `HTTPS_PORT`, then 8443. New test file:
  copies `docker-compose.yml` and `docker-compose.https.yml` into a temp dir with an `.env` copied from `.env.example`,
  runs `docker compose -f docker-compose.yml -f docker-compose.https.yml config --format json` there with a child env
  that deletes `COMPOSE_FILE`, `HTTPS_PORT`, `HTTPS_REDIRECT_PORT`, then checks `services.frontend.environment.HTTPS_REDIRECT_PORT`
  for: (1) nothing set -> `"8443"`; (2) `HTTPS_PORT=9000` -> `"9000"`; (3) `HTTPS_REDIRECT_PORT=` (empty string in the
  env) -> `""`; (4) empty plus `HTTPS_PORT=9000` -> `""`; (5) `HTTPS_REDIRECT_PORT=77` -> `"77"`; (6) the blank given
  as the line `HTTPS_REDIRECT_PORT=` appended to the temp `.env` (not in the env) -> `""`.
- **Edge cases:** the file returns early (passes, no `skip`) when `docker compose version` exits non-zero; no daemon
  needed (`config` only); `nginx/10-https-redirect.sh` and `nginx.conf` are NOT edited (blank already renders an empty
  include, pinned by `https-redirect.test.mjs`). The empty-string cases (3), (4), (6) must assert the key is PRESENT in
  `services.frontend.environment` with value `''` after `docker compose ... config` (use `Object.hasOwn` plus
  `=== ''`), not absent and not `undefined`.
- **Produces:** a one-token change in the overlay and one new test file.
- **Done when:** DW-1 `grep -n "HTTPS_REDIRECT_PORT:" docker-compose.https.yml` shows `${HTTPS_REDIRECT_PORT-${HTTPS_PORT:-8443}}`;
  DW-2 `node --test scripts/test/https-redirect-blank.test.mjs scripts/test/https-redirect.test.mjs` exits 0 (Docker CLI present: six cases assert; absent: the file returns early);
  DW-3 `grep -n "skip" scripts/test/https-redirect-blank.test.mjs` returns nothing;
  DW-4 `git status --short` shows no modified existing test file.

## Phase 2 - docs state the rule (docs + test)
**File scope:** virtual-lab: docs/self-host.md, scripts/test/selfhost-doc-https-redirect-blank.test.mjs
**AC:** AC-5
**Risk:** normal
**Gate:** Standard
- **Skills:** code-foundations:code-clarity-and-docs
- **Model:** sonnet (tier B)
- **Depends on:** Phase 1.
- **Goal:** the "## HTTPS" section says: `HTTPS_REDIRECT_PORT` unset = the redirect port equals `HTTPS_PORT` (8443 by
  default); set but empty = no redirect; and shows the literal line `HTTPS_REDIRECT_PORT=` as the way to turn it off.
- **Scope:** edit the paragraph at ~lines 316-321 (Ukrainian): add the blank rule and a fenced block containing exactly
  the line `HTTPS_REDIRECT_PORT=` (nothing after `=`) with "у `.env`". Keep the sentence that a non-numeric value stops
  the frontend container. Do not rename headings; add no `docker compose ... -f` line. New test file reads
  `docs/self-host.md`, slices `## HTTPS` (same `section()` helper style as `selfhost-doc.test.mjs`) and asserts a line
  matching `/^HTTPS_REDIRECT_PORT=$/m` plus a mention of "порожн" near "редирект".
- **Edge cases:** existing HTTPS-section pins (COMPOSE_FILE, `;`, X-Forwarded-Proto, TRUST_PROXY=2, 301) keep passing.
- **Produces:** doc text + one new test file.
- **Done when:** DW-5 `node --test scripts/test/selfhost-doc.test.mjs scripts/test/selfhost-doc-https-redirect-blank.test.mjs` exits 0;
  DW-6 `grep -c "^HTTPS_REDIRECT_PORT=$" docs/self-host.md` prints 1;
  DW-7 `grep -n "порожн" docs/self-host.md` prints at least one line, and its line number lies inside "## HTTPS" (the blank rule is stated in words);
  DW-8 `git diff -U0 origin/ms/1 -- docs/self-host.md | grep '^@@'` prints hunks whose new-side line numbers all lie inside
  the "## HTTPS" section (about lines 316-321 plus the added block); get the exact range with
  `grep -n '^## ' docs/self-host.md` (start = the line of `## HTTPS`, end = the line before the next `## ` heading).

## Final check (orchestrator, no scope)
`node --test scripts/test/*.test.mjs` green; skipped tests not above the base.
