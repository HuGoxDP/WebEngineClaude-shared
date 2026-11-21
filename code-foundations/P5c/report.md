# P5c — Report (W3, 2026-11-21)

Task: P5c — BACKUP_DIR host-folder semantics (Claude review 2026-11-19 of HO1/M1.2).
Branches: `P5c-backup-dir-semantics` in `virtual-lab` and `.claude-shared`.
Task workspace: `E:/Projects/WebstormProjects/WebEngine/.workers/W3/` (worktrees
`W3/virtual-lab`, `W3/.claude-shared`).

## What was done per phase

Single ¼ h row; coder build phases (see `notes.md` for detail), then verifier gates:

1. **RED test** (`528a080`, virtual-lab): `scripts/test/compose-backup-dir.test.mjs`,
   4 tests — env literal pin, single-interpolation pin, selfhost-check `-e`
   workaround pin (KEEP decision), live `docker compose config` probe with
   `BACKUP_DIR=/x`. Static tests RED before the fix (proven by the verifier on
   base `8beafab`: literal-match=false, uses=2≠1).
2. **Fix** (`fdbe79c`): `docker-compose.yml` backup env → literal
   `BACKUP_DIR: /backups` (with Compose-precedence comment); mount source
   `${BACKUP_DIR:-./backup/out}:/backups` untouched; `scripts/selfhost-check.mjs`
   comment only — workaround KEPT (check clones pre-P5c refs too).
3. **Docs** (`7a6983b`): `docs/backup-restore.md` host-folder section,
   `docs/self-host.md` paragraph + «Що нового» entry, `.env.example` commented
   `BACKUP_DIR` block (inert to `buildEnv`).
4. **Shared** (`397b692` claim, `5121d5c` notes): claim row + build notes.
5. **Verify** (verifier, PASS pinned in `.workers/logs/P5c-verify-7a6983b.md`):
   RED proof on base, all gates green — see counts below.

## Git log / diff per repo

### virtual-lab (`git log --oneline origin/main..HEAD`)

```
7a6983b docs(P5c): BACKUP_DIR is the host folder — backup-restore, self-host guide, .env.example
fdbe79c fix(P5c): pin backup container env BACKUP_DIR=/backups; host folder only via the mount source
528a080 test(P5c): RED — backup container env must be literal /backups, BACKUP_DIR only the host mount source
```

`git diff --stat origin/main...HEAD`:

```
 .env.example                             |  7 +++
 docker-compose.yml                       |  6 +-
 docs/backup-restore.md                   | 22 ++++++++
 docs/self-host.md                        | 14 +++++
 scripts/selfhost-check.mjs               |  4 ++
 scripts/test/compose-backup-dir.test.mjs | 95 ++++++++++++++++++++++++++++++++
 6 files changed, 147 insertions(+), 1 deletion(-)
```

### .claude-shared (before this report commit)

```
5121d5c docs(P5c): build notes — BACKUP_DIR host-folder semantics, RED reasoning, keep-workaround decision
397b692 Claim P5c (W3)
```

`git diff --stat origin/main...HEAD` (before report commit):

```
 ROADMAP.md                    |  2 +-
 code-foundations/P5c/notes.md | 79 +++++++++++++++++++++++++++++++++++++++++++
 2 files changed, 80 insertions(+), 1 deletion(-)
```

This report commit adds `code-foundations/P5c/report.md` and ticks the P5c
ROADMAP row `✅ 2026-11-21 W3` (only that row).

## Check results (verifier run, PASS @ virtual-lab 7a6983b / shared 5121d5c)

- RED proof on base `8beafab`: both static assertions fail (env literal absent,
  2 interpolations ≠ 1) — confirmed independently of the coder's reasoning.
- `npm run test:scripts` (virtual-lab root): **97/97 pass** (was 93/93; +4 new).
- `cd backend && npm run test:unit`: **308/308 pass** (unchanged count).
- Live compose config probe under `vl-db.lock`: **4/4** —
  `BACKUP_DIR=/x` → resolved env `/backups`, mount source `/x`.
- Junk check: both worktrees porcelain empty; diff lists exactly the intended
  files (6 in virtual-lab; ROADMAP P5c row + notes in shared).

## Deviations (recorded)

- **Rebase + force-with-lease sync** of the shared claim branch onto origin/main
  `3e4fa2a` (recorded ATTENTION): `git merge` was not in the coder allowlist;
  claim touches only the P5c row, rebase applied without conflict.
- **Hand-written run.lock** earlier in the task (recorded ATTENTION).
- **Postgres suite / browser e2e skipped per lead decision**: config/doc row,
  M1.2r precedent (unit + scripts only). No editor e2e, no ports 8044/8045/4200.

## What remains

Nothing. New follow-up ROADMAP rows: none.

Junk check: passed (both repos, porcelain empty).
Graph: engine not touched → no graphify update.

Merge into main?
(Pre-granted autonomous merge per owner 2026-11-21 — proceeding.)