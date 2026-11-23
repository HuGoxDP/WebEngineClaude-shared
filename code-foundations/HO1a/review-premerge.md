sha: 91f777bdb914abf4c65c52584e40f28c398da6d6
repo: virtual-lab
round: 1
reviewer: opus, high (fresh)
open-blocking: 1
---
- [open] correctness scripts/test/install-windows-doc.test.mjs:79-100 — the additions-only guard diffs docs/self-host.md against the live ref `origin/ms/1`, so it fails as soon as this branch is merged. Once origin/ms/1 carries the new subsection, "section minus new subsection == base section" can never hold, and `test:scripts` goes red on the milestone tip on every host that has the ref. Any later edit to self-host.md outside the section also fails it until merged. Fix: drop the test, or compare against a frozen fixture or hash of the pre-HO1a text — evidence: reproduced in a temp git repo with refs/remotes/origin/ms/1 = tip. Result: `AssertionError: the section minus the new subsection must equal the base section (0 deleted lines)`. The same file passes pre-merge.
- [open] non-blocking install.ps1:212-218 — .env takes the folder's inherited ACL. In a checkout under e.g. C:\virtual-lab, BUILTIN\Users can read the generated secrets. Consider tightening the ACL or mentioning it in docs/self-host.md — evidence: icacls on a created .env shows only (I) inherited entries.
- [open] non-blocking install.ps1:244-252 — compose interpolation gives process-environment DB_PASSWORD/ADMIN_TOKEN precedence over .env (docker-compose.yml:18,44,46,126). A stale env var silently overrides the fresh secrets, and only FRONTEND_PORT gets a NOTE. Suggest the same NOTE, by key name only — evidence: code read.
- [open] non-blocking scripts/test/install-harness.mjs:20 — `'C:\Windows'` in JS is "C:Windows" (`\W` is not an escape), so the fallback is wrong when SystemRoot is unset. Use 'C:\\Windows' — evidence: JS string semantics.

Verified OK (PS 5.1, temp copies, fake docker.cmd, no real docker):
- 39/39 installer tests pass.
- RandomNumberGenerator: 32 bytes -> 64 lowercase hex per key, two distinct values.
- .env equals the template byte for byte once the 2 secret values are swapped back (LF/CRLF/BOM covered by the tests).
- Never overwrites .env: File.Move does not overwrite, plus a re-check before the move.
- `exit` inside try skips the catch and still runs finally, so the temp file is cleaned up.
- When docker info fails: exit 1, the message "Docker is not running", no .env, no compose run.
- Scripts are pure ASCII, with no Read-Host or pause.
- A path containing spaces and [] works.
- No secret in the output or the docker argv.
