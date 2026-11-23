sha: a8c80f7229f1f64da1584e5a1770b0ebb46ceeaf
repo: virtual-lab
round: 1
reviewer: opus, high (fresh)
open-blocking: 0
---
- [open] non-blocking backup/verify-backup.mjs:286 — `--newest <root>` where root exists but is a regular file (or is unreadable) throws from `newestBackup`'s `readdirSync` (:253). The CLI then prints a stack trace and exits 1, the "bad backup" code, when it should exit 2 ("no backup dir at all", AC-9). — probe: `node backup/verify-backup.mjs --newest <file>` gives `Error: ENOTDIR ... scandir` and exit=1. In the image `/backups` is always a mount, so this is a host-only edge.
- [open] non-blocking backup/verify-backup.mjs:296 — `runCli` has no catch, so any fs throw that remains in `verifyBackup` exits 1 with a stack trace instead of a named result. Example: `volumes` is a regular file, so `readdirSync` at :225 throws ENOTDIR. This was already the case on the base and is outside AC-10's marker scope. HO1e could map it.
- [open] non-blocking backup/verify-backup.mjs:283 — a single-dash argument (`-x`) is taken as a backup dir: exit 1 (`db.sql.gz missing`) instead of usage exit 2. The plan only requires `--x`, which is handled.
- [open] non-blocking docs/self-host.md:125 — the non-root host symptom is given only as `cannot write the verified marker: EACCES`. A root-owned dir that already holds a root-written marker (for example after the in-container verify) fails on the host with `cannot remove the stale verified marker: EACCES` instead. The fix is the same; only the wording is incomplete.

Verified OK: AC-9 (the Dockerfile COPY line; `--newest` picks the lexicographically newest timestamped dir; exits 0/1/2 on both CLIs). AC-10 (a `verified` directory gives a named `{ok:false}`; the CLI exits 1; no throw). Also checked: one `settleMarker` helper, sync `verifyBackup`, a green result whose key set and check names are unchanged, the lib's `export *` with no double run of `isMain`, `node:`-only imports, and that the lib file ends with a newline. The guard command prints nothing, and commit ee02e84 is a pure move. `node --test` on the verify-backup*, restore and new test files passed 38/38. The doc commands match compose: `run` passes the arguments after the service name through, the mount is `${BACKUP_DIR}:/backups`, and the image runs as root.
