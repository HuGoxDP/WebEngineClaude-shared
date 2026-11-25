# Plan: MS-1 plan C — backup verification in the image, without crashes, streaming (HO1b → HO1e)
**Created:** 2026-11-23
**Status:** ready
**Complexity:** medium
**Review cadence:** 1
**Check-ins:** quiet
---
## Context
The backup verifier (`scripts/lib/verify-backup.mjs`) runs only on the host (the `backup` image does not ship it),
crashes with an exception when the `verified` marker cannot be removed or written (root-owned backup dir, a
directory named `verified`), has no way to pick "the newest backup", `restore.mjs` hints a host command with a
container path, and every file is read whole (`readFileSync` + `gunzipSync`), so a big archive is never verifiable.
Research (confirmed, decisions D1–D9): `code-foundations/HO1b/research.md`. Milestone MS-1
(`.workers/milestones/MS-1/spec.md`): AC-9, AC-10, AC-13, U-2, U-4. HO1g (AC-6) shares no file with this plan → its
own plan `code-foundations/HO1g/plan.md`.

**Rows and landings:** Phases 1–2 = row **HO1b** (one task branch, one landing). Phases 3–5 = row **HO1e** (its own
branch from the then-current `origin/ms/1`, started only after HO1b has landed). Base `origin/ms/1` = `e70ff8d`.

**Success:** `node backup/verify-backup.mjs --newest <root>` and `node scripts/lib/verify-backup.mjs <dir>` exit
0/1/2 as specified; a marker that cannot be removed/written is `{ok:false, error}` naming it; `verifyBackupStream`
resolves deep-equal to `verifyBackup` on every fixture and verifies a ≥ 10 MB archive without whole-file reads; the
CLIs and `selfhost-check` use it; `npm run test:scripts` green with no existing test file touched.

## Constraints
- Never modify, delete or rename an existing test file or a `test*` package script (gate test guard). New tests =
  NEW files under `scripts/test/` (picked up by the existing `scripts/test/*.test.mjs` glob). No `skip`/`todo`:
  a test that cannot run on this machine **returns early** (e.g. `if (process.platform === 'win32') return;`).
- Root `package.json` is not touched by this plan (spec: only HO1g, only additions).
- `scripts/lib/verify-backup.mjs` must keep existing, keep exporting `VERIFIED_MARKER`, `verifyBackup`,
  `newestBackup`, stay a runnable CLI, and **end with a newline** (an existing test reads it).
- `verifyBackup(dir)` stays **synchronous**; its results on every backup the base could verify without throwing are
  unchanged (U-2): same check names, details, error strings, key sets (`{ok:true, checks}` has no `error` key).
- `backup/verify-backup.mjs` imports only `node:` builtins (the image has no `scripts/`, no `node_modules`).
- Compose files are not changed (U-4: backup env literal `/backups`, mount `${BACKUP_DIR:-./backup/out}:/backups`).
- `docs/self-host.md`: no heading renamed; in «Оновлення» step 1 the existing backup command line and the host
  `verify-backup.mjs "${BACKUP_DIR:-backup/out}/…"` line stay the **first** such lines of the step; any new
  `docker compose … -f docker-compose…` line follows the «без HTTPS» rule (`scripts/test/selfhost-doc.test.mjs`).
- `backup/restore.test.mjs` must stay green: the refusal's stderr keeps the substrings `verified` and `verify-backup.mjs`.
- **Guard command** (each DW "guard command prints nothing"), run on the task branch, where `origin/ms/1` is the tip
  the branch was cut from (HO1b branch for Phases 1–2, the later HO1e branch for Phases 3–5):
  `git diff --name-only --diff-filter=MDR origin/ms/1... -- scripts/test backup/restore.test.mjs backup/test package.json "docker-compose*.yml"`.
- Size: each phase ≲ 150 non-test lines (estimates per phase; a `git mv` counts as a move, not as new lines).
- Windows dev machine (Git Bash), Node 24 on the gate; Docker daemon not needed by any test here.
- `scripts/selfhost-check.mjs` is plan B's serial file (HO1c → HO1d → HO1f → R3). Phase 5 edits two lines of it:
  start Phase 5 from the current `origin/ms/1` tip and tell the lead before landing so it is serialised.

## Chosen Approach
**One implementation in `backup/`, one check flow with two drivers.** The verifier moves to `backup/verify-backup.mjs`
(the Docker build context is `backup/`); `scripts/lib/verify-backup.mjs` re-exports it (`export *`) and keeps its
CLI entry. HO1e turns the tar walk into an incremental walker used by both paths and the check sequence into one
generator driven synchronously (`verifyBackup`) or by streams (`verifyBackupStream`), so parity is structural.
**Fallback:** if the generator proves awkward, keep it for the stream path only and pin the sync path by the
Phase-3 oracle tests.
## Rejected Approaches
- **Generated/copied image file + drift test:** a build step and a second file for nothing; the re-export cannot drift.
- **Widen the backup build context to the repo root:** changes compose and every image build for one file.
- **Second hand-written async flow for the stream:** two ~70-line sequences that must stay character-identical (AC-13).

---
## Implementation Phases

### Phase 1: HO1b — the verifier moves into the backup image, marker failures are named, `--newest`
**Skills:** code-foundations:cc-defensive-programming, code-foundations:cc-refactoring-guidance
**Model:** sonnet
**Gate:** Standard
**Depends on:** none | **Unlocks:** Phase 2
**File scope:** virtual-lab: backup/verify-backup.mjs, scripts/lib/verify-backup.mjs, backup/Dockerfile, scripts/test/verify-backup-image.test.mjs
**AC:** AC-9, AC-10, U-2, U-4 · **Risk:** risk (format)

**Goal:** Ship the verifier in the image with a `--newest <root>` CLI, and turn a marker that cannot be removed or
written into a named `{ok:false}` instead of an exception.

**Scope:**
- IN: commit A = pure move (`git mv` lib → `backup/verify-backup.mjs`; new lib = `export * from
  '../../backup/verify-backup.mjs'` + its own CLI block), suite green; commit B = behaviour: one marker helper
  (research D2), `runCli` (D3), Dockerfile `COPY retention.mjs backup.mjs restore.mjs verify-backup.mjs ./`.
- OUT: streaming (Phase 3–5), docs and the restore hint (Phase 2), any compose change, `selfhost-check`.

**Edge cases:** `verified` is a directory (clear fails, EISDIR); root-owned dir (clear ok, write EACCES); `--newest`
on a missing root / a root with only non-timestamped entries; two positionals; unknown `--flag`.

**Produces:** from `backup/verify-backup.mjs` (re-exported unchanged by the lib):
`VERIFIED_MARKER = 'verified'`; `verifyBackup(dir: string): {ok, checks, error?}` (sync);
`newestBackup(root: string): string|null`; `runCli(argv: string[], io?: {out, err}): Promise<0|1|2>` (`out`/`err` =
`{write(string)}`, default process streams). Marker failure = last check `{name:'verified marker', ok:false,
detail: err.message}` and `error` = `cannot remove the stale verified marker: <msg>` | `cannot write the verified
marker: <msg>`; a failed clear returns with that one check only.

**Done when:**
- [ ] DW-1.1: The new test asserts the Dockerfile's `COPY` line names `verify-backup.mjs` with the other three, and
  that every import specifier in `backup/verify-backup.mjs` starts with `node:`.
- [ ] DW-1.2: `lib.verifyBackup === img.verifyBackup`, same for `newestBackup` and `runCli`; `VERIFIED_MARKER` equal.
- [ ] DW-1.3: For BOTH `backup/verify-backup.mjs` and `scripts/lib/verify-backup.mjs` (spawned with
  `process.execPath`): good dir → 0 (`verified:` on stdout); bad dir → 1; no args, `--newest` without value, unknown
  `--x`, two positionals → 2; `--newest <root without backups>` → 2 with `no backup directory under` on stderr;
  `--newest` picks the newest of two timestamped dirs (newest good → 0 and stdout names it after `newest backup:`;
  newest bad, older good → 1).
- [ ] DW-1.4: A directory named `verified` in a good backup → `verifyBackup` returns (no throw) `ok:false`, `error`
  matches `/^cannot remove the stale verified marker: /`, `checks` is exactly one `verified marker` failure; CLI → 1.
- [ ] DW-1.5: POSIX only (return early on win32 or when `process.getuid?.() === 0`): good backup dir `chmod 0o555`
  → `ok:false`, `/^cannot write the verified marker: /`, every other check ok, last check `verified marker`.
- [ ] DW-1.6: Good fixture → check names exactly today's list, no `verified marker` check, marker file written.
- [ ] DW-1.7: `npm run test:scripts` and `node --test backup/restore.test.mjs` green; `git diff --name-only
  --diff-filter=MDR origin/ms/1... -- scripts/test backup/restore.test.mjs backup/test package.json
  "docker-compose*.yml"` (the guard command) prints nothing; task notes record commit A's sha with the suite green on it.

DW-1.4 is the Windows-reachable proof of AC-10; DW-1.5 adds the Linux EACCES case where it can run.

**Size:** ≈ 60 new non-test lines (helper, `runCli`, lib CLI block, Dockerfile) + the moved file.

**Difficulty:** MEDIUM · **Uncertainty:** none.

### Phase 2: HO1b — the restore hint and the docs point at the in-image verifier
**Skills:** code-foundations:code-clarity-and-docs
**Model:** sonnet
**Gate:** Standard
**Depends on:** Phase 1 | **Unlocks:** Phase 3
**File scope:** virtual-lab: backup/restore.mjs, docs/self-host.md, docs/backup-restore.md, scripts/test/verify-backup-docs.test.mjs
**AC:** AC-9 (docs part), U-2 · **Risk:** normal

**Goal:** An admin without Node on the host is told the in-image command everywhere the verifier is mentioned.

**Scope:**
- IN: `restore.mjs` refusal hint + its comment (research D4); `docs/self-host.md` «Вимоги», «Оновлення» step 1,
  «Що нового» (D5); `docs/backup-restore.md` step 3b (D5, verbatim command there).
- OUT: `restore.mjs` behaviour; `selfhost-check` docs (HO1b2); HTTPS/LTI/editor sections (other rows).

**Edge cases:** `BACKUP_DIR` ≠ `/backups` when `restore.mjs` runs on the host (hint still says `/backups/<name>`,
the compose mount path); the pre-update image lacks the verifier (step 1 says so).

**Produces:** user-facing text only.

**Done when:**
- [ ] DW-2.1: Unmarked backup (spawned as in `restore.test.mjs`, `BACKUP_DIR` = a temp root): stderr contains
  `docker compose run --rm --entrypoint node backup verify-backup.mjs /backups/<name>` and
  `node scripts/lib/verify-backup.mjs`; no stderr line contains `scripts/lib/verify-backup.mjs /backups`.
- [ ] DW-2.2: «Оновлення» step 1 contains, after its host verify line, a line with
  `--entrypoint node backup verify-backup.mjs --newest /backups` and no `-f `; it states an image built before this
  update lacks it, and names `cannot write the verified marker` as the non-root host symptom — all of this
  (prose and command) placed **after** the step's existing backup command line and host verify line, so neither
  `docker compose run … backup` nor `verify-backup.mjs` appears earlier in step 1.
- [ ] DW-2.3: «Вимоги» names `verify-backup.mjs` (verification works without Node on the host); «Що нового» has an
  entry naming `verify-backup.mjs` and `--newest`.
- [ ] DW-2.4: `docs/backup-restore.md` step 3b contains `run --rm --entrypoint node` and
  `backup verify-backup.mjs "/backups/$NAME"`.
- [ ] DW-2.5: `npm run test:scripts` (incl. `selfhost-doc.test.mjs`) and `node --test backup/restore.test.mjs` green;
  DW-1.7's guard command prints nothing.

**Size:** ≈ 40 changed lines (hint ≈ 5, docs ≈ 35).

**Difficulty:** LOW · **Uncertainty:** none.

### Phase 3: HO1e — incremental tar walker and one check flow (no behaviour change)

> **START RULE (Claude pass 2026-11-25, owner: keep slots busy) — overrides "after R3" anywhere in this plan or ROADMAP:** HO1e is eligible NOW (ROADMAP Depends = HO1b only). Claim it in a free slot and run Phases 3–4 immediately (they touch only backup/verify-backup.mjs + new tests). Before Phase 5 (scripts/selfhost-check.mjs, also changed by HO1f/R3): `git merge origin/ms/1` into the branch; a conflict goes to a coder. Sync again before landing.

**Skills:** code-foundations:cc-refactoring-guidance, code-foundations:aposd-designing-deep-modules
**Model:** sonnet
**Gate:** Standard
**Depends on:** Phase 2 (HO1b landed) | **Unlocks:** Phase 4
**File scope:** virtual-lab: backup/verify-backup.mjs, scripts/test/verify-backup-walker.test.mjs
**AC:** U-2 · **Risk:** risk (format)

**Goal:** Restructure, behaviour-preserving, so a stream driver can reuse the exact tar walk and check sequence.

**Scope:**
- IN: `TarWalker` (research D6) replacing `walkTar`'s loop (`walkTar(buf)` = push + end); generator
  `verifySteps(dir)` yielding `{kind:'dump'|'archive', file}`; `verifyBackup` = sync driver over it.
- OUT: any stream code, any new check, any message change.

**Edge cases:** end-of-archive / truncated-tail messages need the total length → computed in `end()`; first error
wins and later pushes are ignored; < 512 bytes total; empty input.

**Produces:** `export class TarWalker { push(chunk: Buffer): void; end(): {ok: boolean, entries: number, error?: string} }`
(exported only so tests can drive it — not a public contract, not documented as API; holds < 512 bytes of carry,
skips bodies by count); internal `verifySteps(dir)` generator whose
yielded request / received result shapes are the Phase-4 contract: dump → `{ok:true, bytes, tables} | {ok:false,
message}`; archive → `{ok, entries, error?}` (gzip failure already formatted as `not a valid gzip stream (<msg>)`).

**Done when:**
- [ ] DW-3.1: The new test holds a verbatim copy of the base `walkTar` (`git show e70ff8d:scripts/lib/verify-backup.mjs`)
  as oracle: for ≥ 12 tar fixtures (good, one/no zero block, cut body, cut inside zero block, junk after, header
  checksum mismatch, non-octal checksum, non-octal size, content after end marker, 100 bytes, empty) `TarWalker`
  fed in chunk sizes 1, 7, 511, 512, 513 and whole deep-equals the oracle.
- [ ] DW-3.2: The same oracle file holds the base `verifyBackup` (+ helpers); on ≥ 10 backup fixtures without marker
  problems the refactored `verifyBackup` deep-equals it.
- [ ] DW-3.3: All existing tests and Phases 1–2 tests green unedited: `npm run test:scripts`; guard command prints nothing.

**Size:** ≈ 110 lines touched (walker ≈ 70 replacing ≈ 70, flow + driver ≈ 40 restructured).

**Difficulty:** MEDIUM · **Uncertainty:** none.

### Phase 4: HO1e — `verifyBackupStream`
**Skills:** code-foundations:cc-defensive-programming
**Model:** sonnet
**Gate:** Standard
**Depends on:** Phase 3 | **Unlocks:** Phase 5
**File scope:** virtual-lab: backup/verify-backup.mjs, scripts/test/verify-backup-stream.test.mjs
**AC:** AC-13, U-2 · **Risk:** risk (format)

**Goal:** An async driver over `verifySteps` that streams the dump and every archive and resolves deep-equal to
`verifyBackup`.

**Scope:**
- IN: stream readers (`createReadStream` → `createGunzip` → `TarWalker` / dump counter, D6); gzip-error precedence
  (keep draining after a tar error); read-stream errors reported like the sync read errors; optional `opts` (D7).
- OUT: CLI and `selfhost-check` (Phase 5); fs-error re-wording (spec keeps parity).

**Edge cases:** `CREATE TABLE ` split across chunks; `\r\n` / `\r` line ends; statement at byte 0; mid-line
occurrence (not counted); `db.sql.gz` is a directory; truncated gzip whose prefix holds a bad tar header (gzip
error wins); no unhandled `'error'` on any stream.

**Produces:** `export async function verifyBackupStream(dir: string, opts?: {highWaterMark?: number, chunkSize?: number}): Promise<{ok, checks, error?}>` —
never rejects for backup content or fs errors; same marker helper; re-exported by the lib through `export *`.

**Done when:**
- [ ] DW-4.1: Parity matrix (every Phase-3 fixture as an archive + dump/manifest/volume failures + CRLF/CR/byte-0/
  mid-line dumps + `verified` as a directory + `db.sql.gz` as a directory): `deepStrictEqual(await
  verifyBackupStream(dir), verifyBackup(dir))`, and marker presence after each call identical.
- [ ] DW-4.2: With `{highWaterMark: 16, chunkSize: 64}` a multi-statement dump counts the same as sync; with default
  opts a `CREATE TABLE ` straddling inflated byte 16384 is counted.
- [ ] DW-4.3: A backup whose `volumes/archives.tar.gz` is ≥ 10 MiB (one entry of `crypto.randomBytes`, size asserted
  by `statSync`) → `ok:true` while `fs.readFileSync` and `zlib.gunzipSync` throw for any `*.gz` path (patched, then
  `module.syncBuiltinESMExports()`, restored in `finally`).
- [ ] DW-4.4: That archive cut to half its bytes → `ok:false`, `error` `volume archive archives.tar.gz is unreadable`,
  equal to `verifyBackup`'s result.
- [ ] DW-4.5: `verifyBackup(dir)` returns a non-Promise; `npm run test:scripts` green; guard command prints nothing.

**Size:** ≈ 100–130 new lines. **Split point if it grows past 150:** 4a = readers + parity (DW-4.1, 4.4, 4.5),
4b = `opts` + chunking + big archive (DW-4.2, 4.3), same file scope, 4b depends on 4a.

**Difficulty:** HIGH · **Uncertainty:** LOW — zlib and EISDIR messages checked equal sync vs stream; other fs-error
wording is an Assumption below.

### Phase 5: HO1e — the CLIs and `selfhost-check` use the stream
**Skills:** code-foundations:cc-defensive-programming
**Model:** sonnet
**Gate:** Standard
**Depends on:** Phase 4 | **Unlocks:** none
**File scope:** virtual-lab: backup/verify-backup.mjs, scripts/selfhost-check.mjs, scripts/test/verify-backup-callers.test.mjs, scripts/test/fixtures/trap-whole-read.mjs
**AC:** AC-13 · **Risk:** risk (format area; part of the HO1e landing that gets the pre-merge review)

**Goal:** Every caller that verifies a real backup goes through `verifyBackupStream`.

**Scope:**
- IN: `runCli` awaits `verifyBackupStream`; `selfhost-check.mjs` imports it and the backup step does
  `await verifyBackupStream(produced)` (two lines; nothing else in that file).
- OUT: `restore.mjs` (checks only the marker); in-container verify in `selfhost-check` (HO1b2).

**Edge cases:** plan-B rows edited `selfhost-check.mjs` meanwhile (rebase on the tip, keep their changes).

**Produces:** unchanged signatures; CLI behaviour of Phase 1, now streaming.

**Done when:**
- [ ] DW-5.1: The trap module (patches as DW-4.3, loaded with `node --import <pathToFileURL(trap).href>`) + the
  ≥ 10 MiB backup: `backup/verify-backup.mjs <dir>`, `scripts/lib/verify-backup.mjs <dir>` and
  `backup/verify-backup.mjs --newest <root>` each exit 0.
- [ ] DW-5.2: `scripts/selfhost-check.mjs` imports `verifyBackupStream` and has no `\bverifyBackup\(` call;
  `selfhost-check*.test.mjs` green unedited.
- [ ] DW-5.3: `npm run test:scripts` green (Phase-1 CLI matrix included); guard command prints nothing.

**Size:** ≈ 10 lines + the trap fixture (test file).

**Difficulty:** LOW · **Uncertainty:** merge order with plan B (lead serialises).

---
## Test Coverage
**Level:** 100% (every new or changed routine in `backup/verify-backup.mjs` has a unit test in its phase's new file).
## Test Plan
- [ ] Per DW item above (unit: temp-dir fixtures, hand-built tars/gzips, spawned CLIs via `process.execPath`).
- [ ] Boundary: tar sizes 0 / 100 / 511 / 512 / 513 bytes; chunk sizes 1 / 511 / 512 / 513; archive 10 MiB.
- [ ] Dirty, Phase 1: `verified` as directory; read-only dir (POSIX); `--newest` with no value / empty root / stray
  files only; unknown flag; two positionals.
- [ ] Dirty, Phase 2: `BACKUP_DIR` ≠ `/backups` still hints `/backups/<name>`.
- [ ] Dirty, Phase 3: corrupted header, non-octal fields, content after the end marker — at every chunking.
- [ ] Dirty, Phase 4: truncated / non-gzip / CRC-bad dump and archive; directory instead of file; gzip error behind a
  tar error.
- [ ] Dirty, Phase 5: CLI on a truncated big archive → exit 1.
- [ ] Integration: the whole `scripts/test/` suite and `node --test backup/restore.test.mjs` after every phase.
- [ ] Manual (owner/close pass, AC-16 machine with Docker): `docker compose build backup` then
  `docker compose run --rm --entrypoint node backup verify-backup.mjs --newest /backups` on a real backup → exit 0.

## Assumptions
| Assumption | Confidence | Verify Before Phase | Fallback If Wrong |
|---|---|---|---|
| `rmSync(dir/verified,{force:true})` throws for a directory on every OS | high (checked on Windows/Node 24) | 1 | test asserts `ok:false` either way (clear or write failure) |
| zlib error messages identical sync vs stream | high (checked) | 4 | map stream errors to the sync wording in the reader |
| `createReadStream` fs-error messages equal `readFileSync`'s for the same file (EACCES/EISDIR open/read) | high (EISDIR checked) | 4 | the stream reader maps `err.message` to the sync wording (DW-4.1 catches any drift) |
| `syncBuiltinESMExports` propagates patched `fs`/`zlib` to named imports | high (checked) | 4 | inject readers through `opts` for the test |

## Decision Log
| Decision | Alternatives Considered | Rationale | Phase |
|---|---|---|---|
| Implementation in `backup/`, lib `export *` | generated copy; wider build context | build context is `backup/`; no drift possible | 1 |
| Marker failures = one named check + error; failed clear returns at once | throw; continue checks | AC-10; a stale marker must not look verified | 1 |
| Move commit before behaviour commit | one commit | refactoring discipline, reviewable diff | 1 |
| `runCli` async from Phase 1 | sync then async | HO1e only swaps the verifier | 1 |
| Shared `TarWalker` + generator flow | duplicated async flow | AC-13 character parity is structural | 3 |
| fs errors keep the sync wording | ROADMAP "fs errors as fs errors" | spec: deep-equal results | 4 |
| HO1g in its own plan | same plan | no shared file | — |
| Owner pre-approved (autonomous mode, 2026-11-23) | per-checkpoint confirmation | owner instruction | all |

---
## Notes
- The milestone has hidden acceptance tests run only by `gate.sh --acceptance`; builders never look for them.
- Cadence 1: every phase edits `backup/verify-backup.mjs`.
- Phase 5 touches plan B's serial file — the lead orders it against HO1c/HO1d/HO1f/R3 landings.
- ROADMAP rows are updated by the lead at landing (HO1b after Phase 2, HO1e after Phase 5), not by the builders.
---
## Decided During Build
_Filled by /code-foundations:build — one row per decision an agent made or question it raised:_
| # | Phase | Decision or question | Source | Status |
---
## Execution Log
_To be filled during /code-foundations:build_
