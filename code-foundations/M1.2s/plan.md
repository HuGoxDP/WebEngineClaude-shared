# M1.2s plan — honest health-identity wording + rollback subsection (doc-only)

Branch `M1.2s-health-doc-rollback` (virtual-lab + .claude-shared). Research: `research.md` (read first — verified file:line facts and the option decision).

## Decision (card option choice, lead-visible)

**Option (b), doc-only**, for fix (1). Option (a) is not trivial: Dockerfile ARG+ENV, compose build-args **and** runtime-env plumbing, an update-step `git rev-parse` substitution admins must not forget, plus test extension (research §1). The operational gap it would close does not exist in this deployment model: the checkout **is** the release (no tags, local rebuild), so `git log -1 --oneline` in the checkout is the authoritative release identity, and `build.startedAt` confirms the restart. `build.version` stays a fixed `1.0.0` and `build.commit` stays null — deliberate per `health.js:18-19`; the doc stops claiming `build` identifies the release. **No code changes anywhere in this task.**

## Phase 1 — doc edits (virtual-lab worktree, `docs/self-host.md` only)

File scope: the :72-74 identity paragraph + a new rollback subsection inside «Як оновитися» (after step 4 / the selfhost-check line :115, before «Що нового» :117). Nothing else in the file. Ukrainian, matching the doc's voice.

1. **Identity paragraph (:72-74)** — rewrite to: release = state of `main`, no tags; **which release runs is shown by `git log -1 --oneline` in the checkout** (the stack is built from it); `GET /api/health` confirms liveness (`"db":"connected"`) and `build.startedAt` confirms the restart after the rebuild. Keep the engine parenthetical (`?diag=1` stamp) — it is accurate. Do not claim `build.version`/`build.commit` identify anything.
2. **Rollback subsection** «Якщо оновлення не вдалося» (heading level `###`, sibling of «Як оновитися» steps stay untouched):
   - Order: (i) `git checkout <попередній коміт>` (the commit recorded before `git pull` — tell admins step 2's `git log -1 --oneline` output is what to note); (ii) `docker compose up -d --build` (plain form, **COMPOSE_FILE-neutral** — same as step 3 today, M1.2r layers overlay guidance later); (iii) restore the **step-1 backup** onto the live stack.
   - **Forward-only warning first**: migrations only go forward (`backend/migrations.js`; 011 is a point of no return), so old code needs the pre-update database — checkout alone is not a rollback.
   - Restore commands, adapted from the `docker-compose.restore.yml:7-11` header for the live stack (no `-p`, no scratch overlay), dry run first then `--yes`:

     ```bash
     docker compose -f docker-compose.yml -f docker-compose.restore.yml \
       run --rm --entrypoint node -e BACKUP_DIR=/backups \
       -v "$PWD/backup/out:/backups" backup restore.mjs <каталог-бекапу-кроку-1>
     # те саме з --yes — коли dry run підтвердив, що це той бекап
     ```

     Note the `verified` marker requirement (step 1 already writes it; restore refuses unverified backups even in dry run — `restore.mjs:50-57`) and `--entrypoint node` (image entrypoint is backup.mjs).
   - **Data-loss warning**: the backup predates the update; everything written after it (uploads, approvals, LTI registrations) is lost on restore. Restore is destructive by design (`--clean --if-exists`), idempotent.
   - Finish: re-check `/api/health` + catalog; pointer to `docs/backup-restore.md` for the full procedure.
3. No edits to steps 1-4, «Що нового», HTTPS/editor sections (M1.2r territory), or any other file.

Verification (P1):
- `cd backend && npm run test:unit` — **308/308 expected** (measured at research time, 5.2 s, no Docker). Plain `npm test` includes integration and needs the test DB — do not use it here.
- Doc-claim cross-check: every command/flag in the new text against `docker-compose.restore.yml` header, `restore.mjs` arg parsing, `docker-compose.yml:133` backup mount, `health.js:21-28`. `git diff --stat` = `docs/self-host.md` only.

Gate: Minimal (doc-only). DW: identity paragraph no longer overclaims `build`; rollback subsection present with dry-run→`--yes` order, forward-only warning, data-loss warning; unit 308/308; diff scoped to one file.

## Phase 2 — report artifacts + ROADMAP (shared worktree)

File scope: `code-foundations/M1.2s/{notes,report}.md`, `ROADMAP.md` row :81.

- `notes.md`: build log (unit output, doc cross-check results).
- `report.md`: what changed, option-(b) justification, verification evidence, review verdict.
- ROADMAP:81 → `✅ 2026-11-20 W3` + one-line summary. **Date = claim date 2026-11-20** (claim stamped `🟡 W3 2026-11-20`; hr5 precedent = claim date, which was 11-19 for hr5).
- Practice bundle: date **2026-11-20** (`collect.py --date 2026-11-20`, `build_daily.py 2026-11-20`). Research-time side-check already ran: 0 tasks / 2 merges — hr5 merges surface; 0-tasks anomaly reported to lead, tooling untouched.

Gate: Minimal. DW: artifacts exist, ROADMAP row dated per convention, explicit-path commits, push both branches.

## Review + merge

Adversarial doc-accuracy review (review agent, read-only): every rollback command checked for syntax/flags against `docker-compose.restore.yml:7-11` + `restore.mjs` (dry-run default, `--yes`, `verified` gate, `--entrypoint node`, live-stack `-f` pair, backup path vs `docker-compose.yml:133`); health wording vs `health.js:21-28` (no claim that `version`/`commit` identify the release; `startedAt` = restart evidence only); forward-only claim vs `migrations.js` + `011` header; COMPOSE_FILE-neutrality (no `-f docker-compose.https.yml`/editor assumptions introduced, no conflict with M1.2r's planned overlay guidance); Ukrainian wording consistent with the doc.

Merge: **virtual-lab first** (repo P), then .claude-shared, `wk.sh merge-push` under `merge.lock`. Post-merge: doc-only — no Docker gates; re-run `npm run test:unit` in primary virtual-lab backend only if anything beyond the doc changed (it must not). Cleanup: delete task branches + `claims/M1.2s`, `wk.sh done W3`.

## Risks

- M1.2r collision: same file, next task. Mitigated by scope (identity paragraph + new subsection only) and plain-form rebuild command; if M1.2r merges first, rebase and keep its `COMPOSE_FILE` wording intact.
- Live-stack restore is destructive: the doc must lead with the dry run and the data-loss warning — review checks ordering, not just presence.
- `backup/out` path assumption: correct for the default `.env` (`BACKUP_DIR` unset → `./backup/out`); doc says "step-1 backup directory", admin substitutes the actual timestamped name. If an admin set `BACKUP_DIR`, the `-v` mount must point there — one sentence covers it.
- Do NOT touch backend code, Dockerfiles, compose files, tests, or `docs/backup-restore.md`.
