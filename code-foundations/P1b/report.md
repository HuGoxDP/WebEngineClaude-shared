# P1b — LTI registration guide: task report (W3, 2026-11-18)

Objective (ROADMAP P1b, `PLAN.md` §2.10(b)): give the university's admins a step-by-step
LTI registration guide in `docs/self-host.md`, verified end to end against the local
`lti-demo` Moodle. The real KSU registration is done by the university's admins.

Deliverable: virtual-lab `docs/self-host.md` section «Робота як LTI-інструмент (Moodle)»
(`0c9697d`, +100/−2; review fixes `11dc4ba`, +12/−7, both pushed): HTTPS-both-sides
prerequisite, `.env` vars (`LTI_PUBLIC_URL`, `LTI_REGISTRATION_SECRET` ≥16,
`LTI_FRAME_ANCESTORS`), tool-key volume, one-link registration with the exact Moodle 5.0.2
UI labels, manual URL table (launch/login/jwks, `private_key_jwt` RS256, AGS scopes),
secret rotation, teacher/student flow, troubleshooting incl. Safari-ITP; «Що нового»
cross-ref. Build notes `notes.md`.

## E2E evidence (live `lti-demo` stand, main@6eeb6bf, Moodle 5.0.2 Build 20250811)

Curl-level (Python requests + stand CA); 40 evidence files `w3/p1b-verify-*.txt` in
`C:/Users/HuGox/AppData/Local/Temp/opencode/`.

| Step | Result |
|---|---|
| Registration | `FHPGYDKOYPWeRVW` intact, active |
| Teacher deep-link | activity cmid 19, grademax 100 |
| Student launch | student2 → 303 `/play/electric-circuits?lti=1` |
| Session | `graded: true` |
| Submit | 0.85 → 200 |
| Gradebook | rawgrade 85, finalgrade 85 |
| Replay | 409 «Роботу вже здано» |

Platform images rebuilt for the run (old image deleted from the store; cache + sha256
spot-checks proved running code == HEAD). Stand stopped after; volumes, registration and
grade kept; host unchanged.

## Review verdict

Accuracy review **PASS, 11/11 items** vs code with file:line. 3 notes → all fixed in
`11dc4ba`: step-4 restart keeps the HTTPS overlay flags; key-loss wording softened (Moodle
fetches JWKS dynamically); `down -v` cause = platform DB wiped, not just key regeneration.

## Open items (non-blocking)

- Real KSU registration — university admins, out of worker scope.
- KSU Moodle version unconfirmed — the guide states verified-on-5.0.2.
- Safari picker untested — pre-existing, documented in troubleshooting.
- NRPS + server-side score verification — out of scope per `PLAN.md` §2.10(c).
