# Research: HO1i: a `.env` the Windows installer creates gets a private ACL

**One line:** `install.ps1` locks down a `.env` it creates. Inheritance is removed, and only the installing user, `SYSTEM` and
`Administrators` get access. A `.env` that already exists keeps its bytes and its ACL. The env-override NOTE also
says "overrides .env", and the doc shows `.\install.cmd` for PowerShell.
**Date:** 2026-11-25 · **Status:** confirmed (autonomous run: decided by recommendation. The verification was
the grill below plus a code and experiment check. No cold-read subagent was used, because the owner rule says to work autonomously.)
**Still open:** nothing blocking. AC-26 (a live run on a clean checkout) is a manual AC for the lead or the owner, not a coder phase.

## Sources
- MS-2 spec `.workers/milestones/MS-2/spec.md`: AC-21, AC-26, U-11, the decision line "HO1i: the ACL is
  tightened only on a `.env` the installer creates (`icacls /inheritance:r` + grants for the current user,
  `SYSTEM`, `Administrators`); never on an existing one", the risk table row "Generated secrets on disk (`.env` ACL)
  → risk (security)", and the `docs/self-host.md` ownership rule (HO1i owns the install section only).
- DEBT `.workers/DEBT.md`:
  - `D-20261123T1159Z-a1`: install.ps1:212-218, `.env` inherits the folder ACL;
  - `-a2`: an env DB_PASSWORD/ADMIN_TOKEN overrides `.env`, so print a NOTE by key name;
  - `D-20261124T1857Z-36`: bare `install.cmd` fails in PowerShell, which needs `.\install.cmd`.
- HO1a pre-merge review, round 3 (`code-foundations/HO1a/review-premerge.md`): the ACL warning in the doc is
  accurate, and so is the `.\install.cmd` note (the doc's `cmd` route works, but Windows 11 "Open in Terminal" opens PowerShell).
- Code read at `origin/ms/1` (`47cf0b1`): `install.ps1`, `install.cmd`, `docs/self-host.md`, and every
  `scripts/test/install-*.mjs` file.
- graphify (virtual-lab graph): it has no installer node. The graph covers `selfhost-check.mjs`/`backup`/`reset-demo.ps1`, and
  `install.ps1` is not in it. The answer came from reading the code directly.

## Re-check of the DEBT items against `ms/1` (the spec requires it at activation)
| DEBT | State on `ms/1` | What HO1i still owes |
|---|---|---|
| -a1 ACL | **Open.** The doc warns (`self-host.md` Windows subsection: "Інсталятор ACL **не змінює**"), but install.ps1 does nothing about it | Tighten the ACL, then rewrite that paragraph |
| -a2 NOTE | **Mostly closed** by HO1a round 1 (`168810c`), install.ps1:257-265: `NOTE: <KEY> is set in the environment; compose uses it instead of the .env value.`, pinned by `install-windows-findings.test.mjs` F3 (an exact regex that ends in `value\.`) | The AC wording asks for "saying it overrides .env". Append one sentence after the pinned text so both the pin and the AC hold |
| -36 `.\install.cmd` | **Open** | One doc line plus a PowerShell code block |

## Facts established by experiment (2026-11-25, this machine, Windows PowerShell 5.1.26100 and pwsh 7.7)
1. Running `icacls <file> /inheritance:r /grant:r *<userSID>:(F) *S-1-5-18:(F) *S-1-5-32-544:(F)` on a freshly created
   empty file exits 0. Afterwards `Get-Acl` reports `AreAccessRulesProtected = True` and exactly three explicit Allow
   rules, one per SID. The `*SID` syntax does not depend on the system language. Group names differ on a non-English Windows,
   where `Administrators` is spelled differently.
2. `[IO.File]::WriteAllBytes` on that file, followed by `[IO.File]::Move` to `.env` in the same folder, **keeps** the protected
   three-rule DACL. Both 5.1 and 7 behave this way.
3. Under `$ErrorActionPreference = 'Stop'`, Windows PowerShell 5.1 **throws** `NativeCommandError` when a native
   command writes to stderr, even when that stderr is redirected to `$null` (for example `icacls` on a missing file, which exits 2). So icacls must
   run under a local `'Continue'` and be judged by `$LASTEXITCODE`, the same pattern as `Invoke-Docker` (HO1a D8).
4. **A failure can be injected without a code seam.** Give the sandbox folder an inheritable, inherit-only deny for the
   current user's WRITE_DAC (`(OI)(IO)(WDAC)`), plus an inheritable `OWNER RIGHTS` (`*S-1-3-4`) grant of `(M)`.
   `OWNER RIGHTS` suppresses the owner's implicit WRITE_DAC. A new file can then be created and written, but
   `icacls /inheritance:r` on it exits 5 (access denied). If the test also adds `(DE)` to that deny and puts a
   `(DC)` deny on the folder itself, the installer's temp file cannot be deleted. The stranded file can then be inspected:
   with the right ordering it is **0 bytes**. Removing the ACEs (`icacls <dir> /remove:d *SID`, `/remove:g *S-1-3-4`)
   brings normal cleanup back.

## Decisions
- **D1 Scope (spec decision).** The ACL is set only on the `.env` this run creates. An existing `.env` is never
  opened for writing and never has its ACL read or changed. Its bytes, mtime and security descriptor (SDDL) are identical
  after the run (U-11, MS-1 AC-8).
- **D2 Mechanism: `icacls.exe`, called by full path `$env:SystemRoot\System32\icacls.exe`, with SIDs.** The arguments are
  `/inheritance:r /grant:r "*<SID of [WindowsIdentity]::GetCurrent().User>:(F)" "*S-1-5-18:(F)" "*S-1-5-32-544:(F)"`.
  - Why the full path: nothing on PATH can replace it. The test fake controls PATH only for `docker`.
  - Why SIDs: they do not depend on the system language.
  - Rejected: `Set-Acl`/`FileSecurity`. `[IO.File]::SetAccessControl` does not exist in .NET Core, so pwsh 7 would need a different
    API. `Set-Acl` also tries to write the owner/SACL and can fail without a privilege. The spec already names icacls.
  - Rejected: names (`%USERNAME%`, `Administrators`). They break on a localized Windows.
  - Grant level: `(F)` for all three. The user must keep editing and deleting `.env`, because the doc tells them to open it.
- **D3 Order: no secret ever sits in a file with the folder's ACL.**
  1. Create the temp file **empty**.
  2. Tighten it.
  3. Verify it (D4).
  4. Only then write the secret bytes into it, then do the non-overwriting move.

  Facts 1–2 show that the DACL survives both the write and the move. The existing temp-path, re-check and `finally` cleanup stay as they are.
- **D4 Verify before the secrets are written (defense in depth).** Call
  `(Get-Acl -LiteralPath $tmp).GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])`. The check passes only when
  `AreAccessRulesProtected` is true, every rule is `Allow`, and every rule's SID is one of the three. Anything else fails closed (D5).
  In practice icacls exit 0 already guarantees this. The check costs ~6 lines and catches a policy or AV that
  re-adds ACEs.
- **D5 Failure = fail closed.** If icacls exits non-zero or the verification fails:
  - print `FAILED:` with an ASCII message saying access to the new `.env` could not be restricted
    to the user, SYSTEM and Administrators, and that no `.env` was created;
  - exit 1;
  - the temp file is removed (best effort, as today);
  - no `.env` and no compose call.

  Typical causes are a FAT32/exFAT drive or a network share without ACL support. Rejected alternative: warn and continue, which would leave
  secrets world-readable on exactly those filesystems. The doc names the cause and the fix: move the folder to NTFS, or follow the manual steps.
  The message contains no exception text and no icacls output, which is localized and includes the path.
- **D6 Native call helper.** Add a small `Invoke-Icacls` (or a generic `Invoke-Native`) beside `Invoke-Docker`. It sets
  EAP `'Continue'` locally, discards output (`*> $null`) and returns `$LASTEXITCODE`. `Invoke-Docker` stays byte-identical,
  because the HO1a D8 contract calls the bare `docker`.
- **D7 NOTE wording (-a2).** Keep the pinned text and append one sentence on the same line:
  `NOTE: <KEY> is set in the environment; compose uses it instead of the .env value. The environment value overrides .env.`
  The key name appears and the value never does. An empty environment value gets no NOTE (pinned by F3 "cleared"). ASCII only.
- **D8 Doc (`docs/self-host.md`, Windows subsection only).**
  - Step 2: add PowerShell next to the cmd block. One sentence says that in PowerShell (Windows Terminal,
    "Відкрити в терміналі") the command is `.\install.cmd`, followed by a ```` ```powershell ```` block with `.\install.cmd`.
  - Rewrite the ACL paragraph. A created `.env` has inheritance removed, and only you, `SYSTEM` and `Administrators` can access it.
    Check it with `icacls .env`. An **existing** `.env` is left alone, ACL included. If it was made by hand it inherits the folder's
    ACL (for example `BUILTIN\Users`), so restrict it through the file's Properties → Безпека or with `icacls`. If restricting is impossible, the installer stops
    with `FAILED:` (FAT32/exFAT or a network share without ACLs).
  - Existing guards that must still pass: in the subsection, F2 wants `ACL`, `Users`, and `icacls|Безпека`. The D12 strings of
    `install-windows-doc.test.mjs` must stay. The section order must stay.
  - **No «Що нового» entry.** The spec does not ask for one, and `verify-backup-docs.test.mjs` pins the newest entry to the
    2026-11-23 HO1b bullet, so a new top entry would break an existing test. There is no conflict to raise.
- **D9 Tests.** Only new files are added: `scripts/test/install-windows-acl.test.mjs` (behaviour) and
  `scripts/test/install-windows-acl-doc.test.mjs` (doc). The harness is imported but not edited. Every test returns early
  off Windows. ACL reads in tests go through `powershell.exe` (`Get-Acl` … SIDs), and the path is passed in an environment variable
  so quoting cannot interfere. The `icacls` text check matches ACE entries (`\Users:(`, `Authenticated Users:(`, `Everyone:(`) and never a bare `Users`,
  because the sandbox path under `%TEMP%` is `C:\Users\…`.

## Grill (questions that could have changed the outcome)
- *Should an existing `.env` be tightened when it is world-readable?* No. The spec forbids it ("never on an existing one"),
  and U-11 says an existing `.env` is never touched. The doc tells the admin how to restrict it themselves.
- *Should the installer fail on FAT/exFAT, or warn?* Fail closed (D5). This is house style, and the target is a server.
- *Which user is "installing" under Run as administrator?* `WindowsIdentity.GetCurrent().User`, the account that runs
  the script. Under UAC elevation that is still the signed-in admin's own SID. `Administrators` is granted as well.
- *Does Docker still read `.env`?* Yes. The compose CLI reads `env_file: .env` client side, as the user, who has `(F)`.
- *Can the verification branch (D4) be tested black-box?* No: with icacls exit 0 it cannot fail on NTFS. It is pinned by
  review, and the happy path runs it every time. The icacls failure branch can be tested (fact 4).
