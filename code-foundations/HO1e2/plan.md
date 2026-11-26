# Plan: HO1e2 — stream verifier accepts the zero padding `gunzipSync` accepts (virtual-lab, MS-2)
**Created:** 2026-11-26
**Status:** ready
**Complexity:** simple
**Review cadence:** 1
**Check-ins:** quiet
---
## Context
Problem: `verifyBackupStream` disagrees with `verifyBackup` when `db.sql.gz` or a volume archive is a
valid gzip member followed by zero bytes. `gunzipSync` ignores everything after a member whose next
byte is `0x00`; `streamGzip` (`backup/verify-backup.mjs` L341-354, a `pipeline` through
`createGunzip`) either rejects with `Premature close` (gunzip closes on `'end'` while the file is still
being read) or, when the zero run ends on a read-chunk boundary, restarts member parsing on the next
chunk. Both reproduced deterministically on `origin/ms/1` `4dd6c6a`; 189/948 mismatches in a matrix.
Research (mechanism, measurements, rejected options): `code-foundations/HO1e2/research.md`.
Spec: MS-2 AC-27, U-9; risk (format) → pre-merge review. Lands **before HO1h** (same file; HO1h
edits only `runCli`/isMain).

## Constraints
- Only `streamGzip` (and, if needed, a private helper next to it) in `backup/verify-backup.mjs`
  changes. `verifyBackup`, `checkTarGz`, `TarWalker`, `verifySteps`, `runCli`,
  `scripts/lib/verify-backup.mjs`: byte-identical.
- U-9: every other result of `verifyBackup`/`verifyBackupStream` (ok, error text, checks, marker) is
  unchanged; CLI exit 0/1 unchanged.
- No whole-file read in the stream path (DW-4.3 trap test keeps passing).
- New test file only; no existing test edited/renamed; no `skip`/`todo`.
- Swarm rules (2026-11-26): the worker runs only the targeted tests of touched files
  (`node --test scripts/test/verify-backup*.test.mjs`); landing is by the batch gate; no «Що нового»
  / CHANGELOG entry (behaviour fix, no user-visible surface).

## Implementation Phases

### Phase 1: Hand-fed gunzip in `streamGzip` + parity test
**Skills:** cc-defensive-programming, aposd-verifying-correctness
**Model:** sonnet
**Gate:** Standard
**Depends on:** none
**File scope:** virtual-lab: backup/verify-backup.mjs (function `streamGzip` only), scripts/test/verify-backup-zero-padding.test.mjs (new)
**AC:** AC-27, U-9
**Risk:** risk (format) — a wrong stop condition makes a corrupt backup verify (restore.mjs then
accepts it); a missed error race hangs the CLI. Pre-merge review required.

**Goal:** `streamGzip` resolves `null` exactly when `gunzipSync(readFileSync(file))` succeeds and hands
`onChunk` exactly the bytes `gunzipSync` returns, for any read/gunzip chunk sizes.

**Scope:**
- IN: replace the `pipeline` with the design proven in research (prototype: 0/948 mismatches):
  1. `const gunzip = createGunzip(gzipOpts)`; output loop started first:
     `const inflated = (async () => { for await (const c of gunzip) onChunk(c); })()` with a
     no-op `.catch` attached so an early rejection is never unhandled.
  2. `let fed = 0, stopped = false; for await (const chunk of createReadStream(file, readOpts))`:
     if `stopped`, skip (keep reading to EOF so an fs error anywhere still fails, as `readFileSync`
     does); else `fed += chunk.length`, await the write callback **raced against `gunzip`'s
     `'error'`** (zlib never calls the callback of the write that errored — a plain await hangs;
     remove the listener after), then `if (gunzip.bytesWritten < fed) stopped = true` — the engine
     stopped at a member end followed by a zero byte, which is the `gunzipSync` rule.
  3. `gunzip.end()`; `await inflated`; return `null`.
  4. `catch (err)`: `gunzip.destroy()`, `await inflated.catch(() => {})`, return `err.message`
     (same message text as today for truncated / bad header / non-gzip / ENOENT / EISDIR).
  - Update `streamGzip`'s JSDoc: the trailing-data rule and why `pipeline` is not used (one short
    paragraph; cite AC-27). Imports: drop `pipeline` if unused.
- IN: new test file `scripts/test/verify-backup-zero-padding.test.mjs`.
- OUT: sync path, tar walker, dump table counting, CLI, docs, Dockerfile.

**Edge cases:**
- padding starts inside the first read chunk, exactly at a 65536 boundary, and after it;
- zero run ends exactly on a read-chunk boundary and the next chunk starts with `0x1f 0x8b` (second
  member — must be ignored) or `0xff` (garbage — must be ignored);
- a second member directly after the first (no zeros) — both inflated, as sync;
- non-zero byte after a member (`0xff`, `0x1f`) → error, same message as sync;
- zeros *before* the member → `incorrect header check`, same as sync;
- truncated member (cut inside the deflate data) followed by zeros → still fails;
- empty file / non-gzip → same error as today;
- gunzip error on the very first write (callback never called) → resolves, no hang;
- tiny `highWaterMark` (16) and `chunkSize` (64) knobs.

**Done when:**
- [ ] DW-1.1: For `db.sql.gz` and for a volume archive, each a valid member followed by N zero bytes,
  N ∈ {0, 100, 65535, 65536, 70000, 200000}, with three member sizes — a small one (padding starts
  inside the first 64 KiB read chunk), one whose compressed length is exactly 65536 (padding starts at
  the chunk boundary; build it with `gzipSync(randomBytes(k), {level: 0})` and search `k` — stored
  output grows monotonically), and a ~1 MiB-inflated compressible one (`'CREATE TABLE …\n' +
  randomBytes(1 << 20).toString('hex')`; padding after the first chunk): `verifyBackupStream(dir)`
  deep-equals `verifyBackup(dir)`, both `ok: true`, and the `verified` marker is present after each.
- [ ] DW-1.2: DW-1.1 holds through both modules: the stream function imported from
  `scripts/lib/verify-backup.mjs` gives the same results (and is the same function object as the
  backup/ export).
- [ ] DW-1.3: With `{ highWaterMark: 16 }` and `{ highWaterMark: 16, chunkSize: 64 }`: member + zeros
  ending exactly on a 16-byte boundary + a second valid member, and the same + `0xff` garbage →
  stream deep-equals sync (ok, first member only; dump `bytes` detail equal).
- [ ] DW-1.4 (negatives, U-9): member + `0xff`; member + `0x1f`; 10 zero bytes + member; a member cut
  in its deflate data + 100 zero bytes; a non-gzip file → stream deep-equals sync and both are
  `ok: false` with no marker — for the dump and for an archive.
- [ ] DW-1.5: Red baseline recorded: on the base `streamGzip`, at least the 1 MiB dump + 65536 zeros
  (default options) and the DW-1.3 boundary + second-member case fail (research: 10/10 each); on the
  branch they pass. Record both runs in the report.
- [ ] DW-1.6: Every existing `scripts/test/verify-backup*.test.mjs` passes unmodified (incl. DW-4.3
  whole-file-read trap and DW-4.1 fixture parity); `git diff` of `backup/verify-backup.mjs` touches
  only `streamGzip`, its JSDoc and imports.
- [ ] DW-1.7: No hang: every new test runs under a per-test `timeout` (e.g. 20 s) and the whole new file
  finishes in < 30 s on the host.

## Test Coverage
**Level:** 100% — every branch of the new `streamGzip` (normal end, early stop + drain, zlib error,
fs error via a missing/directory path already covered by DW-4.1 fixtures) is hit by the new file or the
existing parity fixtures.

## Test Plan
- [ ] DW-1.1/1.2: parity matrix (2 locations × 3 member sizes × 6 N × 2 modules) in
  `scripts/test/verify-backup-zero-padding.test.mjs`; fixtures built in `os.tmpdir()`, removed after.
- [ ] DW-1.3: boundary-exact shapes with the test-only chunk knobs.
- [ ] Dirty tests (DW-1.4): non-zero tail, leading zeros, truncated member + zeros, non-gzip — each must
  *fail* identically in both paths (guards against the fix accepting too much).
- [ ] Dirty test: gunzip error on the first write with `{ highWaterMark: 16 }` (`0xff`-only file) resolves
  within the test timeout (hang guard, DW-1.7).
- [ ] DW-1.5: red baseline — run the new file against `origin/ms/1`'s `backup/verify-backup.mjs`
  (e.g. stash the implementation change) before the fix.
- [ ] DW-1.6: targeted run `node --test --test-concurrency=1 scripts/test/verify-backup*.test.mjs`
  (worker); the full `npm run test:scripts` belongs to the batch gate.

---
## Notes
- Why not keep `pipeline` and treat `ERR_STREAM_PREMATURE_CLOSE` after `'end'` as success: fixes only the
  close race; 150/1008 mismatches remained (chunk-boundary re-entry), and it stops reading the file so a
  later read error is lost. See research.
- `gunzip.bytesWritten` is the input bytes the engine consumed; a write callback fires only after the
  whole chunk is consumed unless the engine stopped, so `bytesWritten < fed` is exact and synchronous
  (no race with the `'end'` event).
- The image runs Alpine 3.20 `nodejs` (20.x); the rule and `bytesWritten` predate it. The parity test
  compares sync vs stream on the same runtime, so it is valid on any Node.
- Throughput unchanged within noise (128 MiB inflated: ~300 ms both ways).
- The open HO1e DEBT "runCli has no catch around a rejecting verifier" is HO1h's, not this row's.
- Pre-merge reviewer focus: the stop condition, the error race on write, the drain-to-EOF, and DW-1.4.
---
## Decided During Build
_Filled by /code-foundations:build — one row per decision an agent made or question it raised:_
| # | Phase | Decision or question | Source | Status |
---
## Execution Log
_To be filled during /code-foundations:build_
