# Research: HO1e2 — stream verifier must accept the zero padding `gunzipSync` accepts

One line: `verifyBackupStream` reports `not a valid gzip stream (Premature close)` (or another error)
for a gzip file whose member is followed by zero bytes that `gunzipSync` silently ignores; make the
stream path accept exactly the trailing data `gunzipSync` accepts, nothing else changes.

**Date:** 2026-11-26 · **Status:** confirmed (autonomous run, decided by recommendation; self-grill
below, no separate cold read) · **Repo:** virtual-lab, base `origin/ms/1` (`4dd6c6a`)
**Spec:** MS-2 AC-27 (HO1e2), U-9; ROADMAP row HO1e2; risk (format) → pre-merge review.
**Order:** before HO1h (same file `backup/verify-backup.mjs`; HO1h touches only `runCli`/isMain).
**Still open:** nothing blocking. Node in the backup image is Alpine 3.20's `nodejs` (20.x); the
probes ran on host Node 24.20 — see Risk 2.

## Where the code is

`backup/verify-backup.mjs` (re-exported unchanged by `scripts/lib/verify-backup.mjs`):

- sync path: `verifyBackup` → dump `gunzipSync(readFileSync(file))` (L314), archives `checkTarGz`
  (`gunzipSync` + `walkTar`, ~L200).
- stream path: `verifyBackupStream` (L369-400) → both the dump and every archive go through
  `streamGzip(file, opts, onChunk)` (L341-354):
  `pipeline(createReadStream(file, readOpts), createGunzip(gzipOpts), async sink)`; any rejection
  becomes the error string (dump: `db.sql.gz is not a valid gzip stream (<msg>)`; archive:
  `not a valid gzip stream (<msg>)`).
- `opts.highWaterMark` / `opts.chunkSize` are test-only knobs (read chunk / gunzip output chunk).
- graphify (`virtual-lab/graphify-out/graph.json`) shows `verifyBackup()` / `verify-backup.mjs`
  with no other runtime consumer besides `runCli`, `selfhost-check` and the tests (already known
  from HO1e).

## What `gunzipSync` accepts (measured, Node 24.20)

Node's native gunzip, after a member ends (`Z_STREAM_END`) with input left over, starts a new member
only if the next byte is **non-zero**; if it is `0x00`, it stops and everything after is ignored.

| Input after one valid member | `gunzipSync` |
|---|---|
| nothing / N zero bytes (any N) | ok, member only |
| zeros then `0xff…` garbage | ok, member only |
| zeros then a second valid member | ok, **first member only** |
| a second member directly | ok, both members |
| `0xff` / `0x1f` / `0x1f 0x8b` (non-zero, not a full header) | error (`unexpected end of file`, `incorrect header check`, `unknown compression method`) |
| zeros **before** the member | error `incorrect header check` |

So the rule the stream path must reproduce: **once a member has ended and the next input byte is
zero, the rest of the file is ignored**. The stream path today applies Node's "next byte" check per
*write*, not per file, so the answer depends on where chunk boundaries fall.

## Why the stream path disagrees (two mechanisms, both reproduced)

1. **Premature close.** When a gunzip write ends with unconsumed input (member end + zero byte), Node's
   zlib pushes end-of-output (`push(null)`); zlib streams close themselves on `'end'`. If the read
   stream still has chunks to deliver, `pipeline` sees the gunzip close before its writable side
   finished → `ERR_STREAM_PREMATURE_CLOSE`. Deterministic with default options: a ~1 MiB-inflated
   dump (`CREATE TABLE …` + 2 MiB hex, compresses ~2:1) + 65536 or 70000 zero bytes → stream fails
   10/10, sync ok. Timing-dependent elsewhere (200000 zeros happened to pass; the tiny fixtures always
   pass because the whole file is one read chunk).
2. **Chunk-boundary re-entry.** If the zero run ends exactly at a read-chunk boundary and the next chunk
   starts with a non-zero byte, the next write restarts member parsing (zlib still calls each write's
   callback after `push(null)`): zeros + second member with `highWaterMark: 16` → stream errors or
   counts a second member, sync returns the first member only. Deterministic 10/10.

Matrix (3 member sizes × N ∈ {0,1,100,65535,65536,70000,200000} × tail {none, `ff`×10, member} × read
chunk {default,16,4096} × gunzip chunk {default,64} + 16 boundary-exact shapes, 948 runs): current
`streamGzip` mismatches `gunzipSync` 189 times.

## Fix (decided by recommendation)

Replace the `pipeline` in `streamGzip` with a hand-fed gunzip that stops feeding at the same point the
native engine stops consuming:

- consume gunzip output concurrently (`for await (const c of gunzip) onChunk(c)`);
- read the file with `for await (const chunk of createReadStream(file, readOpts))`; write each chunk
  and await its write callback, racing the gunzip's `'error'` (zlib never calls the callback of the
  write that errored — a naive await hangs; reproduced);
- after each callback, `gunzip.bytesWritten < fed` means the engine stopped at a member end followed
  by a zero byte → stop feeding (this is exactly the sync rule, and it is decided synchronously, so
  no race with the `'end'` event);
- keep reading the file to EOF without feeding it, so a read error anywhere in the file still fails,
  as `readFileSync` does in the sync path; then `gunzip.end()` and await the output loop;
- any error (fs or zlib) → destroy the gunzip, settle the output loop, return `err.message` as today.

Prototype result on the same 948-run matrix: **0 mismatches** (also 0 on truncated, `…+0xff` and
non-gzip negatives; messages identical). Throughput on 128 MiB inflated: 316/276 ms vs 378/270 ms
current — no regression.

Rejected: **classify `ERR_STREAM_PREMATURE_CLOSE` as success when the gunzip emitted `'end'`** — fixes
mechanism 1 only; 150/1008 mismatches remained (mechanism 2), and it stops reading the file early so
a later read error is lost. **Strip trailing zeros before gunzip** — needs to know where the member
ends, which only the inflater knows.

## Requirements

- R1: for every file, `streamGzip` resolves `null` iff `gunzipSync(readFileSync(file))` succeeds, and
  hands `onChunk` exactly the bytes `gunzipSync` returns (dump `bytes`/`tables` equal).
- R2: errors keep today's message text where today already agrees with sync (truncated, bad header,
  non-gzip, ENOENT/EISDIR) — U-9: no other result of `verifyBackup`/`verifyBackupStream` changes.
- R3: memory stays bounded by one read chunk + one output chunk (no whole-file buffer); the DW-4.3
  trap test (patched `readFileSync`/`gunzipSync`) keeps passing.
- R4: `verifyBackup` (sync) and `runCli` untouched; `scripts/lib/verify-backup.mjs` untouched.
- R5: new test file only (`scripts/test/verify-backup-zero-padding.test.mjs`); no existing test edited.
- R6: AC-27 parity: dump and archive, N ∈ {0,100,65535,65536,70000,200000}, members of several sizes
  (padding starts inside, at and after a read chunk), through both modules; marker presence equal.

## Self-grill (answers folded in)

- *Is "ignore anything after a zero" really what we want a verifier to accept?* Recommended: yes — the
  spec (AC-27, HO1e2 constraint) defines correctness as parity with `gunzipSync`, which is what the
  backup was always judged by; tightening both paths is a format change outside this row.
- *Does stopping early skip a corrupted tail the sync path would catch?* No: the sync path ignores the
  same tail; and the file is still read to EOF, so fs errors match.
- *Could `bytesWritten < fed` trigger without an early stop?* No: a write callback fires only after the
  engine consumed the whole chunk (zlib loops while input remains) unless it stopped; verified by trace
  (`bytesWritten` stays 45 for a 45-byte member + 10 + 10 zeros, callbacks still fire).
- *Hang risk?* The write await races `'error'`; output loop always settles after `end()`/`destroy()`.
  Tests carry a per-test timeout.

## Risks

1. Format/acceptance (risk class): a mistake makes a broken backup look verified → `restore.mjs`
   accepts it. Mitigation: negatives in the new test (truncated member + padding, `0xff` after member,
   non-gzip, zeros before member) must still fail identically; pre-merge review.
2. Node version: the image ships Alpine 3.20 `nodejs` (20.x); the trailing-zero rule lives in
   `node_zlib.cc` since Node 6 and `bytesWritten` since Node 10, so behaviour should match, but the probes
   ran on 24.20. The parity test is sync-vs-stream on the same runtime, so it stays meaningful anywhere.
3. HO1h edits the same file next (CLI); this row stays inside `streamGzip` so the rebase is trivial.
