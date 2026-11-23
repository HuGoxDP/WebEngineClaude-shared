# P1e - manual LTI registration stores the issuer verbatim (plan)

**Status:** ready (owner pre-approved)
**Track:** Quick. Repo: virtual-lab. Milestone MS-1, AC-4 (+ U-5). Risk: security (LTI trust anchor).
**Review cadence:** 1
**Check-ins:** quiet
**Depends on:** P1c branch `P1c-lti-manual-registration-deadend` (commit e29775e) present in slot W2 worktree
`E:/Projects/WebstormProjects/WebEngine/.workers/W2/virtual-lab`, NOT yet merged into `ms/1`. Research: `research.md` (this folder).
**Gate (all phases):** from `virtual-lab/backend`: `node --test "test/unit/*.test.js"`.

## Precondition and branch
P1e is built ON the P1c branch, before P1c lands. The task-lead works in slot W2 on that same branch and first runs
`git merge origin/ms/1` into it. P1c and P1e then land together as one merge (P1c's branch); P1c's pre-merge review
covers both. `backend/test/unit/lti-manual-registration.test.js` does not exist on the base `origin/ms/1`, so the gate's
test guard (which compares against the base) treats it as a new file the branch itself added: editing it is allowed.

Rule: P1c's behaviour stays except the issuer. Store `str(input.issuer)` (trimmed input), never `url.href`/`url.origin`.
Execution order: Phase 1 (tests, red) -> Phase 2 (fix + update P1c test) -> Phase 3 (doc).

## Phase 1 - tests for verbatim issuer (write first, red)
**File scope:** virtual-lab: backend/test/unit/lti-manual-registration-issuer.test.js, backend/test/integration/lti-manual-registration-subpath.test.js
**AC:** AC-4, U-5
**Risk:** risk
**Gate:** Standard
- **Skills:** code-foundations:cc-quality-practices
- **Model:** sonnet (tier B)
- **Depends on:** the precondition above (P1c branch in W2, `origin/ms/1` merged in).
- **Goal:** pin AC-4 as black-box checks through `main(argv, {store, out, err})` with a fake store whose
  `getRegistration` compares issuer by exact string equality (like `store.js`).
- **Scope:** new unit file, own constants (do not import P1c fixtures): (a) `--issuer https://h.example/moodle
  --client-id c --deployment-id 1` + endpoints under it -> exit 0, saved issuer `=== 'https://h.example/moodle'`,
  `getRegistration('https://h.example/moodle','c')` finds it; (b) `--from-moodle https://h.example/moodle` -> issuer and
  endpoints `.../moodle/mod/lti/{auth,token,certs}.php`; (c) `--issuer https://h.example/moodle/` stored with the
  slash and a lookup without it does NOT find it (verbatim, DR parity); (d) bare `--issuer https://m.example` stored
  without trailing slash; (e) `--from-moodle https://h.example/moodle/` -> issuer without slash; (f) endpoint on another
  host with a sub-path issuer -> exit 2, nothing saved; `http://` issuer -> exit 2; (g) `--dry-run` saves nothing.
  New integration file (same db-helper setup as `lti-manual-registration.test.js`): real `createStore(pool)`, same
  sub-path call, `getRegistration` finds the row; when `isAvailable(pool)` is false each test `return`s early (no
  `t.skip`) and `pool.end()` still runs in `test.after`.
- **Edge cases:** the Docker daemon / Postgres is usually down on the gate machine, so the integration file must
  pass without it.
- **Produces:** two new test files.
- **Done when:** DW-0 `test -f backend/lti/manual-registration.js` exits 0 (P1c is present);
  DW-1 `cd backend && node --test test/unit/lti-manual-registration-issuer.test.js` run BEFORE Phase 2 fails in cases (a),(b),(c) and has at least 7 tests (`grep -c "^test(\|^  test(\|^  it(" ...` >= 7);
  DW-2 `grep -n "skip" backend/test/unit/lti-manual-registration-issuer.test.js backend/test/integration/lti-manual-registration-subpath.test.js` returns nothing;
  DW-3 `cd backend && node --test test/integration/lti-manual-registration-subpath.test.js` exits 0 with no database running.

## Phase 2 - store the issuer verbatim (fix + update the P1c test)
**File scope:** virtual-lab: backend/lti/manual-registration.js, backend/scripts/lti-add-registration.js, backend/test/unit/lti-manual-registration.test.js
**AC:** AC-4
**Risk:** risk
**Gate:** Standard
- **Skills:** code-foundations:cc-defensive-programming, code-foundations:aposd-verifying-correctness
- **Model:** sonnet (tier B)
- **Depends on:** Phase 1 (red tests exist).
- **Goal:** the registration row's `issuer` is exactly the string the admin gave (or the `--from-moodle` base), so
  the store's exact lookup finds a sub-path Moodle.
- **Scope:** in `normaliseRegistration` set `issuer: str(input.issuer)`; keep `parseHttpsUrl(...)` only to validate
  (https, no credentials) and keep the endpoint check `url.origin !== issuerUrl.origin`. Fix the header comment and
  `@returns` note. In `registrationFromArgs`: the default issuer for `--from-moodle` is
  `args.fromMoodle.trim().replace(/\/+$/, '')`; an explicit `--issuer` is passed untouched. Update the script's
  header/USAGE text that says the issuer "is that origin". In `backend/test/unit/lti-manual-registration.test.js`
  change only the one test that pins the defect ("a complete registration is accepted and the issuer is normalised to
  its origin", input `${ISSUER}/some/path`, expects `VALID`): rename it to "... the issuer is kept exactly as given"
  and expect `{ ...VALID, issuer: `${ISSUER}/some/path` }`. No other line of that file changes.
- **Edge cases:** bare origin stays `https://h` (not `https://h/`); `https://h/moodle/` given as `--issuer` keeps its
  slash; `--from-moodle https://h/moodle/` -> issuer `https://h/moodle`; `http://` issuer and foreign-host endpoint
  still exit 2 with the field named; endpoints on the same origin outside the sub-path accepted; no change to
  `registration.js` (Dynamic Registration) or `store.js`. The test-file edit is allowed because that file is new on
  this branch relative to `origin/ms/1`; do not keep origin-reducing code alive to satisfy the old test.
- **Produces:** unchanged exports (`normaliseRegistration, normaliseDeployments, MOODLE_ENDPOINTS`; `parseArgs,
  registrationFromArgs, fromMoodle, main, USAGE`).
- **Security-sensitive:** yes. The issuer is the trust anchor matched against a launch's `iss`. Verbatim storage must
  not widen it: validation (https, no credentials, endpoints on the issuer origin) is unchanged; the stored value is
  never rewritten toward a different issuer.
- **Done when:** DW-4 `grep -n "issuer: issuerUrl" backend/lti/manual-registration.js` returns nothing;
  DW-5 `cd backend && node --test test/unit/lti-manual-registration-issuer.test.js` passes (the normaliseRegistration
  case that a bare origin returns no trailing slash and a sub-path issuer is kept verbatim is green);
  DW-6 `cd backend && node --test test/unit/lti-manual-registration.test.js` passes;
  DW-7 `git diff --stat` for this phase touches only the three files in scope, and `git diff -U0 -- backend/test/unit/lti-manual-registration.test.js | grep -c '^[+-][^+-]'` prints at most 6.

## Phase 3 - doc sentence
**File scope:** virtual-lab: docs/self-host.md, scripts/test/selfhost-doc-lti-issuer.test.mjs
**AC:** AC-4
**Risk:** normal
**Gate:** Standard
- **Skills:** code-foundations:code-clarity-and-docs
- **Model:** sonnet (tier B)
- **Depends on:** Phase 2.
- **Goal:** step 3b states that the issuer is stored exactly as given and must equal Moodle's Platform ID (`iss`),
  sub-path included (`https://host/moodle`), with no trailing slash added or removed.
- **Scope:** add 1-3 Ukrainian sentences in "### Крок 3" after the paragraph explaining `--from-moodle`; do not rename
  any heading; add no `docker compose ... -f` line. New test file (same `section()` helper style as
  `selfhost-doc-lti-manual-registration.test.mjs`) asserts the Крок 3 body contains `/moodle` and the word `issuer`
  in the new sentence.
- **Edge cases:** existing pins ("не живим запуском", Moodle field names, "Крок 2 ... перевірений") keep passing.
- **Produces:** doc text + one new test file.
- **Done when:** DW-8 from the repo root `node --test scripts/test/selfhost-doc.test.mjs scripts/test/selfhost-doc-lti-manual-registration.test.mjs scripts/test/selfhost-doc-lti-issuer.test.mjs` exits 0;
  DW-9 `git diff -U0 origin/ms/1 -- docs/self-host.md | grep '^@@'` prints hunks whose new-side line numbers all lie inside
  the "### Крок 3" section; get that range with `grep -n '^##\{1,2\} ' docs/self-host.md` (start = the line of `### Крок 3`,
  end = the line before the next `###`/`##` heading).

## Final check (orchestrator, no scope)
On the P1c branch in W2: `cd backend && node --test "test/unit/*.test.js"` is green and, at the repo root,
`node --test scripts/test/*.test.mjs` is green; changed files equal the union of the P1c scope and the phase scopes above.

---
## Addendum — P1c pre-merge review round 1 (Claude, 2026-11-23)
`code-foundations/P1c/review-premerge.md` (sha e29775e, open-blocking 3). The same task-lead run on the P1c branch also fixes:
- **R1-2 (AC-2, spec interface):** `main(argv, {store, out, err})` takes WRITABLE STREAMS (`out.write(string)`), default
  `process.stdout`/`process.stderr` — not functions. **Done when:** a new test passes `{write}` objects and gets exit 0 /
  printed JSON for `--dry-run`, exit 2 for a bad issuer; the existing P1c tests that pass functions are updated (they
  are new files of this branch, not on `origin/ms/1`, so the gate's test guard allows it).
- **R1-3 (AC-3):** with `--from-moodle`, an explicit `--auth-login-url` / `--auth-token-url` / `--jwks-uri` is not ignored:
  it is validated like any endpoint (https, issuer's origin) — a foreign host → exit 2, nothing saved; a valid one
  overrides the Moodle default. **Done when:** a new test with `--from-moodle https://m.example --auth-login-url
  https://evil.example/x` returns 2 and the fake store saw no save.
- Non-blocking items of that review are optional; whatever is not fixed goes to DEBT.md (lead notes it in its report).
