sha: c7aba181ff100943feb9a43e17cf372c0faab684
repo: virtual-lab
round: 2
reviewer: sonnet, high (fresh); re-pinned by the Claude pass (opus) 2026-11-24T22:2xZ after the worker rebased e5d9bd1 onto origin/ms/1 555ea50
open-blocking: 0
---
- [closed] correctness scripts/selfhost-check.mjs:539-545,568-576,623-627,655-660,684-698 — Ctrl+C during a child step ended `failed:<step>`. Now clone, up, backup (once), restore, e2e deps, e2e browser and smoke all call `await checkpoint()` BEFORE judging the child's non-zero status, so status 130 or null+SIGINT ends `interrupted`. — evidence: code read; the new selfhost-abort-nonzero.test.mjs covers abort+130 and abort+null/SIGINT at up (teardown ran twice, temp dir empty) and abort+130 at clone (no up, no teardown, temp dir gone); merge result c3470d9 (merge-tree origin/ms/1 e5d9bd1), `node --test scripts/test/selfhost*.test.mjs` = 122 pass, 0 fail, 0 skipped.
- [closed] non-blocking docs/self-host.md + selfhost-check.mjs installSignalHandlers — "second Ctrl+C stops at once" overstated; now says the second Ctrl+C ends the current docker command and the check stops after the teardown — evidence: diff text.
- [closed] non-blocking scripts/test/selfhost-listener-count.test.mjs — real listener-count test on a stub signal counting add/removeEventListener, in a NEW file — evidence: 2 tests pass.
- [closed] non-blocking scripts/selfhost-check.mjs:~720 — `--keep` manual command now guarded by `upAttempted && signal?.aborted` — evidence: diff.
- [closed] non-blocking scripts/selfhost-check.mjs:532 — checkpoint added before the clone — evidence: diff.
- [open] non-blocking scripts/selfhost-check.mjs sleepInterruptible (`Promise.resolve(sleep(ms)).then(finish, finish)`) — a rejection from the injected sleep is swallowed when a signal is passed, but propagates without one — DEBT; evidence: code unchanged.
- [open] non-blocking scripts/test/selfhost-interrupt.test.mjs:229 — `Date.now() - started < 500` against a real 1000 ms timer; flake risk on a loaded machine — DEBT; evidence: code unchanged.
- [open] non-blocking scripts/test/selfhost-interrupt.test.mjs:265 — the vacuous `signal.listenerCount?.('abort') ?? 0` assertion is still there (always 0). It is now covered by the real test in selfhost-listener-count.test.mjs, so it is only dead weight — DEBT; evidence: line 265.
- [open] non-blocking scripts/test/selfhost-abort-nonzero.test.mjs — the abort+non-zero-status cases are tested only for clone and up. Backup, restore, e2e deps/browser and smoke are covered only by the code read (identical checkpoint-first pattern) and by the abort+status-0 tests in selfhost-interrupt.test.mjs — DEBT; evidence: test list.
No other findings: only 1 file and docs modified plus 3 NEW test files; no existing test file edited; no skipped tests; no junk files in the diff.
- note: rebase equivalence — `diff <(git diff $(git merge-base e5d9bd1 origin/ms/1) e5d9bd1) <(git diff origin/ms/1...c7aba18)` (index lines ignored) differs only in one docs/self-host.md hunk header (@@ -661 → @@ -718: the base grew); the patch content is identical, so this review (round 2, open-blocking 0) applies to c7aba18. Gate PASS incremental c7aba18 (1314 tests).
