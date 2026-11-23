# P1e + P5f - research (MS-1, virtual-lab)

Autonomous pass, 2026-11-23. Base: `origin/ms/1` = e70ff8d. P1c code read from `e29775e` (branch
P1c-lti-manual-registration-deadend, not yet merged). Sources: milestone spec AC-2..AC-5, U-1, U-5; ROADMAP P1e / P5f.
Two independent rows; P5f's plan points here.

## P1e - manual registration must store the issuer verbatim

### Facts (verified in code)
- `backend/lti/registration.js` (Dynamic Registration) stores `issuer: str(config.issuer)` - the trimmed string the
  platform sent, no origin reduction, no trailing-slash change. `issuerOrigin: issuer.origin` is kept separately only
  for host checks.
- `backend/lti/store.js` looks a registration up by exact SQL equality (`getRegistration`: `issuer = $1 AND
  client_id = $2`; `listRegistrations(issuer)`: `issuer = $1`). `launch.js` passes the launch's `iss` claim.
- P1c `backend/lti/manual-registration.js` (e29775e) `normaliseRegistration` returns `issuer: issuerUrl.origin`.
  A Moodle at `https://host/moodle` has `iss = https://host/moodle`; the stored row `https://host` never matches
  -> 403 "Platform not registered" on every launch. This is the defect.
- `normaliseRegistration` requires each endpoint's `url.origin` to equal the issuer origin. `backend/lti/grades.js`
  `pinnedUrl` enforces origin-equality at grade time, so that check is correct and stays (a sub-path issuer's
  endpoints share its origin).
- `scripts/lti-add-registration.js` `registrationFromArgs`: with `--from-moodle` the issuer is `args.issuer ||
  args.fromMoodle` (passed raw); `fromMoodle(base)` strips trailing `/` before appending `/mod/lti/*.php`, so
  endpoints under a sub-path already come out right.
- Trap: `parseHttpsUrl(...).href` of a bare origin gets a trailing slash (`https://m.example/`). The stored issuer must
  therefore be the trimmed INPUT string, never `url.href`; `url` is only for validation.
- An existing P1c test pins the defect: `backend/test/unit/lti-manual-registration.test.js` "a complete registration is
  accepted and the issuer is normalised to its origin" feeds `${ISSUER}/some/path` and expects `ISSUER`. After the
  fix that assertion is false by design.

### Decisions (recommendation, owner pre-authorised)
1. Store `str(input.issuer)` verbatim (trim only), exactly as DR. No trailing-slash stripping on an explicit `--issuer`
   (AC-4). A bare `https://h` stays `https://h`; `https://h/moodle/` stays with its slash (an admin copies Platform ID
   from Moodle; DR parity is the rule).
2. `--from-moodle <base>` without `--issuer`: issuer = base with trailing slashes stripped (it is a base URL, endpoints
   are derived the same way; Moodle's wwwroot has no trailing slash). Explicit `--issuer` is never touched.
   Spec example `--from-moodle https://h.example/moodle` -> issuer `https://h.example/moodle` holds either way.
3. Keep every other P1c rule: https-only, no credentials, endpoints on the issuer's origin, >=1 deployment id.
4. Guard conflict: fixing requires changing the one stale P1c assertion above, which the gate test guard forbids.
   Recommendation: the lead lets the fix touch exactly that one test (it pins the bug); cleaner alternative if P1c is
   still unmerged: the lead fixes that line in P1c before merging. The plan puts the edit in its own phase so it can be
   dropped/relocated. Do not work around it by leaving dead origin-normalising code.
5. Doc: one sentence in docs/self-host.md step 3b that the issuer is stored exactly as given and must equal Moodle's
   Platform ID / `iss` (sub-path included). Must not break doc pins (no new `docker compose -f` line, no renamed heading).

### Edge cases
trailing slash on `--issuer`; bare origin (no href slash); sub-path with port; uppercase host (verbatim, DR same);
`http://` issuer / endpoint on foreign host (still exit 2); endpoint on same origin but outside the sub-path (allowed;
only origin is pinned by grades.js); `--from-moodle https://h/moodle/` (base stripped); re-run is idempotent
(`ON CONFLICT (issuer, client_id)`).

### Tests rule
New test files only. DB-less environment: unit tests use a fake store (`getRegistration` exact match). A new
integration test, if added, returns early (no `t.skip`) when `isAvailable(pool)` is false.

## P5f - blank HTTPS_REDIRECT_PORT must switch the redirect off

### Facts
- `docker-compose.https.yml:29`: `HTTPS_REDIRECT_PORT: ${HTTPS_REDIRECT_PORT:-${HTTPS_PORT:-8443}}`. The `:-` form
  substitutes when the variable is unset OR empty, so a deliberate blank cannot reach the container.
- `nginx/10-https-redirect.sh` already treats unset/blank (after trimming whitespace) as "empty include, exit 0"
  (U-1, pinned by `scripts/test/https-redirect.test.mjs`). It needs no change.
- Verified with the local Docker CLI (`docker compose config`, no daemon): with `${R-${P:-8443}}` -> unset R: "8443";
  `R=` : ""; `R=77`: "77"; unset R + `P=9000`: "9000"; `R=` + `P=9000`: "". A blank line in `.env`
  (`HTTPS_REDIRECT_PORT=`) counts as set-blank for interpolation.
- `service env_file: .env` is mandatory for `docker compose config`; a test must run in a temp dir holding both compose
  files and an `.env`. Scrub `COMPOSE_FILE`, `HTTPS_PORT`, `HTTPS_REDIRECT_PORT` from the child env.
- Other mentions (`selfhost-check.mjs:114,169`, `Dockerfile.frontend`, `nginx.conf`) are comments/key lists; no change.
- docs/self-host.md "## HTTPS" (lines ~316-321) says the redirect port defaults to HTTPS_PORT. Doc pins in
  `scripts/test/selfhost-doc*.test.mjs`: every `docker compose ... -f` line needs "без HTTPS" within 4 lines above;
  section titles may not change. So the doc edit adds prose plus a plain ```` ``` ```` block holding the literal line
  `HTTPS_REDIRECT_PORT=` and no `docker compose` line.

### Decisions
1. Change `:-` to `-` on the outer expansion only: `${HTTPS_REDIRECT_PORT-${HTTPS_PORT:-8443}}`. Inner keeps `:-`
   (blank HTTPS_PORT -> 8443 as today).
2. Update the YAML comment to say blank = off, unset = HTTPS_PORT (then 8443).
3. Doc states the rule and shows `HTTPS_REDIRECT_PORT=` as the way to turn the redirect off.
4. Test: new file `scripts/test/https-redirect-blank.test.mjs`; returns early (pass, no skip) when `docker compose
   version` fails; never needs the daemon.
