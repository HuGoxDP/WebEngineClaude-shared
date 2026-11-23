sha: e85b77e76684ca342da4f04de07920b0e42f1c44
repo: virtual-lab
round: 2
reviewer: opus, high (fresh)
open-blocking: 0
---
- [closed] correctness backend/lti/manual-registration.js:44,72 — issuer stored as origin — now `issuer = str(input.issuer)` stored verbatim (parseHttpsUrl only validates), same as registration.js:80; `--from-moodle https://h.example/moodle/` saved issuer `https://h.example/moodle`, endpoints `/moodle/mod/lti/{auth,token,certs}.php`; lti-manual-registration-issuer.test.js + subpath integration test green.
- [closed] correctness backend/scripts/lti-add-registration.js:118-149 — out/err as functions — now `out.write`/`err.write`, defaults process.stdout/stderr; lti-add-registration-io.test.js passes `{write}` recorders (help 0, dry-run JSON 0, refused 2); all P1c tests migrated to `{write}`.
- [closed] correctness backend/scripts/lti-add-registration.js:102-104 — --from-moodle dropped explicit endpoint flags — explicit flags now override the defaults and go through the origin check; probe: `--auth-login-url https://evil.example/x`, `--jwks-uri …evil…`, `--auth-token-url=…evil…`, `:8443` port → exit 2, nothing saved; empty `--jwks-uri=` → exit 2; same-origin override → 0.
- [open] non-blocking docs/self-host.md:539 (and scripts/lti-add-registration.js:20) — "different public address → add --issuer" still cannot work for a different host — probe `--from-moodle https://m.example --issuer https://pub.example` → exit 2 (auth_login_url host).
- [closed] non-blocking backend/test/integration/lti-manual-registration.test.js:50 — t.skip replaced by an early-return `dbReady()` guard; no `skip` left in either integration file.
- [open] non-blocking backend/scripts/lti-add-registration.js:67,75 — `--dry-run=false` turns dry-run ON (fail-safe); repeated `--deployment-id` keeps only the last.
- [closed] non-blocking backend/lti/manual-registration.js:86 — deployment ids now capped at 255 (probe: 256 chars → exit 2).
- [open] non-blocking backend/scripts/lti-add-registration.js:81-87 — `--from-moodle` with a query/fragment builds endpoints inside the query (`https://h.example/moodle?x=1/mod/lti/auth.php`) and exits 0; same origin, so no trust widening — reject search/hash on the base.
