# Research: MS-1 plan D, HO1a, a one-command installer for Windows admins

**One sentence:** add `install.cmd` and `install.ps1` at the virtual-lab repo root. Together they check that Docker
is running, create `.env` from `.env.example` with two fresh CSPRNG secrets (only when `.env` is absent), run
`docker compose up -d --build` and print the health URL. They never prompt and never echo a secret.

- Date: 2026-11-23 · Status: **confirmed** (self-grill and cold read done, findings folded in; see the end) · Author: Claude architect pass (code-foundations:research, autonomous)
- Milestone: MS-1 (`.workers/milestones/MS-1/spec.md`), AC-7, AC-8, AC-16 (manual part: `install.cmd` on a clean
  Windows checkout brings the stack up and `/api/health` answers). Risk class: **risk (security)**, meaning secret generation and `.env` writing.
- Base: virtual-lab `origin/ms/1` = `e70ff8d`. **No file the installer adds exists on the base.** The files it touches
  are `docs/self-host.md` (one new subsection) and `.gitattributes` (one line).
- Still open: none that blocks planning. The only thing no automated test can prove is the real Docker build
  on a clean machine (AC-16, a manual check done by the owner or in the close pass).

## What the row asks for

ROADMAP HO1a: *"a single script (PowerShell or .cmd) that checks Docker is running, copies `.env.example`, generates
the two secrets, runs `docker compose up -d --build` and prints the health URL. The university's admins are not all
comfortable with a shell."*

The spec's shared decision fixes the surface:
- `install.ps1` at the repo root works from `$PSScriptRoot` and never prompts.
- An `install.cmd` wrapper runs it with `-ExecutionPolicy Bypass`.
- The script checks `docker info`.
- It copies `.env.example` to `.env` **only when `.env` is absent**.
- In the new file it replaces **only** `DB_PASSWORD` and `ADMIN_TOKEN`, each with ≥ 32 hex characters from a CSPRNG.
- It runs `docker compose up -d --build`, prints `http://localhost:<FRONTEND_PORT>/api/health`, and never echoes a secret.

AC-7 and AC-8 describe what the hidden tests check. They run on Windows with a fake `docker` first on PATH. No daemon is needed.
- **AC-7, daemon up:**
  - exit 0, and `.env` is created;
  - both secrets are ≥ 32 hex characters, differ from each other and from `change-me-before-deploying`;
  - every other key is byte-identical to `.env.example`;
  - `docker compose up -d --build` was invoked, and stdout contains `http://localhost:8044/api/health`;
  - no prompt is shown.
- **AC-8, `docker info` fails:**
  - non-zero exit, and the output contains `Docker is not running` (English, ASCII);
  - no `.env` is created and there is no `compose up`.
- **AC-8, `.env` already exists:** the file stays byte-identical and `compose up` still runs.

## Facts from the base code (file:line at `e70ff8d`)

- `.env.example` (index: LF; this worktree: CRLF because `core.autocrlf=true`; `.gitattributes` is `* text=auto`).
  - It is UTF-8 with no BOM and has many Cyrillic comment lines.
  - It has exactly one active line each for `DB_PASSWORD=change-me-before-deploying` and
    `ADMIN_TOKEN=change-me-before-deploying`, and `FRONTEND_PORT=8044`.
  - A clean checkout can therefore give the installer **either** line ending. It must keep whichever one it finds.
- `.gitignore:36-39` ignores `.env` and `.env.*` and keeps `!.env.example`. A temp file named `.env.<something>`
  is therefore never committable.
- `docker-compose.yml:94` maps `"${FRONTEND_PORT}:80"` **with no default**. `:18,44,46,126` interpolate
  `DB_PASSWORD`/`ADMIN_TOKEN`. Every service has `env_file: .env`. A missing or blank `FRONTEND_PORT` makes `compose up` fail.
  Compose gives a variable set in the process environment precedence over the same variable in `.env`.
- `scripts/selfhost-check.mjs`:
  - `generateSecrets()` (`:135-137`) returns `randomBytes(32).toString('hex')` twice.
  - `buildEnv(template, values)` (`:106-132`) splits on `/\r?\n/` and re-joins with `'\n'`, so it **turns CRLF into LF**.
    It also replaces 4 keys and **appends** missing ones (`BACKUP_DIR`).
  - Both behaviours break AC-7's "every other key byte-identical" on a CRLF checkout. That is fine for the
    self-check, which writes a throwaway clone, but wrong for an admin's `.env`.
- `docs/self-host.md`:
  - `## Встановлення` (`:22-56`) is the Unix flow: `cp`, then `openssl rand -hex 32` ×2, then `up -d --build`, then
    `curl …/api/health`.
  - `:20` says Node.js 22+ is needed *only* for `selfhost-check` and e2e, and that the stack itself does not need it.
  - There is no Windows section today. The headings `### Перший модератор` and `### Наповнення каталогу` follow `:22`.
- `lti-demo/reset-demo.ps1` sets the house PowerShell style:
  - The file is **ASCII on purpose** ("Windows PowerShell 5.1 reads BOM-less files as ANSI").
  - Helpers are `Fail` (`FAILED: …`, exit 1) and `Step` (`== …`).
  - It uses `Get-Command` to check tools, `[IO.File]` with an explicit `UTF8Encoding($false)` for file I/O, and
    `try/finally` cleanup of temp files.
- Tests:
  - `package.json` → `test:scripts` = `node --test --test-concurrency=1 "scripts/test/*.test.mjs"`. Any new
    `scripts/test/<name>.test.mjs` runs in the gate, with no package.json edit.
  - Existing tests are node:test plus fs reads. Platform gaps are handled with an early `return` (`verify-backup.test.mjs:240`).
    Some old tests use `{ skip }`, which this milestone forbids for new tests.
  - `scripts/test/selfhost-doc.test.mjs` slices `docs/self-host.md` by `## ` headings. A new `###` inside
    `## Встановлення` changes no slice it asserts on.
- No file in the repo mentions `install.cmd`/`install.ps1` today.

## Facts verified on this machine (Windows 11, `powershell.exe` 5.1.26100, Node 24)

1. A fake `docker.cmd` in a directory prepended to PATH **is** what `& docker …` and `Get-Command docker` resolve to
   in PowerShell 5.1. Its `exit /b N` arrives as `$LASTEXITCODE = N`. This only works if the script calls `docker`,
   **not** `docker.exe`.
2. Under `$ErrorActionPreference = 'Stop'`, a native command that writes to stderr while stderr is redirected
   (`2>$null`) **throws** (`RemoteException`) in 5.1. Real `docker info` writes to stderr exactly when the daemon is
   down. Native calls must therefore run under `'Continue'` and be judged by `$LASTEXITCODE`.
3. `[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buf)` works in 5.1 (and in pwsh 7).
   Formatting 32 bytes with `x2` gives 64 lowercase hex characters.
4. With `powershell.exe -File` and the output piped, as when Node spawns it, **`Write-Host` output lands on stdout**.
   `[Console]::Error.WriteLine` lands on stderr. `exit 7` arrives as the process status 7.
5. Node cannot spawn a `.cmd` without a shell (EINVAL, the CVE-2024-27980 fix). Tests must spawn
   `cmd.exe /d /c …` explicitly.

## Decisions (by recommendation, owner pre-approved autonomous mode)

**D1. Write the installer in PowerShell, not as a Node wrapper.** The target is a school admin's Windows box with
Docker Desktop. The docs (`self-host.md:20`) promise the stack needs no Node, and Docker Desktop does not ship Node.
Reusing `buildEnv` would also be **wrong**: it rewrites CRLF to LF and appends keys (see the facts above). The installer's logic
is small: one CSPRNG call and a two-key, line-ending-preserving replace. Duplicating `generateSecrets` (one line) is
cheaper than a Node dependency. *Rejected:* `install.cmd` → `node scripts/install.mjs`, because it fails on the very
machines HO1a is for.

**D2. Target Windows PowerShell 5.1, which ships with every supported Windows (10/11, Server 2016+).**
- `install.cmd` calls it by full path: `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`. That keeps
  working when a test or an admin has a narrow PATH, and it never picks up `pwsh` by accident.
- The script must also run unchanged under pwsh 7 (no 5.1-only APIs, no `RNGCryptoServiceProvider`). Nobody calls
  it that way, but it costs nothing.
- **`install.ps1` and `install.cmd` are pure ASCII**, the `reset-demo.ps1` rule. 5.1 reads a BOM-less script as ANSI,
  so one Cyrillic or "smart" character would corrupt a string or the parse.

**D3. `install.cmd` is a thin, prompt-free wrapper:**
```
@echo off
setlocal
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0install.ps1"
exit /b %ERRORLEVEL%
```
- **No `pause`.** A pause is a prompt: it would hang a test and violate "never prompts". A double-clicked window
  closes on exit and hides a failure message, so double-click is **not** a supported path. The docs tell the admin to
  open a terminal in the folder (Explorer address bar → type `cmd` → Enter) and run `install.cmd` there.
  Detecting a double-click (`%cmdcmdline%`) cannot tell it apart from `cmd /c`, so the installer does not try.
- No arguments are forwarded, because `install.ps1` has no parameters in v1.
- `.gitattributes` gains `*.cmd text eol=crlf`. cmd.exe has known parse bugs with LF-only batch files. A checkout
  without autocrlf, or a GitHub ZIP, would otherwise hand the admin an LF `install.cmd`.
- `-ExecutionPolicy Bypass` does not beat a Group Policy `MachinePolicy`/`UserPolicy`. That limitation is documented, not worked around.

**D4. Order of operations (fail before touching anything):**
1. `$root = $PSScriptRoot`; work there with `Push-Location`/`Pop-Location` in `try/finally`, so the caller's cwd
   is irrelevant.
2. `docker` not resolvable (`Get-Command docker -ErrorAction SilentlyContinue`) → fail with a message that
   **also** contains `Docker is not running` ("Docker is not running or not installed: the 'docker' command was not
   found…"). The phrase covers both failure shapes, and it is true from the admin's point of view.
3. `docker info` exits non-zero → fail: `Docker is not running. Start Docker Desktop, wait until it reports that
   the engine is running, then run install.cmd again.` **Exit 1, no `.env` written, no compose call.**
4. Handle `.env` (D6/D7).
5. Read `FRONTEND_PORT` (D9).
6. `docker compose up -d --build`. A non-zero exit → fail with `docker compose up failed (exit N)…`, exit 1.
   **The `.env` that was just written stays:** the database volume may already be initialised with its password,
   so deleting or regenerating it would lock the admin out of their own database.
7. Print the URL and the next steps, exit 0.

**D5. Secrets:**
- Each secret is a separate `RandomNumberGenerator` draw of 32 bytes, formatted as 64 lowercase hex characters (the same
  strength as `generateSecrets` and as the doc's `openssl rand -hex 32`).
- Assertions before use: length 64, `^[0-9a-f]{64}$`, the two differ. These are internal invariants; a failure aborts
  with no `.env`.
- Never `Get-Random` or `System.Random`. Neither is a CSPRNG.
- Secrets exist only in memory and in the `.env` file. They are never on a command line, in a message, in a
  transcript, or in `-Verbose` output.

**D6. Creating `.env` (only when absent) keeps every non-secret byte:**
1. Read `.env.example` as bytes. Remember a UTF-8 BOM if present, and decode the rest as **strict** UTF-8
   (`UTF8Encoding($false, $true)`). Invalid bytes → fail closed. A valid UTF-8 round-trip is byte-exact.
2. For each of the two keys, use the multiline regex `(?m)^KEY=[^\r\n]*`. **Exactly one match is required**; zero or
   several → fail closed with a message naming the key, and write no `.env`. The template is in-repo, so a mismatch
   means a broken checkout. Silently appending, as `buildEnv` does, is not acceptable for an admin file.
   The value is replaced, and the line terminator (`\r\n`, `\n`, or none at EOF) is untouched, because `[^\r\n]*`
   stops before it.
3. The replacement text is `KEY=<hex>`. Hex contains no `$`, so the .NET replacement-pattern escaping is a non-issue.
   The implementation still uses a literal replacement (a `MatchEvaluator` or substring splice), so a future value
   cannot be misread.
4. Encode with `UTF8Encoding($false)`, prepend the BOM if one was found, and write all bytes to a temp file **in the same
   directory** (`.env.install-<guid>.tmp`, ignored by `.env.*`). Then `[IO.File]::Move(tmp, .env)`. In .NET
   Framework, `Move` refuses to overwrite, so a `.env` that appeared in the meantime is never clobbered (fail with a
   message). `finally` removes a leftover temp file.
6. **Key rule, shared by D6, D7 and D9:** a key line is `^KEY=` at column 0, matched with `(?m)`. A line indented
   with whitespace, one with an `export ` prefix, or a commented `# KEY=` line is **not** a key line. This is the
   template's own form and the one `buildEnv` uses.
5. Message: `Created .env with a new DB_PASSWORD and ADMIN_TOKEN (values not shown; they are stored only in .env).`

**D7. An existing `.env` is read-only to the installer.**
- It is never opened for writing and never renamed. Its bytes, timestamps and ACL stay the same.
- It is read once, **leniently** (`[IO.File]::ReadAllText(path, [Text.Encoding]::UTF8)`: a BOM is honoured, invalid
  bytes become U+FFFD, and the read never fails on encoding; the values it needs are ASCII). The read gets `FRONTEND_PORT` and to check whether `DB_PASSWORD`/`ADMIN_TOKEN` are blank or still
  `change-me-before-deploying`. If so, print a `WARNING:` naming the **key** (never a value) and pointing at the docs.
  The run continues: AC-8 requires `compose up` to still run, and the hidden test's pre-existing `.env` may well be a
  copy of the template.
- Message: `Found an existing .env; it was left unchanged (secrets are never regenerated).`
- `.env` exists but is a directory → fail.

**D8. Native-call discipline:**
- `$ErrorActionPreference = 'Stop'` at the top (cmdlet errors abort).
- Every `docker` call goes through one helper that sets `'Continue'` locally, calls `& docker @args`, and returns
  `$LASTEXITCODE`. The helper restores the preference in `finally`.
- `docker info` output is discarded (`*> $null`). It names the host, and nothing useful for the admin is lost
  because the message explains the failure.
- `compose up` output streams to the console, so the admin sees build progress. It carries no secret: compose does
  not print env values on `up`.
- Calls are always `docker`, never `docker.exe` (fact 1).
- **Exactly two docker invocations:** `info`, then `compose up -d --build`. There is no `docker compose version`
  pre-check. A fake docker that only knows those two calls must still pass, and a missing Compose v2 plugin surfaces
  as the D4.6 message, which names `docker compose up` (accepted, deliberate).
- The exact compose argv is `compose up -d --build`, with no `-f`. A `COMPOSE_FILE` in the admin's `.env` (the HTTPS or
  editor overlay, `self-host.md` §HTTPS) is then honoured, the same as the documented manual command.

**D9. The health URL:**
- `FRONTEND_PORT` comes from the **last** key line (D6.6 rule) in `.env`, following dotenv semantics. The value is
  cleaned in this order: cut an unquoted inline comment (` #…`), trim whitespace, strip one pair of surrounding `"`/`'`.
  It must be `^\d{1,5}$` and in 1..65535. The placeholder check (D7) reads secret values with the same rule.
- Valid → after a green compose, print `Health check: http://localhost:<port>/api/health` and `Site:
  http://localhost:<port>/`. Also print: first start takes 2-5 minutes; until then the URL may not answer.
- Invalid or missing → `WARNING: FRONTEND_PORT in .env is missing or not a port number`. Compose itself then fails,
  because there is no default, and D4.6 applies.
- If `$env:FRONTEND_PORT` is set to a valid port that differs from the `.env` value (or the `.env` value is invalid),
  also print `NOTE: FRONTEND_PORT is set in the environment (<p>); compose uses it: http://localhost:<p>/api/health`.
  The `.env` URL line is still printed whenever the `.env` value is valid. The installer never aborts over the port:
  the compose exit code decides (D4.6).
- The installer **does not poll** the URL. The first build takes minutes, the tests use a fake docker, and a
  half-done wait loop is worse than a clear instruction. AC-16 (manual) proves the stack really answers.

**D10. Output and exit codes:**
- English, ASCII, `Write-Host` (stdout, fact 4).
- Step lines `== …`; failures `FAILED: …` (the `reset-demo.ps1` house prefix) and exit 1. There is a single failure exit code; the message distinguishes causes.
- Success is exit 0.
- No colours are required. They are fine on the host, but output must stay readable when piped.

**D11. Testing (the builder's own tests; hidden tests are never looked for):**
- **Files:** new files only, under `scripts/test/` (gate test guard), plus a non-test helper
  `scripts/test/install-harness.mjs` that the `*.test.mjs` glob does not run.
- **Off Windows,** or without `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`: each test returns
  early. No `skip`.
- **Sandbox:** every test makes a temp dir **whose name contains a space** and copies `install.ps1`, `install.cmd`
  and `.env.example` (the repo's, or a crafted one) into it.
- **Fake docker:** a `docker.cmd` sits in a *separate* temp dir prepended to PATH. It appends `%*` to the file named by
  `FAKE_DOCKER_LOG` and exits `%FAKE_DOCKER_INFO_EXIT%` for `info`, `%FAKE_DOCKER_COMPOSE_EXIT%` (default 0) otherwise.
- **Spawning:** `cmd.exe` with `windowsVerbatimArguments: true` and args `/d /s /c ""<dir>\install.cmd""`. That form
  handles the space and works from any cwd. A second route spawns `powershell.exe -NoProfile -NonInteractive
  -ExecutionPolicy Bypass -File <dir>\install.ps1` directly.
- **Every spawn:** `stdio: ['ignore', 'pipe', 'pipe']` (a prompt would hit EOF or hang) and `timeout: 120000`.
  A timeout fails the test, so "never prompts" is tested.
- **Byte-identity:** take the created `.env`, swap the two `KEY=<64 hex>` lines back to the template's values, and
  `Buffer.compare` the result with the template bytes, which must be equal. Run it for an LF template, a CRLF template, a template
  with a BOM, one without a trailing newline, and the repo's real `.env.example`.
- **Secrets not echoed:** neither value from the created `.env` appears in stdout, stderr or the fake docker log.
- **ASCII:** every byte of `install.ps1` and `install.cmd` is < 0x80.

**D12. Documentation:**
- A new `### Windows: встановлення однією командою (install.cmd)` subsection in `docs/self-host.md`, placed inside
  `## Встановлення` before `### Перший модератор`. It is Ukrainian, like the rest of the end-user doc.
- What it says:
  - Docker Desktop must be running.
  - Run `install.cmd` from a terminal opened in the repo folder (not by double-click: the window would close on the result).
  - What the installer does, and that a rerun never changes an existing `.env`.
  - Where the secrets are (`.env`, never printed) and how to read `ADMIN_TOKEN` (open `.env`).
  - The health URL and the 2–5 minute first build.
  - The Group Policy ExecutionPolicy limitation.
  - A warning: if you delete `.env` after a first install, the new `DB_PASSWORD` will not match the existing
    database volume. Restore the old `.env` from a backup; do **not** reach for `down -v` without a backup, since that
    deletes the data.
- **No `docker compose … -f` lines** (the `selfhost-doc` guard convention), and no heading renamed.

**D13. Out of scope (owner and spec boundaries):**
- A Linux/macOS installer (spec non-goal). Health polling (D9). Updating an existing install (the docs' `## Оновлення`).
- Tightening `.env` ACLs: the documented `cp` path does not either, the folder ACL applies, and changing it could
  stop Docker Desktop from reading the file.
- Detecting a stale DB volume. The decision would touch data and is documented instead.
- Any edit to `scripts/selfhost-check.mjs`: plan B owns that file serially, and there is no shared code (D1).
- Root `package.json` is HO1g's.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 5.1 throws on docker stderr under `Stop` | certain if unhandled (fact 2) | D8 helper; a test where the fake `docker info` writes to stderr *and* exits 1 must still produce the clean message |
| Line endings or BOM changed in `.env` | medium | D6 byte-level design + LF/CRLF/BOM/no-EOL tests |
| A non-ASCII character slips into the script | medium (tier-B coders) | ASCII byte test |
| A secret is printed | low | no code path formats a secret into a message; echo test |
| A spawned `.cmd` with spaces in its path is misquoted | medium | the verbatim `/s /c ""…""` pattern; the sandbox dir name contains a space |
| A real clean-machine build fails for non-installer reasons | n/a | AC-16 manual run |

## Self-grill (autonomous, by recommendation)

- *Should an existing `.env` with placeholder secrets be fixed in place?* No: AC-8 says byte-identical. Warn by key name (D7).
- *Should the installer refuse to start with placeholder secrets?* No: AC-8 says `compose up` still runs. Warn.
- *Should `docker` missing count as "not running"?* The message contains the phrase anyway (D4.2): cheap, honest, robust.
- *Should it wait for health?* No (D9).
- *Is `pwsh` better?* It is not installed by default. 5.1 is the baseline (D2).
- Two further questions changed nothing, so the grill stopped.

## Cold read (fresh sonnet subagent, 2026-11-23): findings and resolutions

1. Double-click was mentioned in the docs while `pause` was absent, so a failure would go unseen. **Resolved:** double-click
   is unsupported and the docs say to use a terminal (D3, D12).
2. Behaviour when `.env`'s `FRONTEND_PORT` is invalid but the environment sets one was unstated. **Resolved:** a NOTE
   carries the environment URL; the installer never aborts over the port; compose's exit code decides (D9).
3. The parse rule for commented, `export`-prefixed or inline-commented lines was unstated. **Resolved:** the shared key
   rule (D6.6) and the value cleaning order (D9).
4. The decoding of an existing `.env` was unstated. **Resolved:** a lenient read that never fails (D7).
5. There was no Compose v2 pre-check. **Resolved:** deliberately none, so there are exactly two docker calls (D8).
6. `ERROR:` differed from the house prefix `FAILED:`. **Resolved:** `FAILED:` (D10).
7. The cold read was referenced but not included, and the AC lived only in an external spec. **Resolved:** this section;
   the AC text is quoted in "What the row asks for", which is the planner's copy.

Every codebase claim it spot-checked held: the `.env.example` lines, `docker-compose.yml:94`, `buildEnv` CRLF→LF and
append, `.gitignore`, `.gitattributes`, the `test:scripts` glob, the `self-host.md` headings, `verify-backup.test.mjs:240`,
the `reset-demo.ps1` helpers, and that no `install.*` file exists.
