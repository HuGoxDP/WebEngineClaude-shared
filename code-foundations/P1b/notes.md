# P1b — LTI registration guide: build notes (W3, 2026-11-18)

Task (ROADMAP P1b, `PLAN.md` §2.10(b)): a step-by-step LTI registration guide for admins in
`docs/self-host.md`, verified end to end against the local `lti-demo` Moodle. The real KSU
registration is done by the university's admins — out of worker scope. ½-day task.

Branch `P1b-lti-registration-guide` (virtual-lab + .claude-shared).

## What landed (virtual-lab)

- `0c9697d` — `docs/self-host.md` new section «Робота як LTI-інструмент (Moodle)», placed
  between the HTTPS and Editor sections (+100/−2):
  - HTTPS-on-both-sides prerequisite (platform and Moodle);
  - `.env` vars: `LTI_PUBLIC_URL`, `LTI_REGISTRATION_SECRET` (≥16 chars),
    `LTI_FRAME_ANCESTORS`; tool-key volume;
  - one-link registration with the exact Moodle 5.0.2 UI labels;
  - manual registration: URL table (launch/login/jwks), `private_key_jwt` RS256, AGS scopes;
  - secret rotation step; teacher deep-link and student launch/submit flow;
  - troubleshooting incl. the Safari-ITP caveat;
  - «Що нового» bullet cross-referencing the section.
- `11dc4ba` — review fixes (+12/−7), all 3 review notes addressed (below).

## Verification

**(a) Live e2e on the `lti-demo` stand**, main checkout @`6eeb6bf`, curl-level
(Python requests + the stand CA). 40 evidence files `w3/p1b-verify-*.txt` in
`C:/Users/HuGox/AppData/Local/Temp/opencode/`.

- Registration `FHPGYDKOYPWeRVW` intact and active.
- Teacher deep-link → activity cmid 19, grademax 100.
- student2 launch → 303 `/play/electric-circuits?lti=1`; session `graded: true`.
- Submit 0.85 → 200; Moodle gradebook rawgrade 85 / finalgrade 85.
- Replay → 409 «Роботу вже здано».
- Moodle 5.0.2 Build 20250811 confirmed.
- Platform images rebuilt for the run (old image deleted from the store; cache + sha256
  spot-checks proved running code == HEAD). Stand stopped after; volumes, registration and
  grade kept; host unchanged.

**(b) Accuracy review: PASS, 11/11 items** checked against the code with file:line.
3 notes, all fixed in `11dc4ba`:

1. Step-4 restart now keeps the HTTPS overlay flags.
2. Key-loss wording softened — Moodle fetches JWKS dynamically, so a regenerated key is
   picked up without re-registration.
3. `down -v` cause corrected: the platform DB is wiped, not just key regeneration.

## Left open

- Real KSU registration — university admins (out of scope).
- KSU Moodle version unconfirmed — the guide states verified-on-5.0.2.
- Safari picker untested (pre-existing, documented).
- NRPS + server-side score verification — out of scope per `PLAN.md` §2.10(c).
