# Plan: MS-2 HO1i: a `.env` the Windows installer creates gets a private ACL; the env-override NOTE; `.\install.cmd` in the doc
**Created:** 2026-11-25
**Status:** ready
**Complexity:** simple
**Review cadence:** 1
**Check-ins:** quiet
---
## Context
**Problem:** `install.ps1` writes two fresh secrets into a `.env` that inherits the repo folder's ACL. Under a folder such as
`C:\virtual-lab`, `BUILTIN\Users` can read them (DEBT `D-20261123T1159Z-a1`). The environment-override NOTE for
`DB_PASSWORD`/`ADMIN_TOKEN` exists, but it does not say "overrides .env" (`-a2`). The doc shows only `install.cmd`, and in PowerShell
that has to be `.\install.cmd` (`D-20261124T1857Z-36`).
**Success:** MS-2 AC-21 (hidden, Windows, MS-1 fake-`docker` harness), AC-26 (manual live run: `icacls .env` on a clean
checkout shows only the user, `SYSTEM` and `Administrators`), and U-11 (MS-1 AC-7/AC-8 behaviour unchanged).

Research (confirmed, decisions D1–D9, experiments 1–4): `code-foundations/HO1i/research.md`. **Read it first.** Every
"D<n>" below refers to it. Milestone: MS-2 (`.workers/milestones/MS-2/spec.md`). Base: virtual-lab `origin/ms/1` (`47cf0b1` at
planning time; branch from the then-current tip). **Landing:** one ROADMAP row, one task branch. The two phases are commits on it, in order.

## Constraints
- **Gate test guard:** never modify, delete or rename an existing test file, `e2e/` file or `test*` script.
  New tests are **new files** in `scripts/test/` (the existing `test:scripts` glob runs them). `install-harness.mjs` is
  imported, never edited. There is no `skip`/`todo`: off Windows (or without stock `powershell.exe`), a test **returns early** via `canRun()`.
- Existing pins that must stay green unchanged:
  - `install-windows.test.mjs` and `install-windows-env.test.mjs` (byte identity, two docker calls, no echo, ASCII, no prompt);
  - `install-windows-findings.test.mjs` F2: the Windows subsection names `ACL`, `Users`, and `icacls|Безпека`;
  - F3: the regex `NOTE: <KEY> is set in the environment; compose uses it instead of the \.env value\.`; an empty env value gives no NOTE;
  - `install-windows-doc.test.mjs`: the D12 strings, and the subsection sits before `### Перший модератор`;
  - `verify-backup-docs.test.mjs`: the newest «Що нового» entry is the 2026-11-23 HO1b one.
- **No «Що нового» entry** (the spec does not ask for one, and adding one would break the pin above). `docs/self-host.md`: HO1i owns
  **only** the `### Windows: встановлення однією командою (install.cmd)` subsection (spec file-ownership rule; P1f, HO1b2
  and HO1h own other sections).
- `install.ps1` stays **pure ASCII**, Windows PowerShell 5.1 + pwsh 7 compatible, never prompts, and never prints a secret or an
  exception text. `Invoke-Docker` and the two docker calls (`info`, `compose up -d --build`) stay exactly as they are.
- An existing `.env` is never written, renamed, deleted or ACL-changed (D1, U-11).
- No edit to `install.cmd`, `.gitattributes`, `package.json`, `scripts/selfhost-check.mjs` or ROADMAP.

---
## Implementation Phases

### Phase 1: Installer: lock down a newly created `.env` before any secret is written; NOTE wording
**Skills:** code-foundations:cc-defensive-programming, code-foundations:aposd-verifying-correctness
**Model:** sonnet
**Gate:** Standard
**Depends on:** none
**File scope:** virtual-lab: install.ps1, scripts/test/install-windows-acl.test.mjs
**AC:** AC-21 (installer half), U-11 · **Risk:** risk (security: generated secrets on disk, file ACLs)
**Security-sensitive:** yes

**Goal:** a `.env` that `install.ps1` creates has inheritance removed, with exactly three Allow ACEs (installing user,
`SYSTEM`, `Administrators`) **before** the secret bytes are written. A run where that cannot be done fails closed. An
existing `.env` is untouched, ACL included. The env-override NOTE says the environment value overrides `.env`.

**Scope:**
- IN (`install.ps1`):
  - D6: a helper `Invoke-Icacls([string[]]$IcaclsArgs)` beside `Invoke-Docker`. It sets EAP `'Continue'` locally, `& $icaclsExe @IcaclsArgs *> $null`,
    returns `$LASTEXITCODE`, and restores EAP in `finally`. `$icaclsExe = Join-Path $env:SystemRoot 'System32\icacls.exe'` (full path, never PATH).
  - D2/D3 in the "create" branch, between building `$outBytes` and the move, in this order:
    1. `[IO.File]::WriteAllBytes($tmpPath, [byte[]]@())` (empty);
    2. `Invoke-Icacls @($tmpPath, '/inheritance:r', '/grant:r', "*${userSid}:(F)", '*S-1-5-18:(F)', '*S-1-5-32-544:(F)')`
       where `$userSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value`;
    3. D4 verification on `$tmpPath`: `Get-Acl -LiteralPath` → `AreAccessRulesProtected` and
       `GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])` show every rule `Allow` with its
       SID in {user, `S-1-5-18`, `S-1-5-32-544`};
    4. only then `[IO.File]::WriteAllBytes($tmpPath, $outBytes)`, the existing `.env` re-check, and the non-overwriting `File.Move`.

    All of this stays inside the existing `try/catch/finally` so the temp-file cleanup is unchanged.
  - D5: a non-zero icacls exit or a failed verification → `Fail` with the exact line given in **Produces**. It is ASCII, and it contains
    no icacls output beyond the exit number, no path and no exception text.
  - D7: the secret-key NOTE line becomes `NOTE: <KEY> is set in the environment; compose uses it instead of the .env value. The environment value overrides .env.`
    The condition (non-empty env value) is unchanged.
  - The header pseudocode (`.DESCRIPTION`) gains the new steps (ASCII).
- IN (tests): the new file `scripts/test/install-windows-acl.test.mjs` with its own helpers:
  - `readAcl(file)` spawns `powershell.exe -NoProfile -NonInteractive -Command` with the path in an env var. It returns
    `{protected, sddl, rules:[{sid, type, inherited}]}` (rules as SIDs via `GetAccessRules(..., [SecurityIdentifier])`).
  - `currentUserSid()` (same route).
  - `widenFolder(dir)`: `icacls dir /grant *S-1-5-32-545:(OI)(CI)(RX) *S-1-5-11:(OI)(CI)(RX) *S-1-1-0:(OI)(CI)(R)`.
  - `denyAclChange(dir, {strand})` / `undeny(dir)`: the fact-4 ACE set from the research, removed in `finally` before `sandbox.cleanup()`.
- OUT:
  - ACL changes on an existing `.env`, on the folder, or on `.env.example`;
  - any change to `Invoke-Docker`, the docker argv, the secret generation or the template splice;
  - a test seam/env switch in `install.ps1`;
  - the doc (Phase 2).

**Edge cases:**
- The sandbox folder grants `Users`/`Authenticated Users`/`Everyone` read (inheritable). The created `.env` must still show none of them.
- An existing `.env` that inherits a wide ACL keeps exactly that ACL (SDDL equal), its bytes and its mtime.
- icacls cannot change the DACL (fact-4 deny): exit 1, `FAILED:`, no `.env`, no temp leftover, no compose, no secret printed.
- Ordering: if the temp file cannot be deleted after that failure (strand variant), the stranded `.env.install-*.tmp` is
  **0 bytes**. That proves no secret is written before the lock-down.
- Windows PowerShell 5.1 under EAP `Stop` throws on a native stderr line (fact 3). icacls writes to stderr on failure, so the
  helper's local `'Continue'` is required, and the failure test exercises it.
- The `icacls` text output starts with the sandbox path, which contains `C:\Users\…`. Text assertions match ACE entries
  (`\Users:(`, `Authenticated Users:(`, `Everyone:(`), never a bare `Users`.
- `whoami`/user names are never used. SIDs keep it locale-independent (a Ukrainian or German Windows names `Administrators` differently).

**Produces:** the following contract, which Phase 2 documents and which DW-1.1, DW-1.3 and DW-1.5 pin:
- **ACL of a created `.env`:** protected (no inheritance), with exactly 3 Allow ACEs: the current user's SID, `S-1-5-18` and `S-1-5-32-544`, all `(F)`.
- **D5 failure line:** `FAILED: could not restrict access to the new .env to the current user, SYSTEM and Administrators (icacls exit <n>); no .env was created`.
  When the verification fails, ` (icacls exit <n>)` is replaced by ` (unexpected access entries)`.
- **D7 NOTE line:** `NOTE: <KEY> is set in the environment; compose uses it instead of the .env value. The environment value overrides .env.`

**Done when:**
- [ ] DW-1.1 (AC-21 ACL, created): in a `widenFolder` sandbox, via `cmd` **and** via `powershell`:
  - status 0;
  - `readAcl('.env')` has `protected === true`, every rule `Allow` and not inherited, and the set of SIDs deep-equals
    `{currentUserSid(), 'S-1-5-18', 'S-1-5-32-544'}`;
  - no rule SID is `S-1-5-32-545`, `S-1-5-11` or `S-1-1-0`;
  - `icacls .env` (System32 path) output has no `/(^|[\\\s])(Users|Authenticated Users|Everyone):\(/m` entry;
  - `dockerCalls` deep-equals `['info', 'compose up -d --build']`.
- [ ] DW-1.2 (AC-21 / U-11, existing): in a `widenFolder` sandbox with a pre-existing `.env` (CRLF, Cyrillic comment,
  `FRONTEND_PORT=8123`), the following are identical before and after the run: `readAcl('.env').sddl`, the bytes, and the mtime. Its rules still include
  `S-1-5-32-545`, status is 0, and compose ran.
- [ ] DW-1.3 (D5 fail closed): with `denyAclChange(sandbox.dir)` applied after `makeSandbox`:
  - status 1;
  - stdout+stderr contains `FAILED:`, `.env` and `no .env was created`;
  - no `RemoteException`/`NativeCommandError`;
  - no `.env`;
  - no `.env.install-*` leftover;
  - `dockerCalls` deep-equals `['info']`;
  - stdout+stderr has no `/[0-9a-f]{64}/` run.
- [ ] DW-1.4 (D3 ordering): with `denyAclChange(sandbox.dir, {strand: true})`, status is 1, and exactly one `.env.install-*.tmp` exists with size **0**.
- [ ] DW-1.5 (AC-21 NOTE): env `DB_PASSWORD`/`ADMIN_TOKEN` set to dummy values (both with a created `.env` and with an existing one):
  - each key has a stdout line matching `^NOTE: <KEY> is set in the environment; compose uses it instead of the \.env value\. The environment value overrides \.env\.\r?$` (multiline);
  - no dummy value appears in stdout, stderr or `dockerCalls`;
  - every stdout char is < 0x80.
  With both set to `''` there is no `NOTE:`.
- [ ] DW-1.6 (static, every platform, no early return): `install.ps1` is pure ASCII. It contains `System32\icacls.exe`,
  `/inheritance:r`, `*S-1-5-18:(F)` and `*S-1-5-32-544:(F)`, and does not contain `Set-Acl`, `SetAccessControl` or `Read-Host`.
  The secret-bytes write (`WriteAllBytes($tmpPath, $outBytes)`) comes after the `/inheritance:r` call in the source text (index order).
- [ ] DW-1.7 (regression): all existing `scripts/test/install-*.test.mjs` are green unchanged on Windows.
  `npm run test:scripts` is green. `git diff --name-only --diff-filter=MDR origin/ms/1... -- scripts/test package.json` prints nothing.
  `git diff origin/ms/1... -- install.ps1` leaves the `Invoke-Docker` function and both docker argv arrays untouched.

**Difficulty:** MEDIUM · **Uncertainty:** low (facts 1–4 were checked by experiment on 5.1 and 7 before planning).

### Phase 2: Doc: `.\install.cmd` for PowerShell, and the new ACL behaviour, in the Windows subsection
**Skills:** none -- end-user Ukrainian prose plus a static doc test; no code-design, error-handling or security-implementation triggers match
**Model:** sonnet
**Gate:** Minimal
**Depends on:** Phase 1
**File scope:** virtual-lab: docs/self-host.md, scripts/test/install-windows-acl-doc.test.mjs
**AC:** AC-21 (doc half), AC-26 (supports the manual run) · **Risk:** normal

**Goal:** a Windows admin in PowerShell sees `.\install.cmd` right next to the cmd command. The ACL paragraph tells the
truth after Phase 1: a created `.env` is private, an existing one is left alone, and an ACL-less filesystem stops the run.

**Scope:**
- IN (only inside `### Windows: встановлення однією командою (install.cmd)`, before `### Перший модератор`):
  - Step 2: right after the existing ```` ```bat ```` block with `install.cmd` (which stays), add one sentence and a
    ```` ```powershell ```` block containing `.\install.cmd`. The sentence says that in PowerShell (Windows Terminal, «Відкрити в терміналі»
    у Windows 11) a bare `install.cmd` is not found and you need `.\install.cmd`.
  - Replace the ACL paragraph (it currently ends «Інсталятор ACL **не змінює**…») with D8 content:
    - a `.env` the installer creates loses its inherited folder ACL, and only you (the user who ran it), `SYSTEM` and `Administrators`
      have access, even when the folder is readable by e.g. `BUILTIN\Users` (`C:\virtual-lab`);
    - check it with `icacls .env`;
    - an existing `.env` is not touched, ACL included. A hand-made one inherits the folder ACL, so restrict it on shared machines
      (Properties → Безпека, or `icacls`);
    - if access cannot be restricted (FAT32/exFAT, a share without ACLs), the installer stops with `FAILED:` and creates no
      `.env`. Move the repo to an NTFS disk or follow the manual steps above.
  - The new test file `scripts/test/install-windows-acl-doc.test.mjs`.
- OUT:
  - any other section, heading rename or «Що нового» entry;
  - `Readme.md`;
  - the Linux/manual steps at the top of `## Встановлення`;
  - any `docker compose … -f` line.

**Edge cases:**
- F2 needs `ACL`, `Users`, and `icacls|Безпека` in the subsection, so the rewrite keeps all of them.
- The D12 strings (`не змінює`, `тільки у \`.env\``, `ніколи не друкуються`, …) stay.
- The F1 guard simulation replaces the first `install.cmd` in the doc. The new text must not make that replacement pass the guard (it still fails, because the heading changes).

**Done when:**
- [ ] DW-2.1 (AC-21 doc): the new test slices the Windows subsection (heading → `### Перший модератор`). Inside it:
  - a ```` ```bat ```` block whose only command is `install.cmd`;
  - **after it**, a ```` ```powershell ```` block whose only command is `.\install.cmd`;
  - the PowerShell block comes before the `Подвійний клік` paragraph;
  - `.\install.cmd` appears nowhere outside the subsection.
- [ ] DW-2.2 (ACL truth): the subsection contains `SYSTEM`, `Administrators`, `icacls .env`, `FAILED:`, and `FAT32` or `exFAT`.
  It contains `ACL`, `Users`, and `icacls`. It **no longer** contains `Інсталятор ACL **не змінює**` (stale claim). It still states that an existing
  `.env` is not changed (a sentence with `наявний` and `ACL` in one paragraph).
- [ ] DW-2.3 (regression): `npm run test:scripts` is green, including `install-windows-doc`, `install-windows-findings` (F1/F2),
  `selfhost-doc` and `verify-backup-docs` (newest «Що нового» still HO1b). Every hunk of
  `git diff -U0 origin/ms/1... -- docs/self-host.md` lies between the Windows heading line and `### Перший модератор`.

**Difficulty:** LOW · **Uncertainty:** none.

---
## Test Coverage
**Level:** 100%. Every new behaviour of `install.ps1` is exercised black-box through the real `install.cmd` / `powershell -File`
routes with the harness fake docker. PowerShell has no unit runner here, so the standard is one black-box test per D-rule. The one branch
that is unreachable on NTFS (D4: the verification fails after icacls exit 0) is covered by review and by the happy path executing it.

## Test Plan
- [ ] DW-1.1 to DW-1.7: `scripts/test/install-windows-acl.test.mjs`:
  - created `.env` ACL via both routes in a widened folder;
  - existing `.env` SDDL, bytes and mtime unchanged;
  - fail-closed ACL denial;
  - stranded-temp ordering proof;
  - the NOTE wording and ASCII, with no value echo;
  - static source pins;
  - the regression commands.
- [ ] DW-2.1 to DW-2.3: `scripts/test/install-windows-acl-doc.test.mjs` (the PowerShell block beside the cmd block, the ACL paragraph content, the stale claim
  gone, the hunk-range check).
- [ ] **Dirty tests (must fail on the base, i.e. against `origin/ms/1`'s `install.ps1`/doc):**
  - DW-1.1 on base: the widened folder's `Users`/`Everyone` ACEs are inherited, and `protected` is false.
  - DW-1.3 on base: exit 0 and a `.env` is created, because nothing tries to change the DACL.
  - DW-1.4 on base: the base writes the secrets into the temp file first. The rename then fails on the denied DELETE, so the base exits 1 and
    the stranded temp holds the full secret-bearing `.env` bytes (size > 0). The size-0 assertion catches exactly that.
  - DW-1.5 on base: the `overrides .env` sentence is missing.
  - DW-2.1/2.2 on base: there is no `.\install.cmd`, and the stale «не змінює» claim is present.

  The coder runs each new file once against a base checkout (`git stash`-free: `git worktree add` of `origin/ms/1`, or
  copy the base `install.ps1` into a sandbox) and records "fails on base: yes" per DW in the commit body.
- [ ] Boundary/error: an icacls failure (exit 5) under 5.1 EAP `Stop` produces no `NativeCommandError` (DW-1.3), and the path with a
  space (harness sandbox) holds on every route.
- [ ] Manual (AC-26, the lead or the owner, not a coder phase): on a machine with Docker running, run `install.cmd` in a clean
  Windows checkout. `icacls .env` must show only the user, `NT AUTHORITY\SYSTEM` and `BUILTIN\Administrators`, without `(I)`, and
  `/api/health` must answer. Record the output in the PREMERGE review.

---
## Notes
- **DEBT re-check (spec activation rule):** `-a1` is open (fixed here). `-a2` was mostly closed by HO1a `168810c`, and only the "overrides" sentence is
  added. `-36` is open (fixed here). Close all three in DEBT/ROADMAP when HO1i lands.
- **Pre-merge review (risk row):** the reviewer re-reads `install.ps1` fresh. Check the empty → tighten → verify → write → move
  order, that every icacls call goes through the `'Continue'` helper by full path, that the existing-`.env` branch has no ACL
  call, that no message includes icacls output or exception text, and that `Invoke-Docker` is unchanged.
- **Test hygiene:** a deny-ACE test must remove its ACEs in `finally` **before** `sandbox.cleanup()`, otherwise the
  stranded temp dir cannot be deleted. A test that crashed mid-way leaves only a `%TEMP%\vl install test *` dir.
  An inherited `DB_PASSWORD`/`ADMIN_TOKEN` in the runner's environment would add NOTE lines, so DW-1.1 to DW-1.4 pass
  `env: { DB_PASSWORD: '', ADMIN_TOKEN: '', FRONTEND_PORT: '' }`.
- `docs/code-standards.md` was not regenerated. This run may write only into `code-foundations/HO1i/`, and the conventions
  were read from the HO1a plan and its tests.
- The hidden AC-21 test reads `icacls .env` by name (English Windows on this machine). Locale-independent SIDs give the
  expected English names there.
---
## Decided During Build
_Filled by /code-foundations:build — one row per decision an agent made or question it raised:_
| # | Phase | Decision or question | Source | Status |
---
## Execution Log
_To be filled during /code-foundations:build_
