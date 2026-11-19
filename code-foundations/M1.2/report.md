# M1.2 — release handoff: task report (W3, 2026-11-18)

Objective: `selfhost-check` green on a fresh `origin/main`, and a "what's new / how to
update" section for admins in `docs/self-host.md`. Decision #11 superseded by the owner
(2026-11-17: no production access — the university builds and runs the repo itself).
Build notes `notes.md`. Branch `M1.2-release-handoff`.

## Deliverable (virtual-lab, 1 commit)

- `38274c9` — `docs/self-host.md` release-handoff section (+67/−8), pushed:
  `## Оновлення` = 4-step update procedure (backup + verify → pull → `up --build` →
  health check), the volume list fixed to 5 (previews was missing), dated `Що нового`
  admin-visible bullets (HO1, B6, P5a, A10, LTI, isolation), release = state of `main`
  (no tags), `/api/health` identity.

## Gate evidence

- `selfhost-check` **GREEN, 11/11** on a fresh `origin/main` clone (`main@8aed400`)
  under `vl-db.lock`: backup 9 checks + `verified` marker, smoke 7 passed (10.2 s).
  Log: `C:/Users/HuGox/AppData/Local/Temp/opencode/w3/m12-check.txt`.

## Review verdict

Accuracy review **PASS, 10/10** — every command/claim checked against the repo, CLI
executed. Non-blocking notes recorded in `notes.md` (approve `versionId` optional for
scripts; backup/out path assumes `BACKUP_DIR` unset; LTI date 10-27 = range start).

## Open items

None. P1b, P5b, R3, HO1a own their own follow-ups.
