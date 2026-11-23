# Plan: MS-1 plan D, HO1a, a one-command installer for Windows admins (`install.cmd` + `install.ps1`)
**Created:** 2026-11-23
**Status:** ready
**Complexity:** medium
**Review cadence:** 1
**Check-ins:** quiet
---
## Context
**Problem:** a university admin on Windows must today copy `.env.example`, generate two secrets with `openssl` (which is not on stock
Windows), edit `.env` by hand and run compose. HO1a replaces that with one command that cannot leak or clobber secrets.
**Success:** spec AC-7 and AC-8 (Windows, fake `docker` first on PATH). AC-16, the manual part, is a real run on a clean
Windows checkout: the stack comes up and `/api/health` answers.

Research (confirmed, decisions D1–D13, cold read folded in): `code-foundations/HO1a/research.md`. **Read it first.**
Every "D<n>" below refers to it. Milestone: MS-1 (`.workers/milestones/MS-1/spec.md`). Base: virtual-lab `origin/ms/1` = `e70ff8d`.
**Landing:** one ROADMAP row, one task branch from the then-current `origin/ms/1`. The phases are commits on it, in order.

## Constraints
- **Gate test guard:** never modify, delete or rename an existing test file or a `test*` package script. New tests are
  NEW files in `scripts/test/` (the `test:scripts` glob `scripts/test/*.test.mjs` already runs them; root
  `package.json` is untouchable for this task). No `skip`/`todo`: off Windows, or without Windows PowerShell, a
  test **returns early**.
- **The tests need no Docker daemon.** A fake `docker.cmd` sits in a temp dir prepended to PATH (research D11).
- **Windows PowerShell 5.1 compatibility** (`powershell.exe`, stock Windows), and pwsh 7 must not break (D2).
  `install.ps1` and `install.cmd` are **pure ASCII** (D2): 5.1 reads a BOM-less script as ANSI.
- **Never prompts:** no `Read-Host`, `pause`, `Get-Credential`, `-Confirm`, or `choice`. `install.cmd` runs
  `-NonInteractive` (D3).
- **Never echoes a secret.** A secret never appears on a command line, in a message, in a log, or in the docker
  argv. It is only written to `.env` (D5).
- **An existing `.env` is never written, renamed or deleted** (D7). A new `.env` keeps every byte except the two
  secret values, including the line endings (LF or CRLF), any BOM, and any missing final newline (D6).
- **Exactly two docker invocations, in this order:** `docker info`, then `docker compose up -d --build`, with
  no `-f` and no pre-check (D8). Call `docker`, never `docker.exe`. A non-zero exit from either is final.
- All messages are English and ASCII. A docker failure message contains `Docker is not running` (D4). Failures use the
  `FAILED: ` prefix and exit 1; success exits 0 (D10).
- **No edit to `scripts/selfhost-check.mjs`**: plan B owns it serially, and no code is shared (D1). No edit to ROADMAP.

## Chosen Approach
**A self-contained PowerShell 5.1 script with a cmd wrapper** (D1, D2). It has no Node dependency, which the target
admin machine may not have (`self-host.md:20`). The `.env` creation is a byte-preserving, line-ending-preserving
replace of exactly the two key lines from a strict UTF-8 decode, written via a temp file and a non-overwriting move.
**Fallback:** if 5.1 shows an incompatibility the tests reveal, fix it inside the script. A `pwsh` dependency is not an acceptable fix.

## Rejected Approaches
- **`install.cmd` → `node scripts/install.mjs` reusing `buildEnv`/`generateSecrets`:** stock admin machines have no
  Node. `buildEnv` also turns CRLF into LF and appends keys, which breaks AC-7's byte identity.
- **Pure batch (`.cmd` only):** it has no CSPRNG, and cmd's string handling of UTF-8 `.env.example` content is not
  byte-safe.

---
## Implementation Phases

### Phase 1: Installer: docker gate, `.env` from the template, compose up, health URL
**Skills:** code-foundations:cc-defensive-programming, code-foundations:cc-pseudocode-programming
**Model:** sonnet
**Gate:** Standard
**Depends on:** none | **Unlocks:** Phase 2
**File scope:** virtual-lab: install.ps1, install.cmd, .gitattributes, scripts/test/install-harness.mjs, scripts/test/install-windows.test.mjs
**AC:** AC-7, AC-8 · **Risk:** risk (security: secret generation, `.env` writing)
**Security-sensitive:** yes

**Goal:** `install.cmd` (and `powershell -File install.ps1`) installs from any cwd. It checks the daemon first, creates
`.env` with two fresh CSPRNG secrets only when absent, keeping every other byte, runs compose, and prints the health URL.

**Scope:**
- IN:
  - `install.cmd`: exactly the D3 wrapper, with `powershell.exe` by full path, `-NoProfile -NonInteractive
    -ExecutionPolicy Bypass -File "%~dp0install.ps1"`, `exit /b %ERRORLEVEL%`, and no pause.
  - `.gitattributes`: add the line `*.cmd text eol=crlf`. Existing lines stay byte-identical.
  - `install.ps1`: the D4 order with the D8 docker helper (EAP `Continue` locally, `$LASTEXITCODE`).
  - Secrets per D5: `RandomNumberGenerator`, 32 bytes, 64 lowercase hex, asserted length, charset and inequality.
  - `.env` creation per D6, steps 1–5, plus the D6.6 key rule.
  - An existing `.env` is skipped untouched, with the D7 message.
  - `FRONTEND_PORT` from `.env` (D9 value rule), and the URL line `http://localhost:<port>/api/health`.
  - Harness + tests.
- OUT: placeholder warnings on an existing `.env`, the `$env:FRONTEND_PORT` NOTE, and the dirty-template matrix (Phase 2); docs (Phase 3).

**Edge cases:**
- `docker` not on PATH: the message contains `Docker is not running`.
- `docker info` exits 1 **and writes to stderr**: no PowerShell exception text, the clean message only.
- The sandbox path contains a space.
- The script is started from another cwd: `.env` goes next to the script.
- `compose up` exits non-zero: exit 1, and the new `.env` is kept (D4.6).

**Produces:**
- `install.ps1`, which Phase 2 extends.
- `scripts/test/install-harness.mjs` exports:
  - `canRun(): boolean`: win32 and `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe` exists.
  - `makeSandbox({template?: Buffer, existingEnv?: Buffer}): {dir: string, cleanup(): void}`:
    - the temp dir name contains a space;
    - it copies the repo's `install.ps1`/`install.cmd`;
    - `.env.example` is `template` (default: the repo file's bytes);
    - `.env` is written only if `existingEnv` is given.
  - `runInstaller(sandbox, {via?: 'cmd'|'powershell', infoExit?: number, infoStderr?: boolean, composeExit?:
    number, path?: 'fake-first'|'fake-only'|'no-docker', env?: object, cwd?: string}): {status, stdout, stderr,
    dockerCalls: string[]}`:
    - PATH modes: `fake-first` = fake dir + inherited PATH; `fake-only` = fake dir + `%SystemRoot%\System32` only;
      `no-docker` = `%SystemRoot%\System32` only. No mode ever lets a real machine docker win;
    - `env` entries override the child environment (for example `FRONTEND_PORT`);
    - stdin is `'ignore'`, with a 120 s timeout;
    - `via:'cmd'` spawns `cmd.exe` with `windowsVerbatimArguments` and `/d /s /c ""<dir>\install.cmd""`;
    - `dockerCalls` holds one line of argv per fake call.
  - `secretValues(envBuf): {DB_PASSWORD, ADMIN_TOKEN}`.
  - `withTemplateSecrets(envBuf, templateBuf): Buffer`: puts the template's two values back so the result can be compared byte for byte.

**Done when:**
- [ ] DW-1.1 (AC-7 shape): the sandbox has the repo `.env.example` and the fake info exits 0.
  - Via `cmd`: status 0, `.env` created.
  - Both secrets match `^[0-9a-f]{64}$`, differ from each other and from `change-me-before-deploying`.
  - `Buffer.compare(withTemplateSecrets(env, template), template) === 0`.
  - `dockerCalls` deep-equals `['info', 'compose up -d --build']`.
  - stdout contains `http://localhost:8044/api/health`.
  - The same assertions hold via `powershell`.
- [ ] DW-1.2 (AC-8 shape), each of three cases (fake info exits 1 / exits 1 with stderr text / `path:'no-docker'`):
  - status ≠ 0;
  - stdout+stderr contains `Docker is not running`;
  - stdout+stderr has no `RemoteException`/`NativeCommandError`;
  - no `.env`;
  - `dockerCalls` contains no `compose`.
- [ ] DW-1.3 (AC-8 existing `.env`): a pre-existing `.env` (bytes ≠ template, CRLF, with a Cyrillic comment and
  `FRONTEND_PORT=8123`) is byte-identical after the run, has the same mtime, `compose up -d --build` ran, and stdout has
  `http://localhost:8123/api/health`.
- [ ] DW-1.4: run with `cwd` = another temp dir: `.env` is created in the sandbox dir, not in cwd. With `composeExit: 1`:
  status 1, and `.env` still exists.
- [ ] DW-1.5: `node --test scripts/test/install-windows.test.mjs` is green on Windows (and passes by early return on
  Linux). `npm run test:scripts` is green. `git diff --name-only --diff-filter=MDR origin/ms/1... -- scripts/test
  package.json` prints nothing.

**Difficulty:** MEDIUM · **Uncertainty:** cmd quoting of a path with spaces from Node (the verbatim pattern is pinned in Produces).

### Phase 2: Hardening: dirty templates, existing-`.env` warnings, port notes, no echo, ASCII
**Skills:** code-foundations:cc-defensive-programming, code-foundations:aposd-verifying-correctness
**Model:** sonnet
**Gate:** Standard
**Depends on:** Phase 1 | **Unlocks:** Phase 3
**File scope:** virtual-lab: install.ps1, scripts/test/install-windows-env.test.mjs
**AC:** AC-7, AC-8 · **Risk:** risk (security)
**Security-sensitive:** yes

**Goal:** every bad input fails closed before any `.env` exists. Every surprise is reported without a value. The
security properties (no echo, no prompt, ASCII) are pinned by tests.

**Scope:**
- IN:
  - fail-closed template cases (D6): missing `.env.example`, a key with 0 or 2+ key lines, invalid UTF-8;
  - BOM, LF, CRLF and no-final-newline templates preserved;
  - the leftover temp file removed on every path;
  - an existing `.env` that is a directory fails;
  - D7: a lenient read of an existing `.env`, with a `WARNING:` naming each of `DB_PASSWORD`/`ADMIN_TOKEN` that is blank
    or the placeholder; compose still runs;
  - D9: invalid or missing `FRONTEND_PORT` gives a WARNING and no `.env` URL line; `$env:FRONTEND_PORT` valid and
    different gives the NOTE line with that URL;
  - static and echo tests.
- OUT: changing the Phase 1 contract or its tests. The harness may be imported but must not be edited (it is a
  Phase 1 file; extend it in the new test file if needed). For example, the `.env`-is-a-directory case calls
  `fs.mkdirSync(path.join(sandbox.dir, '.env'))` in the test itself.

**Edge cases:**
- `  DB_PASSWORD=x` (indented), `# DB_PASSWORD=x`, and `export DB_PASSWORD=x` are not key lines.
- `FRONTEND_PORT="8044"  # c` gives 8044; `0`, `70000` and `abc` are invalid.
- The template ends without a newline.

**Produces:** `install.ps1` final (the Phase 3 docs describe its messages). There is no code seam beyond Phase 1's.

**Done when:**
- [ ] DW-2.1: four templates (LF, CRLF, UTF-8 BOM + CRLF, LF with no final newline, each with Cyrillic comments): status
  0 and `Buffer.compare(withTemplateSecrets(env, template), template) === 0`.
- [ ] DW-2.2: each of these gives status 1, `FAILED:`, no `.env`, no `.env.install-*` leftover, and no `compose` in
  `dockerCalls`. Where a key is at fault, the message names it.
  - the template is missing;
  - `ADMIN_TOKEN` has no key line, or only an indented or commented one;
  - `DB_PASSWORD` appears on two key lines;
  - the template has the invalid byte `0xFF`.
- [ ] DW-2.3: an existing `.env` with `ADMIN_TOKEN=change-me-before-deploying` and `DB_PASSWORD=` gives:
  - a WARNING naming both keys;
  - output without the placeholder string;
  - the file byte-identical, and `compose up` ran.
- [ ] DW-2.4: `FRONTEND_PORT=abc` gives a WARNING and no `http://localhost:abc`. `FRONTEND_PORT="8044" # x` gives the
  8044 URL. With env `FRONTEND_PORT=9001` there is a NOTE with `http://localhost:9001/api/health` and the 8044 line is still present.
- [ ] DW-2.5: in DW-1.1-style runs, neither secret from the created `.env` occurs in stdout, stderr or the fake-docker
  log. Every byte of `install.ps1` and `install.cmd` is < 0x80. `install.ps1` contains none of `Read-Host`,
  `Get-Credential`, `Get-Random`, `System.Random`, `docker.exe`. `install.cmd` contains no `pause`.
- [ ] DW-2.6: Phase 1's tests are unchanged and green. The DW-1.5 commands are green.

**Difficulty:** MEDIUM · **Uncertainty:** none.

### Phase 3: Docs: the Windows one-command install in `docs/self-host.md`
**Skills:** none -- end-user Ukrainian prose; no code-writing, design or error-handling triggers match
**Model:** sonnet
**Gate:** Minimal
**Depends on:** Phase 2
**File scope:** virtual-lab: docs/self-host.md, scripts/test/install-windows-doc.test.mjs
**AC:** AC-16 (supports the manual run) · **Risk:** normal

**Goal:** a Windows admin finds a short Ukrainian subsection that says how to run the installer, what it does and
does not do, and where the secrets are.

**Scope:**
- IN: the D12 subsection `### Windows: встановлення однією командою (install.cmd)`, inside `## Встановлення` before
  `### Перший модератор`, with the D12 content list (terminal not double-click, rerun-safe, secrets only in
  `.env`, URL + first build time, the Group Policy limitation, the deleted-`.env` warning without suggesting `down -v`).
  Plus a doc-guard test.
- OUT: other sections, `Readme.md`, renaming any heading, any `docker compose … -f` line.

**Edge cases:** the doc's existing `selfhost-doc` section slicing must still find every `## ` section it asserts on.

**Produces:** nothing downstream (final phase).

**Done when:**
- [ ] DW-3.1: a new test slices `## Встановлення` (up to the next `## `). The slice contains `install.cmd`,
  `Docker Desktop`, `/api/health` and `.env`, and the new `###` heading comes before `### Перший модератор`.
- [ ] DW-3.2: `git diff --numstat origin/ms/1... -- docs/self-host.md` shows `0` deleted lines.
  - The new doc test asserts that the text outside the `## Встановлення` slice equals the same text read with
    `git show origin/ms/1:docs/self-host.md`. If git or the ref is unavailable, the test returns early.
  - `git diff -U0 origin/ms/1... -- docs/self-host.md | grep -E '^\+.*docker compose .* -f '` prints nothing.
  - `npm run test:scripts` is green, including `selfhost-doc.test.mjs`.

**Difficulty:** LOW · **Uncertainty:** none.

---
## Test Coverage
**Level:** 100%. Every behaviour of `install.ps1`/`install.cmd` is exercised through the real wrappers with the fake docker.
PowerShell has no unit-test runner in this repo, so "routine" coverage means one black-box test per D-rule.
## Test Plan
- [ ] DW-1.1 to DW-1.5: `scripts/test/install-windows.test.mjs` (happy path via both routes, three "not running"
  shapes, existing `.env`, another cwd, compose failure).
- [ ] DW-2.1 to DW-2.6: `scripts/test/install-windows-env.test.mjs` (template matrix, fail-closed matrix, warnings, port
  rules, no-echo, ASCII and no-prompt static checks).
- [ ] DW-3.1, DW-3.2: `scripts/test/install-windows-doc.test.mjs`.
- [ ] Boundary: `FRONTEND_PORT` 0 / 1 / 65535 / 65536; template key count 0 / 1 / 2; template with and without a final newline.
- [ ] Dirty (≥ 5:1 overall): docker missing, info failing silently or with stderr, compose failing, a `.env` directory,
  missing/invalid/duplicated template keys, invalid UTF-8, a bad port, a placeholder existing `.env`.
- [ ] Integration: the whole `npm run test:scripts` suite after every phase (no existing test changes).
- [ ] Manual (AC-16, owner/close pass): on a clean Windows checkout with Docker Desktop running, run `install.cmd` in a
  terminal. Expect exit 0, a `.env` with two 64-hex secrets, `/api/health` → `{"status":"ok","db":"connected",…}` after the build,
  and a second `install.cmd` run that leaves `.env` byte-identical (`certutil -hashfile .env SHA256` before and after).

## Assumptions
| Assumption | Confidence | Verify Before Phase | Fallback If Wrong |
|---|---|---|---|
| A fake `docker.cmd` first on PATH is what `& docker` resolves to in 5.1 | high (verified 2026-11-23) | 1 | none needed |
| 5.1 throws on native stderr under EAP `Stop` | high (verified) | 1 | the helper covers it either way |
| `Write-Host` reaches piped stdout under `-File` | high (verified) | 1 | `[Console]::Out.WriteLine` |
| Acceptance fakes answer only `info` and `compose …` | medium | 1 | exactly two calls, by design (D8) |
| `.NET Framework` `File.Move` refuses to overwrite | high | 1 | `Test-Path` re-check before the move, fail on exists |

## Decision Log
| Decision | Alternatives Considered | Rationale | Phase |
|---|---|---|---|
| PowerShell, not Node | Node wrapper reusing `buildEnv` | no Node on admin boxes; `buildEnv` rewrites CRLF (D1) | 1 |
| Windows PowerShell 5.1 by full path | `pwsh`, PATH lookup | stock Windows; a narrow PATH still works (D2) | 1 |
| No `pause`, terminal-only docs | pause / double-click detection | "never prompts"; detection is unreliable (D3) | 1, 3 |
| Fail closed on a template key count ≠ 1 | append like `buildEnv` | an admin file must not silently lack a secret (D6) | 1, 2 |
| Keep a fresh `.env` when compose fails | delete it | the DB volume may already hold that password (D4.6) | 1 |
| Warn, don't block, on placeholder secrets in an existing `.env` | refuse | AC-8: compose still runs (D7) | 2 |
| No Compose v2 pre-check, no health polling | extra calls | exactly two docker calls; fake docker (D8, D9) | 1 |
| Owner pre-approved (autonomous mode, 2026-11-23) | per-checkpoint confirmation | owner instruction | all |

---
## Notes
- The milestone has hidden acceptance tests that only `gate.sh --acceptance` runs. Builders never look for them.
- Review cadence 1: all three phases touch one script.
- The `.gitattributes` line only changes how new checkouts write `*.cmd`. The repo tracks no `.cmd` at `e70ff8d`
  (`git ls-files '*.cmd'` is empty), so nothing gets renormalized.
- All diffs use the three-dot base `origin/ms/1...`. The guard `git diff --name-only --diff-filter=MDR origin/ms/1...
  -- scripts/test package.json` deliberately excludes `A`: added test files are allowed, and any modified,
  deleted or renamed one is a guard failure. Do not "fix" the filter.
- Node cannot spawn a `.cmd` directly (EINVAL). The harness always goes through `cmd.exe` or `powershell.exe`.
---
## Decided During Build
_Filled by /code-foundations:build — one row per decision an agent made or question it raised:_
| # | Phase | Decision or question | Source | Status |
---
## Execution Log
_To be filled during /code-foundations:build_
