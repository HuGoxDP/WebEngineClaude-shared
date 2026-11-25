# Plan: P1f lti-add-registration input hardening
**Created:** 2026-11-25
**Status:** ready
**Complexity:** simple
**Review cadence:** 3
**Check-ins:** quiet
---
## Context
**Problem:** `backend/scripts/lti-add-registration.js` writes the LTI trust-anchor row but its parser silently drops a repeated `--deployment-id`, silently overwrites other repeated value flags, accepts `--dry-run=false` as dry-run ON, and accepts a `--from-moodle` base with a query or fragment; `docs/self-host.md` step 3b still gives `--issuer` advice that cannot work for a different host.
**Constraints:** parser-level change only (`lti/manual-registration.js` untouched); every refusal returns 2 before any store call; existing tests stay green and unedited (new test files only); no «Що нового» entry (the HO1b entry must stay newest); touch nothing outside the file scopes.
**Success criteria:** MS-2 AC-19: every `--deployment-id` stored in order; any other repeated value flag, `--dry-run=<anything>` and a `--from-moodle` base with `?`/`#` exit 2 naming the flag with nothing saved; doc step 3 no longer advises `--issuer` for a different public address and states all endpoints share the issuer's origin.
**AC:** AC-19 (spec U-10). **Repo:** virtual-lab. **Overall risk:** risk (LTI trust anchor, security).
Research: research.md (same folder).
## Constraints
- Run backend tests from `backend/`; doc tests from the repo root; none needs the database.
- Orchestrator gate before the final commit: `cd backend && npm run test:unit` and the four doc tests of phase 2.
- Hidden oracle exists; never quote or locate it. Name flags literally in messages.
---
## Implementation Phases

### Phase 1: Parser refusals and deployment accumulation
**Skills:** cc-defensive-programming
**Model:** sonnet
**Gate:** Standard
**Depends on:** none
**File scope:** virtual-lab: backend/scripts/lti-add-registration.js, backend/test/unit/lti-add-registration-p1f.test.js
**AC:** AC-19
**Risk:** risk

**Goal:** Make `parseArgs`/`main` accumulate `--deployment-id` and refuse repeated, mis-valued or malformed input before anything is saved.

**Scope:**
- IN: collect `--deployment-id` values into an array passed as `deploymentIds`; throw on a second occurrence of any other value flag (both `--flag v` and `--flag=v`), naming it; throw on `--dry-run=<value>` naming `--dry-run`; refuse a `--from-moodle` value containing `?` or `#` naming `--from-moodle`; USAGE says `--deployment-id` may repeat; new test file.
- OUT: `lti/manual-registration.js`, new flags, existing tests, docs.

**Edge cases:**
- `--deployment-id a --deployment-id=b,c --deployment-id a` -> `['a','b','c']` (order, dedupe).
- Repeat via mixed forms (`--client-id x --client-id=y`) refused; repeat of `--from-moodle` and `--issuer` refused.
- `--dry-run=`, `--dry-run=false`, `--dry-run=true` all refused; bare `--dry-run` and `--help` unchanged.
- `--from-moodle https://m.example/moodle?` (empty query), `...#`, `...?x=1`, `...#f` refused; `https://m.example/moodle/` still valid.
- Missing value (`--deployment-id` as last arg or followed by `--x`) keeps the existing "needs a value" error.
- Refusal paths never call `store.saveRegistration`; USAGE still appended; exit code 2.

**Produces:** `parseArgs(argv)` returns `deploymentIds: string[]` (empty array absent the flag handled as missing by `normaliseRegistration`); refusals thrown as `Error` and mapped to exit 2 by `main`.
**Security-sensitive:** yes (untrusted CLI input into the LTI trust anchor)

**Done when:**
- [ ] DW-1.1: `main` with two or more `--deployment-id` stores all of them in order (spaced, `=`, comma and mixed forms; duplicates collapsed). Run: `cd backend && node --test test/unit/lti-add-registration-p1f.test.js`
- [ ] DW-1.2: a repeat of any other value flag returns 2, `err` names that flag, `store.written` is empty (one case per flag: issuer, client-id, auth-login-url, auth-token-url, jwks-uri, from-moodle)
- [ ] DW-1.3: `--dry-run=<anything>` returns 2 naming `--dry-run`; bare `--dry-run` returns 0 and writes nothing
- [ ] DW-1.4: `--from-moodle` with `?x=1`, `#f`, bare `?`, bare `#` returns 2 naming `--from-moodle`, nothing saved; a clean sub-path base returns 0
- [ ] DW-1.5: `cd backend && node --test test/unit/lti-add-registration-p1f.test.js test/unit/lti-add-registration-io.test.js test/unit/lti-manual-registration.test.js test/unit/lti-manual-registration-issuer.test.js` exits 0 with no existing test edited; `git diff --stat` shows `lti/manual-registration.js` unchanged

### Phase 2: self-host doc, LTI step 3
**Skills:** code-clarity-and-docs
**Model:** sonnet
**Gate:** Minimal
**Depends on:** none
**File scope:** virtual-lab: docs/self-host.md, scripts/test/selfhost-doc-lti-p1f.test.mjs
**AC:** AC-19
**Risk:** normal

**Goal:** Make step 3b state what the script now does: endpoints share the issuer's origin, `--issuer` no longer sold as the answer for a different host, `--deployment-id` repeatable.

**Scope:**
- IN: step 3b text of «Робота як LTI-інструмент» only; a new doc test.
- OUT: every other section, any «Що нового» entry, existing doc tests, the script.

**Edge cases:**
- Keep the phrases `саме тим рядком`, `Platform ID`, `https://host/moodle` and the word `issuer` in step 3 (existing guard test).
- The first dated «Що нового» bullet must remain `2026-11-23` (HO1b).
- Step 3 slice is located by `### Крок 3` .. `### Крок 4`; do not rename those headings.

**Produces:** nothing downstream.

**Done when:**
- [ ] DW-2.1: step 3 no longer contains the advice to add `--issuer` when the public address differs (new test asserts the old sentence is absent)
- [ ] DW-2.2: step 3 states that every endpoint (auth, token, jwks) must be on the issuer's origin, and that `--deployment-id` may be repeated
- [ ] DW-2.3: no «Що нового» bullet added; the newest one still starts `- **2026-11-23`
- [ ] DW-2.4: `node --test scripts/test/selfhost-doc-lti-p1f.test.mjs scripts/test/selfhost-doc-lti-issuer.test.mjs scripts/test/selfhost-doc-lti-manual-registration.test.mjs scripts/test/verify-backup-docs.test.mjs` exits 0

---
## Test Coverage
**Level:** Per-phase
## Test Plan
- [ ] Phase 1 clean: two/three deployment ids, mixed forms, comma list, dedupe, stored row equals expected; sub-path base accepted
- [ ] Phase 1 dirty: each other value flag repeated (6 cases) -> 2 and nothing saved; `--dry-run=false|true|` -> 2; `?x=1`, `#f`, bare `?`, bare `#` bases -> 2; missing value after `--deployment-id` -> 2; `--help` still 0
- [ ] Phase 1 regression: the three existing script test files pass unchanged
- [ ] Phase 2 clean: step 3 contains the origin statement and the repeatable `--deployment-id` mention plus the kept guard phrases
- [ ] Phase 2 dirty: old `--issuer` advice sentence absent; newest «Що нового» bullet is still HO1b's
- [ ] Gate: `cd backend && npm run test:unit` plus the four doc tests; integration tests need the DB lock (`vl-db.lock`) and are unaffected

---
## Notes
- Phases are independent (disjoint File scope) and may run in parallel; one commit per phase in virtual-lab.
- Phase 1 is Security-sensitive: it gets one blocking REVIEW before its commit.
- Open questions: none. Assumption: a value starting with `--` keeps the existing "needs a value" refusal.
---
## Decided During Build
_Filled by /code-foundations:build — one row per decision an agent made or question it raised:_
| # | Phase | Decision or question | Source | Status |
---
## Execution Log
_To be filled during /code-foundations:build_
