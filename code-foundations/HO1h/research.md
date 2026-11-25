# Research: HO1h — verifier CLI errors and docs (virtual-lab, MS-2)
**Date:** 2026-11-25 **Status:** confirmed (autonomous, by recommendation)
One line: harden both verify-backup CLIs against bad arguments, fs errors, symlink invocation; quote a spaced backup name in restore.mjs's hint; fix two doc symptoms.

## Sources
MS-2 spec AC-20, U-9, risk table (normal), wave 3 lane P; ROADMAP row HO1h; DEBT D-...1000Z-8 (single-dash arg), 1140Z-13 (unreadable root -> stack trace), 1140Z-15 + 1158Z-b1/b2 (symlink isMain, no catch, dash arg), 1130Z-11/-12 (docs symptoms). graphify query on the virtual-lab graph: verify-backup.mjs, restore.mjs, verify-backup*.test.mjs, restore.test.mjs are the whole footprint.

## Base facts (origin/ms/1, read-only)
- `backup/verify-backup.mjs`: `runCli(argv, io)` accepts one positional not starting `--` (so `-x` is a dir, exit 1) or `--newest <x>`; no try/catch; `newestBackup(root)` uses existsSync + readdirSync (a regular file gives ENOTDIR; EACCES throws); `isMain = path.resolve(argv[1]) === fileURLToPath(import.meta.url)` (a symlink defeats it).
- `scripts/lib/verify-backup.mjs`: re-exports + same path.resolve isMain, calls runCli.
- `verifyBackupStream` is NOT on ms/1 (arrives with MS-1 HO1e, which rewrites the CLI onto it). HO1h is built on the tip that holds HO1e; the builder re-reads the CLI before editing. Parity (U-9): verifyBackup/Stream results and exit 0/1 unchanged.
- `backup/restore.mjs` L57-58: hint `.../verify-backup.mjs /backups/${name}` and host form `<host backup folder>/${name}` unquoted.
- `docs/backup-restore.md` L98: "fails on a root-owned backup dir" stated unconditionally (in the image the verifier runs as root, so EACCES is only a non-root host run).
- `docs/self-host.md` L177 lists only `cannot write the verified marker`; `cannot remove the stale verified marker` is missing. Newest «Що нового» is HO1b's (pinned by verify-backup-docs.test.mjs). The spec requires no new entry, so none is added. No conflict.

## Decisions
1. Any argv element starting with `-` that is not `--newest` -> usage, exit 2 (also `--newest -x`, bare `--newest`). A dir literally named `-x` stays reachable as `./-x`.
2. `--newest <path>`: stat first. Missing -> `verify-backup: <path>: not found`; not a directory -> `... not a directory`; readdir error -> `... <code>: cannot read`. One line, exit 2. `newestBackup` keeps its null-on-missing contract.
3. Any fs error thrown while verifying is caught in runCli: `not verified: <code|name>: <message>`, exit 1, no stack. A top-level `.catch` in both isMain blocks is the backstop.
4. isMain via `realpathSync` on both sides (try/catch, fall back to resolve); one exported helper used by both entries. The symlink test returns early where a symlink cannot be created.
5. restore.mjs quoting: POSIX single quotes only when the name has chars outside `[A-Za-z0-9_./:@%+=-]`; `'` becomes `'\''`. Plain names print exactly as today, so existing tests stay valid.
6. Docs: backup-restore.md says EACCES only for a non-root host run; self-host.md lists both marker messages; no «Що нового» entry.

## Out of scope
Exit-code meaning for good/bad backups, check names/details, marker semantics, selfhost-check, HO1b2/HO1j files, CHANGELOG (Claude pass), any existing test file.

## Risks
R1 conflict with HO1e if built before it lands (depends on HO1e on ms/1). R2 Windows symlink/EACCES tests: early return. R3 docs pins in verify-backup-docs.test.mjs must stay green.
