sha: 93d5aaff119cfc08552780f12c964d221d62966c
repo: virtual-lab
round: 2
reviewer: sonnet, high (fresh)
open-blocking: 0
---
- [closed] correctness scripts/test/verify-backup-walker.test.mjs:209 — `tinyTar` checksum field wrote a literal backslash+0 — fixed to `\0 `; checksum digits at 148-153, NUL at 154, space at 155. New regression test DW-3.0 asserts bytes 154-155 are `[0x00,0x20]` and that both the oracle and TarWalker (1-byte chunks) return `{ok:true, entries:1}`. Independent probe on the merge result with a hand-built header: `TarWalker` gives `{ok:true, entries:1}` for the good tar and `truncated tail: 312 trailing byte(s)… (archive ends mid-block at 1848)` for the cut-padding variant, so the sweeps now traverse real entries and reach the intended error paths instead of the old byte-0 checksum error.
- [closed] correctness scripts/test/verify-backup-walker.test.mjs (old :397-406) and verify-backup-stream.test.mjs (old :269-277) — ref-dependent `git diff origin/ms/1...` guard tests — both removed (DW-3.3 describe and the stream "guard command prints nothing" test); unused `spawnSync` import removed from the walker test; no test in the plain `git archive` copy depends on a git ref any more (merge-result archive has no .git and runs clean, 141/141 on the verify-backup files).
- [closed] non-blocking (coverage check) — fixing the checksum did not weaken coverage: fixture list and chunk sizes untouched (13 fixtures x 5 sizes = 65 sweep tests, header comment corrected from "60"); "header checksum mismatch" and "non-octal checksum digit" fixtures now genuinely test those errors because the baseline header is valid. DW-3.2 archive fixtures are built on the same helper and now contain real entries.
- [closed] non-blocking scripts/test/verify-backup-walker.test.mjs:8,20 — stale "verbatim copy of e70ff8d" oracle comment, duplicated `checkTarGz` JSDoc and orphaned `newestBackup` JSDoc — header now says the oracle is adapted from backup/verify-backup.mjs with marker handling inlined (settleMarker); both stray JSDoc blocks deleted.
- [closed] non-blocking backup/verify-backup.mjs:360 — JSDoc over-promised that fs errors resolve as `{ok:false}` — reworded: only dump/archive read errors resolve; `readdirSync(volumes)` rejects as in `verifyBackup`.
- [open] non-blocking backup/verify-backup.mjs:~360 (runCli) — `runCli` still has no catch around a rejecting verifier — DEBT (already carried from HO1b r1 non-blocking findings); unchanged by this branch, out of scope.
- [open] non-blocking backup/verify-backup.mjs:305 — `verifyBackup` is now a driver over the shared `verifySteps` generator, so text differs from base though behaviour is identical (AC-13 wording "unchanged") — DEBT, wording only, intended design.
- [open] non-blocking scripts/test/selfhost-*.test.mjs — pre-existing flake, not from this branch: `selfhost-interrupt` / `runCheck (plain)` fail intermittently (1 of 3 runs on the merge result: 286/287 with a "smoke child keeps the http base URL" or `failed:'port'` vs `'interrupted'` assertion). Same files, unmodified, on origin/ms/1 alone: 6 runs gave fail counts 2,1,1,1,0,2. Looks tied to the host's real port state; not caused by HO1e — DEBT for the ms/1 owner.

Verified:
- Merge: `git merge-tree --write-tree origin/ms/1 93d5aaf` = 4b95495bf827e895c4b409bfefd1086db7e6e496, rc 0, no conflicts (current origin/ms/1 after fetch).
- `node --test scripts/test/verify-backup*.test.mjs scripts/test/selfhost*.test.mjs` on the archived merge result: tests 287, pass 287, fail 0 (3 runs: 287/287, 287/287, 286/287 with the selfhost flake above). verify-backup*.test.mjs alone: 141 tests, 141 pass, 0 fail.
- (d) `git diff --name-only --diff-filter=MDR origin/ms/1...93d5aaf -- scripts/test backend/test frontend/src` prints nothing.
