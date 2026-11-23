sha: 168810c38fc2606cbeb9dddd5ed62f7b0989d6f1
repo: virtual-lab
round: 2
reviewer: opus, high (fresh)
open-blocking: 1
---
- [open] correctness scripts/test/install-windows-doc.test.mjs:83-101 + scripts/test/fixtures/self-host-pre-ho1a.md — the live ref is gone, but the guard now compares the whole doc outside the HO1a subsection against a frozen copy of the pre-HO1a doc, and that copy is already stale: the fixture is byte-identical to `1c378ea:docs/self-host.md` (blob 01232df), while origin/ms/1 carries P5f's HTTPS-section edit (blob e10a010). The guard fails on the merge result. The design stays brittle either way: every later legitimate self-host.md edit outside the subsection breaks `test:scripts`, and fixing that means editing an existing test file, which the gate's test guard refuses. Fix direction: scope the guard to the HO1a subsection (where it sits and what it contains) and drop the whole-doc comparison, or drop the additions-only test; rework the F1 post-merge simulation test to match — evidence: `git merge-tree --write-tree origin/ms/1 168810c` → 14ad3f5, `git archive` to a temp dir, `node --test scripts/test/install-windows*.test.mjs` → tests 47, pass 45, fail 2 (`self-host doc: text outside «Встановлення» is byte-equal to the frozen pre-HO1a fixture`; `F1: the doc guard passes when origin/ms/1 already carries the post-HO1a doc`); on plain 168810c 47/47 pass. Fixture blob verified by the Claude pass with `git rev-parse`.
- [closed] non-blocking install.ps1 / docs/self-host.md:89-93 — inherited .env ACL — the Windows subsection now documents the inherited ACL (BUILTIN\Users, icacls). Acceptable — evidence: `git show 168810c -- docs/self-host.md`; F2 test passes.
- [closed] non-blocking install.ps1:257-265 — process-env override of the secret keys — now a NOTE by key name only, on both the existing-.env and new-.env paths; no value on stdout/stderr/argv — evidence: code read; F3 tests pass.
- [closed] non-blocking scripts/test/install-harness.mjs:20 — `'C:\\Windows'` now — evidence: `git show 168810c -- scripts/test/install-harness.mjs`.
- [open] non-blocking scripts/test/install-windows-findings.test.mjs:96-111 — the "reworded line still fails" test hard-codes the doc intro sentence `Цей документ — для адміністратора університету`; a future rewording of the intro breaks it. Same root cause as the blocking finding; goes away with the whole-doc guard — evidence: code read.

No new security findings.

Verified OK:
- merge tree with origin/ms/1 (e3dcca2) builds without conflicts; plain-tip install suite 47/47.
- `git diff --name-status origin/ms/1...168810c`: test files all `A`; `M` only `.gitattributes` (`*.cmd text eol=crlf`, justified for install.cmd) and `docs/self-host.md`; package.json and existing tests untouched.
- Security (install.ps1 at the tip): `RandomNumberGenerator` 32 bytes → 64 lowercase hex, checked before write; only `^DB_PASSWORD=` / `^ADMIN_TOKEN=` replaced, each must occur exactly once (fail closed); line endings/BOM/final newline preserved; temp file beside .env, `File.Move` never overwrites, re-check before move, `finally` cleanup; secrets never in messages, argv or compose; generic outer catch message. install.cmd: full-path powershell.exe, `-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0install.ps1"`.
- AC-7 / AC-8 behaviour per spec (docker info failure → "Docker is not running", no .env, no compose; existing .env byte-identical, compose still runs).
- Not verified here: full `test:scripts` on the merge tree (an extracted tree lacks node_modules; 3 smoke-tls failures were environment-only). No gate run on 168810c yet — the lead gates.
