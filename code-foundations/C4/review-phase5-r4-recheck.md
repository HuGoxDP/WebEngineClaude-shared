# C4 phase 5 — R4 re-review (2026-11-21)

Editor tip pinned: **2400f8644fb3023f08eb3914e3503778d29cd111** (verified `git rev-parse HEAD`, branch C4-editor-scripts-and-library, worktree clean).
Scope: R4 re-entrancy fix (2400f86) + companions d9943bd (settle-before-open) and 51b0177 (monaco loader removal). R1–R3, R5–R10 not re-opened.
Method: read-only git + full-file traces of every touched service (code-editor, script-runtime, commands, project, app-state, shortcuts, dialog, code panel, app/workspace shells) and the e2e pins. **No builds/tests executed** (RAM gate per dispatch; the full e2e gate runs separately). Verdicts below are TRACE-grounded, not execution-grounded.

## Item 1 — concurrent save/reload coalescing (2400f86): PASS

R4 named two failure paths; both traced closed, plus the cross-caller paths:

- **Double save → self-overwrite ask.** `save()` stands down while a save is in flight: `if (!file || this._saving) return false` (code-editor.service.ts:102), flag set :103, released in `finally` :117-119 on every exit (decline, write failure, success). The second press never reaches `_changedOnDisk` (:105), so it cannot see the first save's own write before the stamp update (:114). Buffer typed after the first press stays dirty (`markEdited`, code.component.ts:159-162) — nothing lost by the skip.
- **Double save → concurrent reloads revoking each other's Blob URLs.** Doubly closed: the save guard admits only one save, and `ScriptRuntimeService.reload()` is single-flight (script-runtime.service.ts:110-128): a mid-flight caller sets `_rerun` and shares the running promise (:110-113); the pass loop (:118-121) runs at most one trailing pass; `finally` clears `_reloading` (:122-124). The `_reloading = pass` assignment (:127) is synchronous with the IIFE creation — no await between, so no caller can slip in before the guard is armed. Loop-exit → finally → return is one synchronous microtask continuation: a caller either sets `_rerun` before the `while` re-check (trailing pass runs) or sees `_reloading === null` and starts a fresh pass. No interleaving leaves two passes running. Revocation sites (:183 gone modules, :316 fresh relink) now execute only inside sequential passes; the within-pass fresh-closure invariant is unchanged from the R8-passing code.
- **Reload during save (focus check).** `checkOutsideEdits` stands down while `_saving` (code-editor.service.ts:192), so a focus event during a save cannot read the own-write as an outside change.
- **Cross-caller reloads** (settle commands.service.ts:491, library add :224, focus check code-editor.service.ts:229, save :115): all funnel through the single-flight `reload()`; a library write landing mid-pass is picked up by the trailing pass (`_rerun`). A pass rejection propagates to every sharer and is caught by `_reload` (code-editor.service.ts:139-142); `_reloading` is cleared in `finally`, so the next call starts clean.

## Item 2 — settle-before-open (d9943bd): FAIL — residual window on the project-SWITCH path

The fix works for opens **from the start screen**: `adopt`/`createInBrowser`/`openRecent` no longer set status (project.service.ts:193-197, :207-213, :229-250); `_settle` sets 'open' only after scripts + scene + recovery (commands.service.ts:495). While status is 'closed', `screen()` is 'start' (app-state.service.ts:28-34), the workspace is not rendered (app.component.ts:22-26) and shortcuts are detached (workspace.component.ts:317/:321). The e2e pin (run.mjs:2516) covers exactly this path.

**But when a project is already open, status never leaves 'open' during a switch**, so the workspace and its live shortcuts persist through the whole settle gap:

TRACE (edit wiped mid-open, switch path):
1. Workspace open on project A. File → Open Project is enabled (menu-model.service.ts:66 — disabled only when 'unsupported').
2. `openProject` (commands.service.ts:401-428) → pick B → `_confirmDiscard` answered → `_enter` (:462-466): `_resetScene()` :463, `adopt` (await scan), `_settle` :479.
3. In `_settle`, `reloadScripts()` :491 awaits Babel compile of B's scripts — a wide gap. Status is still 'open' (set only at :495; the only status.set sites are project.service.ts:132/:266 and commands.service.ts:495). Workspace mounted, `_dialog.isOpen()` false, so Alt+Shift+N reaches `createEmpty` (shortcuts.service.ts:45-48) and creates a GameObject.
4. `_resetScene()` at commands.service.ts:492 (and `_loadDefaultScene` :493) wipes the object and clears history. The edit made after the discard confirmation is silently lost — the exact defect class d9943bd's message claims to close.

Same window via `createProject` from an open workspace (commands.service.ts:364-365 → `_settle`). Not a regression introduced by d9943bd (the window existed before it), but the commit's mechanism — deferring status.set('open') — does nothing for open→open transitions, and the dispatch asks precisely for remaining windows. No e2e pin covers switching projects mid-settle.
Fix direction: mark the project not-open (or gate shortcuts/workspace on a settling flag) at the start of `_enter`/the browser-create branch, so the switch path gets the same protection as the start-screen path.

## Item 3 — monaco loader removal (51b0177): PASS

`monaco-loader.service.ts` deleted (81 lines). Repo-wide grep for `monaco-loader|MonacoLoader`: **zero matches** in src, e2e, package.json, angular.json. The Code panel's own `_loadMonaco` (code.component.ts:127-139) is independent and pre-existing; `monaco-editor` deps and grammar imports untouched. Stale e2e comment corrected to "runtime's Blob-URL shim" (run.mjs:353), matching script-runtime.service.ts:92/:480-489.

## Item 4 — regression pins: PASS with gaps (non-blocking; traces sound)

- **Double-save coalescing** — run.mjs:1437-1527 (added in 2400f86 with the fix). Deterministic seam `holdStampRead` (run.mjs:258-277) holds the first save between write-close and stamp read; second Ctrl+S lands inside the exact R4 window (:1469-1472). Pins: no self-overwrite ask (:1475-1476), class swapped to newest code (:1481-1483), newest default on a fresh object (:1504), exactly one reload for the double save (:1520), no import-failure note (:1521), no Console error (:1515). Failing-first by construction: on unfixed code the ask is up (asks > 0 fails :1475) and the scenario answers it (:1479) so the unfixed race also fails the reload-count/import checks. Not executed here (RAM gate); fix+test in one commit means no separate red run is evidenced.
- **Settle-before-open** — run.mjs:2516-2543 (d9943bd), seam `holdScriptRead` (:239-250): workspace absent during settle, shortcut inert, no phantom object, clean open. Start-screen path only.
- **Gap G1 (non-blocking):** the single-flight reload itself (script-runtime.service.ts:110-128, shared promise + trailing `_rerun` pass) has **no direct pin** — in the double-save scenario the second save is stopped by `_saving` before it ever calls reload, so `reloads === 2` passes on the save guard alone. No scenario drives two concurrent reload callers (e.g. library add during a save's reload). Code trace above is sound → non-blocking per dispatch rule.
- **Gap G2 (non-blocking):** the `_saving` guard on `checkOutsideEdits` (code-editor.service.ts:192) is unpinned — no scenario fires a focus event mid-save.
- **Gap G3 (blocking via Item 2):** no pin for the project-switch settle window.

## Loaded-Skill Criteria (aposd-verifying-correctness)

| Criterion | Status | Evidence |
|---|---|---|
| RC-1..4 requirements mapping | PASS | Items 1–4 mapped to code above; no scope creep in the three commits (diff confined to named services + e2e) |
| CS-1 shared state identified | PASS | `_saving`, `_checking` (code-editor), `_reloading`, `_rerun`, `_loaded`, `_classes` (runtime), `status` (project) |
| CS-2 access protection | PASS | Save guard + single-flight promise; all reload callers funnel through one gate |
| CS-3 TOCTOU | FAIL | Status 'open' persists through the switch-path settle gap — check (workspace live) vs use (scene reset) straddle the gap; TRACE under Item 2 (commands.service.ts:463/:492 vs :495) |
| CS-4 lock ordering | N/A | Single-flight, no nested locks; `_doc.acquireLock` is per-project, taken before settle |
| EH-1..5 error paths | PASS | Write failure surfaced + dirty kept (code-editor.service.ts:108-110); reload rejection caught (:139-142); pass finally clears state; read failures reach Console (script-runtime.service.ts:153-158) |
| RM-1..5 resources | PASS | Blob URLs revoked only for gone/fresh modules inside sequential passes (:183, :316); engine shim built once, never revoked (:69, :488); unchanged modules keep URLs — no leak on repeated reloads |
| BC-1..5 boundaries | PASS | Empty scripts dir → zero-file pass, no revoke/import; single module; `_rerun` collapses N requests to one trailing pass |
| SE-1..5 security | N/A | No new untrusted-input surface in the fix chain (CSP posture unchanged; R8 not re-opened) |

28 items checked, 19 pass, 8 n/a, 1 fail (CS-3).

## Notes (non-blocking)

- A focus check **already in flight** when a save starts is not cancelled (the :192 guard is entry-only; `save` does not check `_checking`). Its per-file `_changedOnDisk` could read the save's own write before the stamp update and raise a spurious outside-change question. Requires alt-tab-back + immediate Ctrl+S interleaving; outcome is a question, not silent loss; could not demonstrate without running. Confidence medium, severity low. A `_checking` guard on `save` (or re-checking stamps after the loop) would close it.
- `_stamps` (code-editor.service.ts:52) is never cleared on project close/switch; stale entries for same-named paths of the previous project could read as "changed" until the settle re-seed (:132). Settles re-seed before the workspace is editable on the start-screen path; on the switch path the focus guard's isOpen() is true throughout — same family as the Item 2 window. Low severity, undemonstrated.
- Dead code: none found in the touched files; the monaco loader deletion is complete.

## Issues (FAIL)

1. Project-switch settle gap wipes edits made mid-open.
   - File: commands.service.ts:462-466 (`_enter`), :492 (`_resetScene` in `_settle`), :495 (status set only at end); project.service.ts:193-197 (adopt no longer touches status); menu-model.service.ts:66 (Open Project enabled while open).
   - Demonstrated by: TRACE under Item 2 (workspace + shortcuts live because status stays 'open'; create during the reloadScripts gap → wiped by `_resetScene`).
   - Fix: set status 'closed' (or a settling gate) before `_enter`/browser-create begins the switch, so the workspace/shortcuts stand down until `_settle` completes; add an e2e pin that switches projects with a held script read and presses Alt+Shift+N in the gap.

VERDICT: FAIL @ 2400f8644fb3023f08eb3914e3503778d29cd111
