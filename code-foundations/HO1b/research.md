# Research — MS-1 plan C: backup verification (HO1b → HO1e, and HO1g)

**One sentence:** ship the backup verifier inside the `backup` image (with `--newest`), make a marker that cannot be
written or removed a named failure instead of a crash, add a streaming verifier for archives too big to read whole,
and make the gated root suite run the `backup/` tests — without editing any existing test file.

- Date: 2026-11-23 · Status: **confirmed** (cold read done, findings folded in — see the end) · Author: Claude pass
  (code-foundations:research, autonomous by owner instruction)
- Milestone: MS-1 (`.workers/milestones/MS-1/spec.md`) — AC-6 (HO1g), AC-9 + AC-10 (HO1b), AC-13 (HO1e), U-2, U-4.
- Base: virtual-lab `origin/ms/1` = `e70ff8d`. Node on the gate machine: v24 (Windows, Git Bash). Docker daemon
  usually down — nothing here needs it.
- Still open (none blocks planning): see "Open / accepted" at the end.

## What the rows ask

| Row | Need (ROADMAP, narrowed by the spec) | AC |
|---|---|---|
| HO1b | The verifier lives in the image: `backup/verify-backup.mjs`, COPY'd by `backup/Dockerfile`; `node backup/verify-backup.mjs --newest <root>` verifies the newest backup; `verifyBackup` returns `{ok:false, error}` naming the marker instead of throwing when the marker cannot be written; `restore.mjs`'s hint stops printing a container path inside a host command; docs (`docs/backup-restore.md` step 3b, `docs/self-host.md` update step 1 and «Вимоги»). **Out:** verifying inside the container from `selfhost-check` (HO1b2, deferred — breaks pinned test expectations); the `vlcheck_backups` volume. | AC-9, AC-10, U-2, U-4 |
| HO1e | `verifyBackupStream(dir)` (async) checks the same things without reading files whole: `createReadStream → createGunzip → tar header walk` with a 512-byte carry; the dump streamed with `CREATE TABLE` counted across chunk boundaries; the two CLIs and `selfhost-check` use it. **Spec overrides the ROADMAP:** `verifyBackup` stays synchronous and keeps its results; the stream result must be **deep-equal** to the sync one on any backup (same keys, same check names, character-identical details and error) — so the ROADMAP's "report fs errors as fs errors" is *not* done (it would break parity). | AC-13, U-2 |
| HO1g | `npm run test:scripts` (root) must execute `backup/restore.test.mjs` and `backup/test/unit/retention.test.js` (names visible, green). The root `test:scripts` glob stays; reached through a **new file under `scripts/test/`**. | AC-6 |

## Facts from the base code (file:line at `e70ff8d`)

- `scripts/lib/verify-backup.mjs` (246 lines) holds everything: `VERIFIED_MARKER = 'verified'` (:25), `walkTar(buf)`
  (:40-108), `checkTarGz(file)` = `gunzipSync(readFileSync(file))` then `walkTar`, gzip error →
  `not a valid gzip stream (<msg>)` (:118-126), `verifyBackup(dir)` (:135-213), `newestBackup(root)` (:223-230),
  CLI (:235-246: no arg → usage on stderr, exit 2; prints `ok  `/`FAIL` per check, then `verified: <dir>` or
  `not verified: <error>`; exit 0/1). Imports: only `node:` builtins.
- `verifyBackup` order: `rmSync(<dir>/verified, {force:true})` (:141, **unguarded**) → `db.sql.gz` present →
  `dump gunzips` (detail `<n> bytes of SQL`) → `dump names tables` (regex `/^CREATE TABLE /gm` over the latin1 text,
  detail `<n> CREATE TABLE statements`) → `manifest.json` → `manifest volumes` (only on failure) → `volume archives`
  → one `archive <name>` check per `volumes/*.tar.gz`, sorted → `writeFileSync(<dir>/verified, '')` (:211,
  **unguarded**). Success returns `{ ok: true, checks }` (no `error` key); failure `{ ok: false, checks, error }`.
- **AC-10's case throws at the removal, not the write:** with a *directory* named `verified`,
  `rmSync(…, {force:true})` throws `ERR_FS_EISDIR` (checked on Node 24/Windows); `writeFileSync` on it would throw
  `EISDIR` too. On a root-owned backup dir (the HO1b Linux case) the removal succeeds (ENOENT is forced) and the
  write throws `EACCES`. Both must become named failures.
- `walkTar` error strings carry byte offsets and the **total inflated length** (`archive ends at <len>`,
  `archive ends mid-block at <len>`) — a streaming walker knows the total only at the end, so it must defer those
  two messages to end-of-stream to stay character-identical.
- zlib errors are identical between `gunzipSync` and a `createGunzip` stream (checked, Node 24): truncated →
  `unexpected end of file`, not gzip / trailing junk → `incorrect header check`, bad CRC → `incorrect data check`,
  empty → `unexpected end of file`; a directory read gives `EISDIR: illegal operation on a directory, read` for both
  `readFileSync` and `createReadStream`.
- `backup/Dockerfile:12` `COPY retention.mjs backup.mjs restore.mjs ./`, `WORKDIR /app`, entrypoint
  `node backup.mjs`. Compose builds it with `build: ./backup` — **the build context is `backup/`**, so the image can
  only receive a file that physically lives in `backup/`; `scripts/lib/` is unreachable from the Dockerfile.
- `backup/restore.mjs:52-55`: refusal + hint `verify it first: node scripts/lib/verify-backup.mjs ${dir}` where
  `dir` is `join(BACKUP_DIR, name)` = `/backups/<name>` inside the container — a container path inside a host
  command (the ROADMAP complaint). Comment :47-51 says the marker name is duplicated because the image ships only
  `backup/*.mjs`.
- `backup/restore.test.mjs` (4 tests) pins the refusal: stderr matches `/verified/` **and** `/verify-backup\.mjs/`;
  the refusal comes before the manifest read. Any new hint must keep both substrings.
- `scripts/selfhost-check.mjs:34` imports `newestBackup, verifyBackup, VERIFIED_MARKER` from `./lib/verify-backup.mjs`;
  `runCheck` is already `async` (:340); the verify call is `const verified = verifyBackup(produced);` (:472) — a
  two-line change to `await verifyBackupStream(produced)`. This file is the **serial file of plan B**
  (HO1c → HO1d → HO1f → R3, spec "Serial file"); HO1e's edit is not in that chain (see Risks).
- Existing tests that pin what HO1b/HO1e touch (all must stay green, none may be edited):
  - `scripts/test/verify-backup.test.mjs` (20 tests) imports `newestBackup, VERIFIED_MARKER, verifyBackup` from
    `../lib/verify-backup.mjs` and reads that file's text to check it **ends with a newline** — the lib file must
    keep existing (a re-export file is fine).
  - `scripts/test/selfhost-restore.test.mjs:20` imports `VERIFIED_MARKER` from the lib.
  - `scripts/test/selfhost-check.test.mjs` drives `runCheck` with a fake `exec` that writes a real fixture backup on
    the host — it must still pass through the streaming verifier.
  - `scripts/test/selfhost-doc.test.mjs` on `docs/self-host.md` «Оновлення» step 1 (text between `1. **` and
    `2. Оновіть код`): the **first** line matching `/docker compose run[^\n]*\bbackup\b/` must carry
    `-e BACKUP_DIR=/backups` and `BACKUP_RUN_ONCE=1`; the **first** line containing `verify-backup.mjs` must contain
    `${BACKUP_DIR:-backup/out}` and must not match `verify-backup\.mjs /backups`. And everywhere in the file: a line
    with `docker compose` and `-f docker-compose` needs `docker-compose.https.yml` / `docker-compose.restore.yml` on
    it or the next line, or «без HTTPS» within the 4 lines above.
- Docs today: `docs/self-host.md:20` («Вимоги») "Node.js 22+ — лише для `npm run selfhost-check` та e2e; самому
  стеку не потрібен"; `:90-93` update step 1 (backup command, then host `node scripts/lib/verify-backup.mjs
  "${BACKUP_DIR:-backup/out}/<каталог-бекапу>"`); `docs/backup-restore.md:91-95` step 3b (host
  `node scripts/lib/verify-backup.mjs "backup/out-scratch/$NAME"`).
- HO1g facts: the root `package.json` script is `node --test --test-concurrency=1 "scripts/test/*.test.mjs"`.
  There is no `backup/package.json`; the root has no `"type"`. A probe file (outside the repo) that does
  `import '…/backup/restore.test.mjs'; import '…/backup/test/unit/retention.test.js';` run under `node --test` lists
  all 12 test names (4 + 8) and passes on Node 24. `retention.test.js` is ESM syntax in a `.js` file: Node prints a
  one-time `MODULE_TYPELESS_PACKAGE_JSON` warning and reparses it as ESM (syntax detection, Node ≥ 20.19 / 22.12).
  The gate's failure heuristics do not match that warning. `restore.test.mjs` resolves `restore.mjs` from its own
  `import.meta.url`, so being imported from elsewhere does not change its paths.
- Gate facts (`.workers/gate.sh`): FAIL on any `M/D/R` of a test-ish path (`test/`, `tests/`, `*.test.*`, …) or a
  changed `test*` script; FAIL on more skipped tests than base; counts executed tests ≥ base — adding tests is fine.
  Root package runs `test:scripts`; backend/frontend run their own suites.

## Decisions (made by recommendation, owner pre-approved autonomous mode)

- **D1 — one implementation lives in `backup/`.** Move the code to `backup/verify-backup.mjs` (build context forces
  it); `scripts/lib/verify-backup.mjs` becomes `export * from '../../backup/verify-backup.mjs'` plus its own
  `isMain` CLI block calling the shared CLI function. Rejected: generating a copy (a build step + a drift test for
  nothing), widening the Docker build context (changes compose and every image build). Drift pin: a new test asserts
  the lib's exports are the *same function objects* as the backup module's, and that `backup/verify-backup.mjs`
  imports only `node:` specifiers (the image has nothing else).
- **D2 — one marker helper, two outcomes.** `settleMarker(dir, 'clear' | 'write')` returns `null` or the failure.
  Failure shape (pinned): a check `{ name: 'verified marker', ok: false, detail: err.message }` appended to `checks`,
  and `error` = `cannot remove the stale verified marker: <err.message>` (clear) or
  `cannot write the verified marker: <err.message>` (write). A failed clear returns at once (nothing else ran; the
  backup's state cannot be trusted while a stale marker survives). A green run adds **no** check (the green `checks`
  list and `selfhost-check`'s `<n> checks` detail stay as today).
- **D3 — CLI.** One async function `runCli(argv, { out, err })` → exit code, shared by both entry files. Accepted forms:
  `<dir>` or `--newest <root>`; anything else (no args, `--newest` without a value, an unknown `--flag`, two
  positionals) → usage on `err`, exit 2; `--newest` whose root holds no timestamped dir → `no backup directory under
  <root>` on `err`, exit 2. With `--newest` it prints `newest backup: <dir>` before the check lines. Output lines and
  exit 0/1 otherwise exactly today's. Usage text: `usage: node verify-backup.mjs <backup-dir> | --newest <backup-root>`.
  Async from the start so HO1e only swaps the verifier it awaits. `runCli` and both `isMain` blocks: `runCli` is
  defined and exported once, in `backup/verify-backup.mjs`; the lib re-exports it (via `export *`) and its own
  `isMain` block calls the imported `runCli`. A failing `--newest` run prints the same `FAIL`/`not verified:` lines as
  a `<dir>` run and exits 1. Exact strings above are the pinned ones (the plan's tests assert them).
- **D4 — restore hint.** Replace the host command by the in-image one plus the host alternative, e.g.
  `verify it first: docker compose run --rm --entrypoint node backup verify-backup.mjs /backups/<name>` and
  `  (or on the host, with Node 22+: node scripts/lib/verify-backup.mjs <host backup folder>/<name>)`. Keeps
  `verified` and `verify-backup.mjs` in stderr. `restore.mjs` logic is untouched. Old-image caveat not needed
  here: `restore.mjs` itself ships in the same image as `verify-backup.mjs` from this change on, so whoever reads
  this hint is running an image that has the verifier (an older image prints the older hint).
- **D5 — docs.** `docs/self-host.md`: «Вимоги» says Node on the host is optional for verification too (the image
  carries it); update step 1 keeps the backup command and the host verify line **first** and adds, after them, the
  in-image alternative `docker compose run --rm --entrypoint node backup verify-backup.mjs --newest /backups`
  (plain compose — follows `COMPOSE_FILE`, no `-f`), noting that an image built before this update does not have it
  yet and that a non-root host verify of a root-owned backup now ends `cannot write the verified marker: EACCES`
  (use the in-image command); a «Що нового» entry. `docs/backup-restore.md` step 3b (whose step 1 already defines
  `F="-f docker-compose.yml -f docker-compose.scratch.yml"`, project `vlabscratch`, and whose step 3 mounts
  `-v "$PWD/backup/out-scratch:/backups"`) becomes
  `docker compose -p vlabscratch $F run --rm --entrypoint node -v "$PWD/backup/out-scratch:/backups" backup verify-backup.mjs "/backups/$NAME"`,
  the host form kept as a comment. The EACCES sentence is backed by D2 + the POSIX-only `chmod 0o555` test (returns
  early on win32 and as root).
- **D6 — streaming = one flow, two drivers.** HO1e first refactors (no behaviour change) the check sequence into a
  generator `verifySteps(dir)` that yields read requests (`{ kind: 'dump' | 'archive', file }`) and receives results;
  `verifyBackup` drives it with the sync readers, `verifyBackupStream` with stream readers. The tar walk becomes an
  incremental `TarWalker` (`push(chunk)`, `end()` → `{ok, entries, error?}`) used by **both** paths
  (`walkTar(buf)` = push whole + end), so error strings cannot diverge. Gzip errors take precedence over tar errors
  (sync gunzips everything before walking): after a tar error the stream keeps draining the gunzip, and a gzip error
  replaces the tar result. The dump counter runs only in the stream path: latin1 text, carry the last 13 chars,
  initial carry `'\n'`, count `/[\n\r]CREATE TABLE /g` (equivalent to `^CREATE TABLE ` with the `m` flag — latin1
  text has no U+2028/2029). Rejected: a second hand-written async flow (drift between two ~70-line sequences).
- **D7 — test seams for "not read whole".** `verifyBackupStream(dir, opts?)` accepts optional
  `{ highWaterMark, chunkSize }` (read stream / gunzip chunk sizes, test-only); without them the defaults apply.
  "Without reading it whole" is pinned by patching `fs.readFileSync` (and `zlib.gunzipSync`) to throw for the big
  archive and calling `module.syncBuiltinESMExports()` so ESM named imports see the patch, then restoring.
- **D8 — HO1g:** one new file `scripts/test/backup-suite.test.mjs` with two side-effect imports
  (`../../backup/restore.test.mjs`, `../../backup/test/unit/retention.test.js`). No `package.json` change (spec allows
  only HO1g to add there; nothing needs adding). The typeless-module warning is accepted. Independent of HO1b/HO1e
  (no shared file), but once it lands every later gate run executes `restore.test.mjs`, so HO1b's hint must keep it
  green regardless of order.

- **D9 — "unchanged" `verifyBackup` is a behaviour contract, not a source freeze.** The D6 refactor and the D2
  marker helper are allowed because U-2 pins behaviour: the 20 existing `verify-backup.test.mjs` tests + a new parity
  matrix (sync vs stream, `deepStrictEqual`) + a "green checks list unchanged" test map to it. D2 changes behaviour
  only where the base **throws** (marker clear/write), which U-2 does not cover and AC-10 demands. Check order on a
  failed clear: `checks` holds exactly one entry, the `verified marker` one.

## Risks

- **Serial file conflict (HO1e → `scripts/selfhost-check.mjs`).** The spec serialises that file as HO1c → HO1d → HO1f
  → R3 but AC-13 needs HO1e to change its verify call. Mitigation: HO1e's selfhost-check edit is its own last phase,
  two lines (import + `await`), rebased on whatever `ms/1` holds when it starts; the lead serialises it between plan-B
  landings. Flagged to the lead.
- **Parity is character-level** (AC-13). The shared `TarWalker` + shared flow make most divergence impossible; the
  remaining risk (dump counting, gzip-vs-tar precedence, deferred end-of-archive messages) is pinned by a fixture
  matrix compared with `deepStrictEqual`.
- **Format code is risk class** (spec): HO1b and HO1e go through the Claude pre-merge review.
- Windows cannot `chmod` a directory read-only; AC-10 uses a directory named `verified`, which works everywhere.
  A POSIX-only `chmod 0o555` test returns early on win32 (never `skip`).

## Open / accepted

- Open for the lead (not a planning blocker): HO1e's two-line edit of `scripts/selfhost-check.mjs` sits outside the
  spec's serial chain for that file — sequence it between plan-B landings (Risks).
- Accepted: the `MODULE_TYPELESS_PACKAGE_JSON` warning under HO1g (Node ≥ 20.19/22.12 needed — the gate runs 24).
- Accepted: files > 2 GiB still fail in the **sync** `verifyBackup` (spec keeps it unchanged); every CLI and
  `selfhost-check` use the stream path after HO1e.
- Not done (spec): fs errors reported "as fs errors"; in-container verify inside `selfhost-check` (HO1b2).

## Cold read (2026-11-23, fresh sonnet subagent) — findings and how they were resolved

1. Restore hint vs old image → D4 explains why no caveat is needed (hint and verifier ship in the same image).
2. backup-restore.md command not spelled out → D5 now gives it verbatim (the doc already defines `F`/project/mount).
3. EACCES doc sentence unpinned → D5 ties it to D2 + the POSIX-only chmod test.
4. `--newest` failure output / exact strings → D3 completed; strings are pinned by the plan's tests.
5. ESM patch seam asserted, not shown → verified on Node 24 (D7).
6. 19 vs 20 tests → corrected to 20.
7. Check order on a failed clear → D9.
8. Open list vs Risks → serial-file conflict moved into "Open".
9. Status line claimed a cold-read section that did not exist → this section.
10. "Unchanged" vs refactor → D9.
11. Which file owns `runCli` → D3.
