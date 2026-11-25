# Plan: HO1b2 — `selfhost-check --verify-in-container` (additive opt-in, MS-2)
**Created:** 2026-11-25
**Status:** ready
**Complexity:** simple
**Review cadence:** 2
**Check-ins:** quiet
---
## Context
`selfhost-check` verifies the backup it just took on the **host** (`verifyBackup` / after HO1e
`verifyBackupStream`), so the check's backup step needs host Node and host read/write access to a backup the
container wrote. HO1b (merged `b50ad68`) ships the verifier in the `backup` image. HO1b2 adds an **opt-in** flag
`--verify-in-container` that runs that in-image verifier through one compose child instead of the host verifier;
the default run stays exactly as it is (OWNER-DECISIONS #30, `decisions/HO1b2.md`: no test-guard exception).
Research (confirmed): `code-foundations/HO1b2/research.md`. Milestone MS-2 draft
(`.workers/milestones/MS-2/spec.md`): **AC-17** (hidden), **AC-26** (manual-AC, live Docker), **U-8**.

**Row and landing:** one row, one task branch from the then-current `origin/ms/2`, one landing; risk task →
Claude pre-merge review (`premerge-queue.md`). Serial file `scripts/selfhost-check.mjs`: HO1b2 lands **before**
HO1j starts on it. MS-2's base already carries HO1e/HO1f/R3's edits of that file — the plan names anchors
(function names, step names), never line numbers; read the file at the branch base.

**Success:** with the flag, the `backup` step is decided by the exit status of
`docker compose … run --rm --entrypoint node -e BACKUP_DIR=/backups -v <dir>:/backups backup verify-backup.mjs
--newest /backups`; without it every command, step, detail and the `parseArgs` output are the base's; the
self-check doc section teaches the flag; `npm run test:scripts` green with no existing test file touched.

## Constraints
- **Test guard:** never modify, delete or rename an existing test file, `e2e/` file, test config or `test*`
  script. New tests = NEW files under `scripts/test/` (picked up by the existing `scripts/test/*.test.mjs` glob).
  No `skip`/`todo` — a test that cannot run returns early.
- **Guard command** (each DW "guard command prints nothing"), on the task branch:
  `git diff --name-only --diff-filter=MDR origin/ms/2... -- scripts/test backup package.json package-lock.json "docker-compose*.yml" e2e`
- **U-8:** `parseArgs` default object unchanged (no `verifyInContainer` key unless the flag is given — pinned by
  `scripts/test/selfhost-check.test.mjs`); the existing host-verify lines of the backup step stay textually as they
  are (whatever HO1e left: `verifyBackupStream`), only wrapped in the `else` of the new branch; no change to any
  other step, to `teardownCommands`, `composeArgs`, `COMPOSE_INTERPOLATED`, the restore child or the CLI's
  default output.
- Not touched: `backup/**` (the verifier is HO1b/HO1e/HO1h's), compose files, root `package.json` (spec: nobody),
  `docs/self-host.md` outside the «Перевірка «чи працює моя установка?»» section.
- **No «Що нового» entry:** `scripts/test/verify-backup-docs.test.mjs` pins the first dated bullet of «Що нового»
  as the 2026-11-23 HO1b entry; a new entry on top breaks it (research trap 1).
- «Перевірка» section rule (`scripts/test/selfhost-interrupt.test.mjs`): the section keeps `Ctrl+C`,
  `interrupted`, `130`, the manual teardown command; no new `docker compose … -f docker-compose…` line (or it needs
  «без HTTPS» within the 4 lines above) — this plan adds none.
- Size: ≈ 40 non-test lines (code) + ≈ 10 doc lines. Windows dev machine (Git Bash), Node 24; no Docker needed by
  any test here.

---
## Implementation Phases

### Phase 1: The opt-in flag, the in-container verify child, and its tests
**Skills:** code-foundations:cc-defensive-programming
**Model:** sonnet
**Gate:** Standard
**Depends on:** none
**File scope:** virtual-lab: scripts/selfhost-check.mjs, scripts/test/selfhost-incontainer-verify.test.mjs
**AC:** AC-17, U-8 (AC-26 is the live run of this code, manual-AC at close)
**Risk:** risk

**Goal:** `--verify-in-container` / `runCheck({verifyInContainer: true})` replaces the host verifier with one
compose child whose exit status decides the `backup` step; the default path is untouched.

**Scope:**
- IN:
  - `parseArgs`: one branch `else if (arg === '--verify-in-container') out.verifyInContainer = true;` — the
    literal default object is **not** changed; JSDoc return type gains `verifyInContainer?: true`.
  - New export beside `teardownCommands`: `containerVerifyArgs(backupDir, { https })` (contract below).
  - `runCheck` option `verifyInContainer = false`. In the backup step, **after** the existing
    `produced = newestBackup(backupDir)` null-check (unchanged in both modes): if `verifyInContainer`, run
    `exec('docker', containerVerifyArgs(backupDir, { https }), { cwd: cloneDir, timeout: 10 * 60_000, env: dockerEnv })`;
    non-zero / `status: null` → `step('backup', false, why(res))`, then `if (await checkpoint()) return interrupted();`
    (MS-1 AC-12 rule), then `return { ok: false, steps, failed: 'backup' }`; exit 0 →
    `step('backup', true, \`verified in the backup container, ${path.basename(produced)}\`)`. `else` = the existing
    host-verify lines, unchanged. The following checkpoint, the `backup marker` step (`existsSync` on the host
    mount) and everything after stay shared and unchanged.
  - USAGE: one line `--verify-in-container  verify the backup inside the backup container
    (verify-backup.mjs --newest /backups) instead of on the host; the cloned --ref must ship the verifier in its
    backup image`.
  - CLI (`isMain`): pass `verifyInContainer: opts.verifyInContainer === true`; the start line gets the suffix
    ` verify=container` **only** when the flag is set.
- OUT: making it the default; a project volume for backups; parsing the child's stdout (`newest backup:`) as a pass
  condition; any `backup/**` change; HO1j's interrupt work.

**Edge cases:** child exits non-zero because the cloned ref's image has no `verify-backup.mjs` (`Cannot find
module` tail — honest `RED at backup`); spawn failure `{status: null, error}` (detail carries the error message via
`why`); child interrupted by Ctrl+C (abort observed first → `interrupted`, teardown runs); child exit 0 but no marker
on the host mount (`backup marker` fails `missing`, as on the base); https mode (overlay file in the child's `-f`
list); an exported `BACKUP_DIR`/`DB_PASSWORD` in the caller's shell (scrubbed env); `--verify-in-container=x`
(unknown argument).

**Produces:** `export function containerVerifyArgs(backupDir: string, opts?: { https?: boolean }): string[]` =
`composeArgs(['run', '--rm', '--entrypoint', 'node', '-e', 'BACKUP_DIR=/backups', '-v', \`${backupDir}:/backups\`,
'backup', 'verify-backup.mjs', '--newest', '/backups'], { https })`; `parseArgs` → `verifyInContainer: true` only
when flagged; `runCheck({ verifyInContainer?: boolean })`. Phase 2 documents exactly this flag and command form.

**Done when:** `node --test scripts/test/selfhost-incontainer-verify.test.mjs && npm run test:scripts` exits 0 and
the guard command prints nothing.
- [ ] DW-1.1: `parseArgs(['--verify-in-container']).verifyInContainer === true`; `'verifyInContainer' in
  parseArgs([])` is false; `parseArgs(['--https', '--verify-in-container', '--lock', '/l'])` has `https: true`,
  `verifyInContainer: true`, `lock: '/l'`; `parseArgs(['--verify-in-container=yes'])` throws `/unknown argument/`.
- [ ] DW-1.2: `containerVerifyArgs('/h/b')` deep-equals the Produces array for both `https: false` and
  `https: true` (overlay `-f docker-compose.https.yml` after the selfcheck file, before `run`); joined with spaces it
  contains `--entrypoint node`, `-e BACKUP_DIR=/backups` and `verify-backup.mjs --newest /backups`.
- [ ] DW-1.3: A `runCheck` harness (fake `exec`/`git`/`probe` in the new file, pattern of
  `selfhost-restore.test.mjs`; host mount taken from the child's `-v`) with `verifyInContainer: true` and a child
  that exits 0 and writes `<mount>/<name>/verified` → `ok: true`; exactly one exec call contains
  `verify-backup.mjs`; its args deep-equal `containerVerifyArgs(<host mount dir>)`; its `opts.cwd` is the clone dir;
  its `opts.env` has none of the `COMPOSE_INTERPOLATED` names although the test set `process.env.BACKUP_DIR` and
  `process.env.DB_PASSWORD` (restored in `finally`); the run's step-name list equals a default-mode run's.
- [ ] DW-1.4: The host verifier is not consulted: with the host fixture's `db.sql.gz` made non-gzip and the child
  exiting 0 + writing the marker → `ok: true`; with the child exiting 0 but writing **no** marker →
  `failed: 'backup marker'`, detail `missing`.
- [ ] DW-1.5: Child `{status: 1, stdout: 'not verified: volume archive archives.tar.gz is unreadable\n'}` →
  `failed: 'backup'`, the `backup` step's detail contains `volume archive archives.tar.gz is unreadable`, no
  `restore.mjs` call, and `docker update --restart=no` and `down -v` calls come after the verify call. Child
  `{status: null, error: new Error('spawn docker ENOENT')}` → `failed: 'backup'`, detail contains `ENOENT`.
- [ ] DW-1.6: A child that calls `controller.abort()` and returns `{status: 130}` → `failed: 'interrupted'`, teardown
  calls present.
- [ ] DW-1.7 (U-8): runs with the option absent and with `verifyInContainer: false` give identical exec call lines
  (after replacing each run's temp workdir with a placeholder), identical step names and details (same
  placeholder rule); no call in either contains `verify-backup.mjs`.
- [ ] DW-1.8: CLI spawned with `process.execPath`: `scripts/selfhost-check.mjs --verify-in-container` (no `--lock`,
  so no Docker is touched) → exit 1, stdout contains `verify=container` and `RED at lock`; without the flag the
  start line contains no `verify=`; `--help` stdout contains `--verify-in-container`.
- [ ] DW-1.9: All existing `scripts/test/selfhost-*.test.mjs` green unedited (`npm run test:scripts`); guard
  command prints nothing.

**Size:** ≈ 40 non-test lines. **Difficulty:** LOW · **Uncertainty:** none.

### Phase 2: The self-check doc section teaches the flag
**Skills:** code-foundations:code-clarity-and-docs
**Model:** sonnet
**Gate:** Minimal
**Depends on:** none (the flag name and command form are fixed by the spec and Phase 1's Produces)
**File scope:** virtual-lab: docs/self-host.md, scripts/test/selfhost-incontainer-doc.test.mjs
**AC:** AC-17 (doc line, spec shared decision), AC-26 (what the admin runs)
**Risk:** normal

**Goal:** An admin reading «Перевірка «чи працює моя установка?»» knows the opt-in, what it runs, what it needs and
how it fails, while the host verify stays described as the default.

**Scope:**
- IN (only inside `## Перевірка «чи працює моя установка?» — \`npm run selfhost-check\``): add
  `[--verify-in-container]` to the usage code line; one bullet: the flag verifies the backup inside the `backup`
  container (`verify-backup.mjs --newest /backups`, the same verifier as «Як оновитися» step 1) instead of on the
  host; the default stays host verification; it needs a `--ref` whose `backup` image carries `verify-backup.mjs`
  (since 2026-11-23, HO1b) — an older ref ends `RED at backup` with the container's message; the `backup marker`
  and restore steps are the same in both modes.
- OUT: «Що нового» (pinned, see Constraints), «Вимоги», «Оновлення», every other section; any explicit
  `docker compose … -f` line.

**Edge cases:** the existing interrupt-section assertions (Ctrl+C, `interrupted`, `130`, manual command) and the
«без HTTPS» rule must still hold — the new text adds no `-f` command line.

**Produces:** user-facing text only.

**Done when:** `node --test scripts/test/selfhost-incontainer-doc.test.mjs && npm run test:scripts` exits 0 and the
guard command prints nothing.
- [ ] DW-2.1: The new test slices the section from `## Перевірка` to the next `## ` heading and asserts it contains
  `--verify-in-container`, `verify-backup.mjs --newest /backups`, `RED at backup`, and `HO1b` or `2026-11-23`
  next to the ref requirement; the usage code line (the one starting `npm run selfhost-check -- --lock`) contains
  `[--verify-in-container]`.
- [ ] DW-2.2: `docs/self-host.md` mentions `--verify-in-container` only inside that section (test: every
  occurrence's offset lies within the section's bounds).
- [ ] DW-2.3: `git diff -U0 origin/ms/2... -- docs/self-host.md` shows hunks only inside the «Перевірка» section;
  `verify-backup-docs.test.mjs`, `selfhost-interrupt.test.mjs`, `selfhost-doc*.test.mjs` green unedited; guard
  command prints nothing.

**Size:** ≈ 10 doc lines. **Difficulty:** LOW · **Uncertainty:** none.

---
## Test Coverage
**Level:** 100% (every new or changed routine — `parseArgs` branch, `containerVerifyArgs`, the `runCheck` branch,
the CLI wiring — has a unit test in Phase 1's new file; the doc change has Phase 2's guard).
## Test Plan
- [ ] Per DW item above (unit: fake `exec`/`git`/`probe`, temp-dir backup fixtures; CLI spawned via
  `process.execPath` without `--lock`, so nothing reaches Docker).
- [ ] Dirty, Phase 1: child non-zero with a verifier message (DW-1.5); spawn failure `status: null` (DW-1.5); abort
  mid-child (DW-1.6); exit 0 without marker (DW-1.4); host-invalid fixture that only the container "verifies"
  (DW-1.4); shell-exported compose variables (DW-1.3); `--verify-in-container=yes` (DW-1.1).
- [ ] Dirty, Phase 2: the flag mentioned outside its section fails DW-2.2.
- [ ] Regression: the whole `scripts/test/` suite after each phase (`npm run test:scripts`), U-8 by DW-1.7 plus the
  existing `selfhost-*.test.mjs` unedited.
- [ ] Manual (AC-26, Claude close pass, Docker running, inside `vl-db.lock`):
  `npm run selfhost-check -- --lock <held vl-db.lock dir> --verify-in-container` → `GREEN`, with the `backup` line
  `verified in the backup container, <name>`. Use `--ref` of a branch whose image carries the verifier (`main` once
  MS-1 is accepted, else `--ref ms/2`).

---
## Notes
- Hidden acceptance tests exist (run only by `gate.sh --acceptance MS-2`); builders never look for them. Feedback is
  `AC-ID PASS/FAIL + symptom`.
- **Cross-row trap for the Claude pass (not this row's fix):** any MS-2 row that adds a dated «Що нового» entry to
  `docs/self-host.md` (P1f, HO1h, HO1i) breaks `verify-backup-docs.test.mjs`'s "newest entry is HO1b's" pin. Decide
  at activation (e.g. no «Що нового» entries in MS-2, or a spec-change).
- Linux rootful Docker: the backup child already writes root-owned files under the temp workdir in both modes; a
  non-root teardown `rmSync` EACCES is pre-existing (HO1f reports it), not changed here.
- Self-review against the plan checklist done in-session (no subagent spawned): DW set covers AC-17's every clause
  (parseArgs, child args, scrubbed env, exit 0/non-zero, output tail, teardown, unchanged steps, marker on host
  mount) and U-8; file scopes disjoint; every phase has Skills/Model/Gate/Depends on/File scope/AC/Risk/Done when.
- The lead updates the ROADMAP row at landing; builders do not.
---
## Decided During Build
_Filled by /code-foundations:build — one row per decision an agent made or question it raised:_
| # | Phase | Decision or question | Source | Status |
---
## Execution Log
_To be filled during /code-foundations:build_
