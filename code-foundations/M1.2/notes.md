# M1.2 — release handoff: build notes (W3, 2026-11-18)

Task (ROADMAP M1.2): `selfhost-check` green on a fresh `origin/main`, and a
"what's new / how to update" section for admins in `docs/self-host.md`. Decision #11
superseded by the owner (2026-11-17: no production access — the university builds and
runs the repo itself). ¼-day docs task on top of HO1; branch `M1.2-release-handoff`.

## What landed (virtual-lab)

- `38274c9` — `docs/self-host.md` release-handoff section (+67/−8), pushed, review PASS:
  - `## Оновлення` expanded into a 4-step update procedure: backup + verify first →
    `git pull` → `docker compose up -d --build` → health check (`/api/health` build
    identity confirms the new code is running).
  - The volume list fixed: 5 volumes (the `previews` volume was missing from the stale
    4-volume list).
  - `Що нового` — dated, admin-visible bullets: HO1 self-host kit, B6 author publish
    keys, P5a HTTPS, A10 engine v0.2.0 release, LTI 1.3 for Moodle, scenario isolation.
  - A release = the state of `main` (no tags); `/api/health` as the identity check.

## Verification

- **`selfhost-check` GREEN, 11/11** on a fresh `origin/main` clone (`main@8aed400`)
  under `vl-db.lock`: backup **9 checks** + `verified` marker, smoke **7 passed
  (10.2 s)**. Log: `C:/Users/HuGox/AppData/Local/Temp/opencode/w3/m12-check.txt`.
- Accuracy review **PASS, 10/10 items**: every command and claim in the section checked
  against the repo; the CLI executed.

## Review notes (non-blocking)

- Approve `versionId` optional for scripts — mirrors the B6 wording.
- The backup/out path assumes `BACKUP_DIR` unset (compose default `./backup/out`).
- The LTI date 10-27 is the range start.
