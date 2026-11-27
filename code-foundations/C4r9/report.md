# C4r9 report — user scripts run only in Play

**Verdict: BUILD COMPLETE; live AC-16/U-7 gates delegated to Claude hidden-close.**
No engine change, no lockfile change, no existing test/config touched.

## Changes (editor branch `C4r9-edit-mode-play`)
- `8a6ef85` NEW `app/e2e/checks/C4r9.mjs` — ten-leg black-box AC-16 check (open, add, undo/redo,
  save, script save, Play once, Stop, rebuild after Stop, replay, clean).
- `8469211` `play-mode.service.ts` owns the engine mode: `enterEditMode()` in the constructor,
  `enterPlayMode()` on Play with a `try/catch`, teardown-in-play then `enterEditMode()` + snapshot
  restore on Stop; `script-runtime.service.ts` injects it so no user class registers before edit mode.
- `3344846` `README.md` "Edit mode and Play" paragraph.

## Evidence (this agent)
| Check | Evidence |
|---|---|
| Claim | `CLAIM_EXIT=0` |
| Check syntax | `NODE_CHECK_EXIT=0` |
| Strict TypeScript | `TSC_EXIT=0` |
| Production build | `BUILD_EXIT=0` (17.876 s) |
| Check-runner units | 9 pass / 1 pre-existing failure (`DW-2.1` verbatim fidelity, frozen files) |
| Mode-call ownership | `git grep` → 3 lines, all `play-mode.service.ts` |
| Test/lock guard | `GUARD_EXIT=0` (empty), `PROTECTED_EXIT=0` |
| Scope | `M README.md`, `A C4r9.mjs`, `M play-mode.service.ts`, `M script-runtime.service.ts` |
| Push | `3344846e1067804b4788e2f52192c5888e24c2b8` on `origin/C4r9-edit-mode-play` |
| Beats | `BEAT_EXIT=0`, `BEAT_DONE_EXIT=0` |

## Not run here (by dispatch constraint)
DW-1.2 red, DW-1.3 dirty, DW-2.2 green, DW-2.3 all checks, DW-2.4 U-7 Play paths, DW-2.5 throwing
awake, DW-3.1 full suites, DW-3.2 checks runner, DW-3.3 gate. Exact commands and expected outcomes
are in `notes.md`. No PASS is claimed for them.

**Trust:** the code compiles and builds; the protected e2e files and package manifests are byte-identical
to `origin/ms/2`; the new check is self-contained and fail-closed. The behavioural proof still requires
the hidden-close editor run.
