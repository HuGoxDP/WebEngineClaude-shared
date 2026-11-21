# C4 phase 5 — R4-G3 re-review of the fix (2026-11-21)

Editor tip pinned: **2a4fa9643946179852f4894ea13d9bacc3be5c70** (verified `git -C .workers/W1/WebEngineTSEditor rev-parse HEAD`; branch C4-editor-scripts-and-library; `status --porcelain` empty; `rev-list --left-right --count origin/master...HEAD` = 0/20; `origin/C4-editor-scripts-and-library...HEAD` = 0/0 — pushed). Shared docs tip 8111250fcdda014d63691b55d403f0c2d78c03ec (notes.md § "R4-G3 switch settle fix" present).
Scope: ONLY the G3 fix (2a4fa96: commands.service.ts, code-editor.service.ts, run.mjs; +100/−2, diff reviewed). R1–R3/R5–R10, coalescing and monaco items not re-opened. Method: read-only git + full-file traces; **no builds/tests executed** (RAM gate; full e2e gate is next). Verdicts are TRACE-grounded.

## Item 1 — switch path end-to-end, all entry points: PASS

Chain traced on the current tip: `_enter` sets `status 'closed'` FIRST (commands.service.ts:470), then `_resetScene` :471 → `adopt` :472 → `_settle` :473; browser-create branch sets 'closed' before `createInBrowser` (commands.service.ts:366-368). `_settle` sets 'open' only at the end (:503), after `reloadScripts` :499, `_resetScene` :500, `_loadDefaultScene` :501, `_offerRecovery` :502. While 'closed': `screen()` → 'start' (app-state.service.ts:28-34), workspace unmounted (app.component.ts:22-31) → shortcuts detached (workspace.component.ts:320-323), menubar items gone (topbar.component.ts:24-34, :66), Monaco disposed (code.component.ts:203-206). The only `status.set('open')` site in src is commands.service.ts:503 (grep-verified; others: project.service.ts:132 unsupported, :266 close, commands :366/:470 closed).

Entry-point sweep (grep of all callers):
- File → Open Project (menu-model.service.ts:66-67), start-screen button (start-screen.component.ts:44), Project-panel button (project.component.ts:207-210) → all funnel to `openProject` → `_enter` :429 — covered.
- New Project wizard: disk branch → `_enter` :361; browser branch → :366 guard — covered.
- Recent list (start-screen.component.ts:54-55) → `openRecent` → `_settle` :442. Reachable ONLY from the start screen (no recents UI in the workspace); when invoked normally status is already 'closed' through settle — covered. (Mid-settle re-click: see Note N1.)
- Command palette: none exists (only the viewport tool palette, workspace.component.ts:127). Drag-drop: splitter drags and file-import only — no project-switch drop handler (grep). No uncovered entry point.
- Side effects of 'closed' mid-switch checked: `doc.dirty()` false (`noteBlank`, document.service.ts:92-95) ⇒ no autosave/beforeunload; `refresh()` no-ops (project.service.ts:273); `checkOutsideEdits` gated by `isOpen()` (code-editor.service.ts:199); `_checkDisk` gated (commands.service.ts:722); `acquireLock` releases the old lock first (document.service.ts:189-190) — same-tab switch safe.
- The R4 FAIL trace is closed: after `_confirmDiscard` resolves, `_enter`'s status.set is the first statement — no await between confirmation and demotion on the openProject path; Alt+Shift+N cannot reach `createEmpty` (shortcuts detached) during the Babel gap.

## Item 2 — `_stamps` per-reload clear: PASS

`reloadScripts` clears `_stamps` before re-seeding every current script (code-editor.service.ts:138-139). Every settle goes through `reloadScripts`, so the baseline is per-project. Focus check after a switch: gated by `isOpen()` during settle (:199); after settle, stamps hold only the new project's files — a same-named path reads its fresh stamp, a previous-project-only path has no entry (`_changedOnDisk` returns false on undefined, :253-254) and is absent from the gone-loop's key set (:209). No stale-stamp path remains on the settled path. Residual: a focus check ALREADY in flight when the switch begins is not cancelled (entry-only guard) and could compare an old stamp against a same-named file of the new project — outcome is at most a spurious question, never silent loss, and its own `reloadScripts` (:236) re-clears. Note N3, non-blocking.

## Item 3 — save stands down while `_checking`: PASS (no loss)

`save` returns false when `_checking` (code-editor.service.ts:105). The buffer is NOT touched: `_dirty` stays true (cleared only on successful write :115 or a user-confirmed disk reload :228), the Monaco model keeps the text, the unsaved dot stays visible (code.component.ts:48-53). Both save callers (:108-117) ignore the false but the UI state invites a re-press; the check is a short file-read loop, so the deferral is brief. Nothing typed is lost — deferred, not dropped. No lock inversion: both guards are entry-only, neither flag waits on the other; single-threaded entry means exactly one of save/check proceeds. No deadlock, no starvation path.

## Item 4 — regression pins: PASS

- **Switch scenario** run.mjs:2555-2624. `holdScriptRead` (:239-250) armed AFTER project A settles; the one-shot seam catches the switch's `Scenario.ts` read (adopt/inspect/scan use directory entries, not getFile — traced). Red on 2400f86 by construction, on THREE independent assertions: status stays 'open' ⇒ `.work` count 1 fails :2584 and `.menubar-item` count 6 fails :2585; the keypress reaches `createEmpty` (workspace mounted, ctx-menu is not a dialog, focus not in a text field) ⇒ GameObject present fails :2588; A's Extra.ts stamp survives ⇒ focus gone-loop fires a third reload ⇒ `reloads === 2` fails :2609. Green on 2a4fa96 by the Item-1/2 mechanism; post-settle checks (ToAnchor, project-tag SwitchTo, Saved, no phantom, create-and-stays) all trace true — `openProject` has no reset after `_settle`. No false pin found: every gap assertion depends on the demotion, and the reload-count assertion depends on the stamps clear. No existing check weakened (diff is additive in run.mjs).
- **G2 pin** run.mjs:1480-1484: focus event inside the held write→stamp window must raise no dialog — pins the `_saving` term of `checkOutsideEdits` (:199, added 2400f86); without it the check reads the own write as an outside change and asks. Genuine pin, additive.
- Not executed here (RAM gate); fix+pins in one commit, so red-first is by construction, not evidenced by a run — same acceptance basis as the R4 re-review.

## Item 5 — deferred items: PASS (genuinely non-blocking)

- **G1** (single-flight reload direct pin): `reload()` unchanged and re-traced sound (script-runtime.service.ts:104-129 — shared promise, one trailing `_rerun` pass, finally-clear). No data-loss path; recorded ⬜ in notes.md:350-351.
- **code.file() staleness**: signal not cleared on switch; panel unmounts, `bottomTab` is per-instance so the workspace reopens on 'project'. If the Code tab is re-opened, `_sync` reads the old path against the new store; NotFound → caught, empty model (code.component.ts:181-185); a same-named path shows the NEW project's text (model replaced, `_ready` false during swap ⇒ no cross-project buffer write). Worst case is a stale dirty dot / abandoned dirty script buffer — the latter pre-exists 2400f86 (switch never asked about script buffers) and is not a regression of this fix. Recorded ⬜ in notes.md:352-353. No escalation warranted.

## Loaded-Skill Criteria (aposd-verifying-correctness)

| Criterion | Status | Evidence |
|---|---|---|
| RC-1..4 requirements mapping | PASS | Dispatch items 1–5 mapped above; diff confined to the two named services + e2e (no scope creep) |
| CS-1 shared state | PASS | `status`, `_stamps`, `_saving`, `_checking`, `_reloading`/`_rerun`, `_doc` lock — all identified |
| CS-2 protection | PASS | Status demotion before every open→open switch; entry-only mutual guards; single-flight reload |
| CS-3 TOCTOU | PASS | The R4 FAIL window closed: demotion is synchronous with the switch start; workspace/shortcuts cannot straddle the settle gap |
| CS-4 lock ordering | N/A | No nested waits; `acquireLock` releases before acquiring (document.service.ts:190) |
| EH-1..5 error paths | PASS | `_reload` catches and reports (code-editor.service.ts:143-150); settle failure leaves status 'closed' + fail dialog (commands.service.ts:488-492, run() :637-642); save write failure keeps dirty (:111-113) |
| RM-1..5 resources | PASS | Workspace unmount disposes Monaco + detaches viewport/shortcuts; Blob-URL lifecycle unchanged (R8 not re-opened) |
| BC-1..5 boundaries | PASS | Empty scripts dir -> clear+zero re-seed; same-named paths across projects re-stamped; single-module project pinned (SwitchTo) |
| SE-1..5 security | N/A | No new untrusted-input surface |

28 items checked, 20 pass, 8 n/a, 0 fail.

## Notes (non-blocking, candidate follow-up rows)

- **N1 - concurrent open from the start screen mid-settle.** During settle the start screen is visible (status 'closed'), so a second click on Open/Recent starts a concurrent `_enter`/`openRecent` with no settling gate; two `_settle`s can interleave (an object created after the first 'open' could be wiped by the second's `_resetScene`). Pre-existing on the d9943bd start-screen path that R4 already PASSed - the switch now inherits exactly that accepted exposure, not a new regression. Requires a deliberate second open during script load; no silent loss of confirmed work. A single-flight settle gate would close it.
- **N2 - createProject disk branch micro-gap.** `await createFolderIn` (commands.service.ts:360) sits between the discard confirmation and `_enter`'s demotion - one filesystem call wide, workspace still live. Keystroke-in-a-single-FS-op window; demote before `createFolderIn` to close. Severity negligible.
- **N3 - in-flight focus check across a switch** (Item 2 residual): spurious question possible for same-named paths; question, not loss.
- **N4 - no direct pin for the `_checking` term of `save`** (:105); would need a held focus-check seam. Trace-sound, question-prevention only.

## Issues (FAIL)

None.

VERDICT: PASS @ 2a4fa9643946179852f4894ea13d9bacc3be5c70
