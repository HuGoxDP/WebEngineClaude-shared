# Research: P1f, lti-add-registration input hardening

**Summary:** Close three open non-blocking P1c findings on `backend/scripts/lti-add-registration.js` plus one stale doc claim, as MS-2 AC-19 (LTI trust anchor registration input, risk/security).
**Date:** 2026-11-25
**Status:** confirmed (autonomous run: decisions taken by recommendation; no interactive grill)
**Sources:** MS-2 spec.md (AC-19, U-10, decision list), draft-notes.md item 5, P1c review-premerge.md (three `[open] non-blocking` lines), virtual-lab `origin/ms/1` code read-only, graphify query on the virtual-lab graph (it resolves the LTI test communities but has no node for the script; code was read directly).

## Problem
`lti-add-registration.js` writes the `lti_registrations` row the launch path trusts (issuer, client id, deployment ids, three endpoints). Its argument parser is lenient where the row is a trust anchor:
1. A repeated `--deployment-id` keeps only the last value (`args[key] = value`), silently dropping a deployment that Moodle may legitimately have.
2. Any repeated value flag silently overwrites (`--client-id a --client-id b` stores b).
3. `--dry-run=false` is accepted and turns dry-run ON (inline value ignored); a boolean flag must take no value.
4. `--from-moodle https://h/moodle?x=1` builds endpoints inside the query string and exits 0 (same origin, so no widening, but the row is garbage).
5. `docs/self-host.md` step 3b tells the admin to add `--issuer` when the public address differs; that cannot work for a different host (`--from-moodle https://m.example --issuer https://pub.example` exits 2: endpoints derive from the base and must be on the issuer origin).

## Verified facts
- `normaliseDeployments` (lti/manual-registration.js) takes an array or comma/space string, trims, de-duplicates in order, caps 255 chars. Accumulation therefore needs only the parser to collect an array.
- `normaliseRegistration` enforces https, no credentials, endpoints on the issuer origin; that module stays untouched (shared by tests and runtime rules).
- `main(argv, io)` takes `{store, out, err}` with `write(string)`; refusals go `err.write(message + USAGE)` and return 2 before any `store` call; the unit tests use a stub store.
- Existing guards to keep green: `lti-add-registration-io.test.js`, `lti-manual-registration.test.js`, `lti-manual-registration-issuer.test.js` (backend/test/unit), `selfhost-doc-lti-issuer.test.mjs` (step 3 must keep `issuer`, `саме тим рядком`, `Platform ID`, `https://host/moodle`), `selfhost-doc-lti-manual-registration.test.mjs`.
- `verify-backup-docs.test.mjs` requires the newest «Що нового» bullet to start `- **2026-11-23` (HO1b). AC-19 asks only for a step-3 text change, so P1f adds no «Що нового» entry.
- Backend `test:unit` = `node --test "test/unit/*.test.js"`; doc tests are `node --test scripts/test/<file>.mjs`. Neither needs the database.

## Requirements (confirmed)
R1 Every `--deployment-id` (spaced or `=` form) is stored, in order; each value may itself be comma-separated; duplicates collapse (existing behaviour).
R2 A repeat of any other value flag exits 2, message names the flag; nothing saved.
R3 `--dry-run=<anything>` (including empty) exits 2 naming `--dry-run`; bare `--dry-run` unchanged.
R4 A `--from-moodle` value containing `?` or `#` exits 2 naming `--from-moodle`; sub-path bases stay valid.
R5 Every refusal happens before any store call.
R6 Doc step 3: remove the add-`--issuer`-for-different-address advice; state every endpoint must share the issuer's origin; mention repeatable `--deployment-id`.

## Boundaries
OUT: changing `lti/manual-registration.js`, launch/grades trust code, new flags, a «Що нового» entry, editing existing tests (new test files only), engine or other repos.

## Decisions (kept from the first pass; the research did not change them)
- Repeated `--deployment-id` accumulates (draft decision D-20261123T1157Z-p1..p3 family); other repeats refused.
- Raw `?`/`#` substring check on the `--from-moodle` value, because an empty trailing `?` leaves `URL.search` empty.
- Messages in Ukrainian like the existing ones, naming the flag literally.
- Parser-level checks live in the CLI (`parseArgs`/`main`), not the shared rules module.

## Risks
- Trust anchor: fail closed. A looser parser would store a row that 403s later or points endpoints oddly; a stricter one must not reject today's valid invocations (single `--deployment-id a,b`, `--flag=value`, sub-path base without query).
- Regression in existing script/doc tests; `--help` and USAGE must keep working.
- Doc edit must not touch the «Що нового» ordering.

## Still open
None blocking. Accepted assumption: a value that begins with `--` is still treated as a missing value by the existing rule (unchanged).
