# HO1b2 — verify the backup inside the container without a test-guard exception

Decided by the Claude pass 2026-11-23 (delegated, provisional; OWNER-DECISIONS #30). The question was parked
only in the ROADMAP row (`🔒 deferred: needs-owner (test-guard exception)`), split from HO1b by the MS-1 research.

- **Options:** A — ask the owner for a gate test-guard exception so the existing `selfhost-restore` /
  `selfhost-doc` tests can be edited to the new step list; B — make it additive: `selfhost-check` keeps the
  host verify as the default (step list, host-mount marker and pinned output unchanged) and gains an opt-in
  in-container verify (flag `--verify-in-container`, plus a doc line); new tests in new files only;
  C — drop HO1b2.
- **Evidence:** the gate's test guard (`gate.sh` "test guard") refuses edits, deletions and renames of
  existing test files against the milestone base — on purpose, it is the oracle that stops weakened tests.
  HO1b (merged, `b50ad68`) already ships the verifier in the image (`backup/verify-backup.mjs`), so the
  in-container path is just a `docker compose run --rm --entrypoint node backup verify-backup.mjs` call.
  research `code-foundations/HO1b/research.md:18,171` names the pinned expectations as the only obstacle.
- **Chosen:** B (the recommendation). It keeps the oracle intact (A weakens the gate for one row, and a
  gate exception is a rule change, not a task decision) and still delivers the feature. C loses a real
  improvement (no host Node needed for the check's backup step).
- **Plan:** row HO1b2 → `🧠` for the next virtual-lab milestone; its code-foundations plan specifies the flag,
  the new test file and the doc line; it lands after HO1e (same file, `selfhost-check.mjs`). Making the
  container path the default later is a separate milestone decision with its own unchanged-behaviour list.
- **Public behaviour:** new opt-in flag only; default `selfhost-check` output unchanged.
- **Rollback:** delete the row / revert its one commit; nothing else depends on it.
