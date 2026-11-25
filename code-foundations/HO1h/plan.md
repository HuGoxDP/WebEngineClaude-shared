# Plan: HO1h — verifier CLI errors and docs (virtual-lab, MS-2)
**Created:** 2026-11-25
**Status:** ready
**Complexity:** simple
**Review cadence:** 2
**Check-ins:** quiet
---
## Context
Problem: both verify-backup CLIs print stack traces on fs errors, treat `-x` as a directory, accept a regular file as the `--newest` root and do nothing when started through a symlink; restore.mjs prints an unquoted backup name; two doc lines mislead. Research: `code-foundations/HO1h/research.md` (decisions 1-6). Spec: MS-2 AC-20, U-9. Base: the `ms/1` tip that includes HO1e (CLI on `verifyBackupStream`); the builder re-reads `backup/verify-backup.mjs` first.
Constraints: no existing test file modified/renamed; new tests only; no `skip`/`todo` (early return instead); no «Що нового» entry; verify results and exit 0/1 unchanged; no stderr line matching `^\s+at `.
Success: AC-20 and U-9 hold; `npm run test:scripts` green.

## Phases

### Phase 1: Verifier CLI hardening
**Skills:** cc-defensive-programming
**Model:** sonnet
**Gate:** Standard
**Depends on:** none
**File scope:** virtual-lab: backup/verify-backup.mjs, scripts/lib/verify-backup.mjs, scripts/test/verify-backup-cli-errors.test.mjs
**AC:** AC-20 (CLI parts), U-9
**Risk:** low-normal; shares the CLI path with HO1e output; symlink/EACCES tests are platform-dependent.

**Goal:** Both CLIs reject unknown options, name bad `--newest` roots, report fs errors as a named exit 1, and run through a symlink.

**Scope:**
- IN: runCli arg parsing (any `-`-prefixed arg except `--newest` -> usage exit 2); `--newest` path pre-check (missing / regular file / unreadable -> one line with path + reason, exit 2); try/catch around verify in runCli (exit 1, `not verified: <code>: <message>`); realpath-based isMain helper exported from backup/verify-backup.mjs and used by both entries, with `.catch` backstop; new test file.
- OUT: verifyBackup/Stream results, check names, exit 0/1 meaning, restore.mjs, docs.

**Edge cases:** `--newest` with no value or `-x` value; empty-string arg; dir `./-x`; unreadable root (test returns early as root/Windows); dangling symlink; error without `.code`; no `^\s+at ` on stdout/stderr.

**Done when:**
- [ ] DW-1.1: `-x`, `-`, `--bogus`, `--newest -x` each exit 2 with usage on both CLIs.
- [ ] DW-1.2: `--newest` on a missing path, a regular file, and (non-root POSIX) an unreadable dir exits 2 with one stderr line containing the path and the reason.
- [ ] DW-1.3: an fs error during verification exits 1 with a named error line and no stack trace on stderr.
- [ ] DW-1.4: invoked via a symlink to each CLI file, a good backup exits 0 and prints `verified:`; the test returns early if symlink creation fails.
- [ ] DW-1.5: good backup exit 0 / bad backup exit 1 and the printed check lines are unchanged (U-9).

### Phase 2: restore.mjs hint quoting
**Skills:** none -- small string-quoting change
**Model:** sonnet
**Gate:** Standard
**Depends on:** none
**File scope:** virtual-lab: backup/restore.mjs, scripts/test/restore-hint-quoting.test.mjs
**AC:** AC-20 (restore part)
**Risk:** low; existing restore.test.mjs and verify-backup-docs.test.mjs pin the unquoted form for plain names.

**Goal:** The suggested verify command quotes a backup name that contains spaces.

**Scope:**
- IN: small `shellQuote` for the two hint lines (single quotes only when the name has chars outside `[A-Za-z0-9_./:@%+=-]`; `'` escaped as `'\''`); new test spawning restore.mjs with a temp `BACKUP_DIR`.
- OUT: refusal logic, exit codes, the marker check.

**Edge cases:** name with a single quote; name with `$` or backticks; plain timestamp names byte-identical to base; dry run still refused.

**Done when:**
- [ ] DW-2.1: an unverified backup named `2026 11 25` -> stderr hint shows the name single-quoted in both command lines, exit 1.
- [ ] DW-2.2: a plain timestamp name prints exactly the base hint lines.
- [ ] DW-2.3: a name with `'` yields a correctly escaped quoted token.

### Phase 3: Docs integrator
**Skills:** none -- two doc edits
**Model:** sonnet
**Gate:** Minimal
**Depends on:** Phase 1
**File scope:** virtual-lab: docs/backup-restore.md, docs/self-host.md, scripts/test/verify-backup-docs-ho1h.test.mjs
**AC:** AC-20 (docs part)
**Risk:** low; pins in verify-backup-docs.test.mjs and selfhost-doc.test.mjs must stay green; no «Що нового» entry (spec requires none, newest stays HO1b's).

**Goal:** The docs state the EACCES symptom only for a non-root host run and list both marker symptoms.

**Scope:**
- IN: docs/backup-restore.md host-alternative comment (EACCES only for a non-root host run, not in the image); docs/self-host.md (~L177) both `cannot write the verified marker` and `cannot remove the stale verified marker`; new fs-read docs test.
- OUT: «Що нового», CHANGELOG, other docs.

**Edge cases:** existing pinned phrases untouched; newest «Що нового» entry remains HO1b's.

**Done when:**
- [ ] DW-3.1: backup-restore.md has no unconditional root-owned/EACCES claim; EACCES appears with "non-root".
- [ ] DW-3.2: self-host.md contains both marker messages.
- [ ] DW-3.3: `verify-backup-docs.test.mjs` and `selfhost-doc.test.mjs` still pass.

## Test Coverage
100% of DW items. New files: scripts/test/verify-backup-cli-errors.test.mjs, scripts/test/restore-hint-quoting.test.mjs, scripts/test/verify-backup-docs-ho1h.test.mjs.

## Test Plan
- CLI/spawn: DW-1.1..1.5, 2.1..2.3; fs-read: DW-3.1..3.2.
- Dirty tests: Phase 1 `--newest` regular file, `--newest -x`, fs throw mid-verify, no `^\s+at ` on stderr; Phase 2 name with `'` / `$`; Phase 3 absence of the unconditional claim.
- Integration: `npm run test:scripts` green, existing tests untouched.
- Manual: none.
