# C4 — Stage 12: scripts + the starter library of ten behaviours — Report (W1)

Task: ROADMAP row **C4** (M4, editor), card `.claude-shared/tasks/C` C4.
Branch: `C4-editor-scripts-and-library` — `WebEngineTSEditor` @ `2a4fa9643946179852f4894ea13d9bacc3be5c70`
(20 ahead / 0 behind `origin/master` `9417a4b`, pushed, `origin/C4…HEAD = 0/0`), and `.claude-shared`
@ `ae78227` (21 ahead / 0 behind `origin/main` `eeea047`, pushed).
Workspace: `R/.workers/W1/WebEngineTSEditor` and `R/.workers/W1/.claude-shared`.
Verification: `.workers/logs/C4-verify-2a4fa96.md` — **VERDICT PASS @ 2a4fa96** (2026-11-21).

## What landed

**Editor** (`WebEngineTSEditor`, 20 commits, 33 files, +3316/−29):

- **Phase 1 — the Code tab** (`eaab306`): Monaco in a lazy chunk (+10 kB, inside the existing budget
  warning), `CodeEditorService` (the open file, its own dirty state, the jump target), double-click
  routing by kind, the scene's dirty guard never applying to a script.
- **Phase 2 — the script runtime** (`2acf332` engine bump for C2/C3, `795763f`): `ScriptRuntimeService`
  — enumerate `scripts/`, transpile with `@babel/standalone` (Monaco's worker and `typescript` were both
  proven unusable, deviation D3), rewrite relative specifiers to Blob URLs, register new classes and
  `TypeRegistry.replace` ones a reload already has (C3), then load the scene so its type names resolve.
- **Phase 3 — diagnostics** (`59bb0d3`): a broken script says so in the Console with a file/line jump,
  a missing one shows `MissingComponent`/“Missing script”, the scene never breaks.
- **Phase 4 — the library of ten** (`dc9b099` + review fixes `a310e89`, `efdac04`): ten shipped
  behaviours as project sources (`app/src/app/library/*.ts`), the Library section in Add Component,
  deduped both ways (a class the project's own scripts provide is never offered), a permanent write
  with scene-only undo, and an Array-of-Vector3 waypoint editor.
- **Phase 5 — focus/outside edits** (`3bacd9b`, `3191f9e`): outside edits reload on focus, dirty
  buffer + an explicit overwrite ask, no silent clobber; a saved scripted component survives a full
  reload.
- **Review fix chain**, each a separate commit:
  - `bf29d14` — **C4r4** folded in: one engine shim per page load, the bare `"WebEngineTS"` specifier
    rewritten with the engine's own `_ENGINE_IMPORT_RE`, `fresh` closed under importers, unchanged
    modules keep their Blob URL. `a4c29c2` fixed two fixtures that were wrong, not the code.
  - The import map was removed (the boot regression it caused, 859–932 ms → ~3000 ms, back to
    846–870 ms): `app/src/assets/engine/` and `externalDependencies` gone, the engine bundled from the
    installed tarball — **C4r1** closed one step further than asked.
  - `f019ee0` — **C4r2**: only `NotFoundError` is skipped, every other read failure reaches the Console.
  - `4549b8b` — the C4r1 e2e pin: the page's `BuildInfo.builtAt`/`version` equals the installed
    package's.
  - `5b973a1` — **T2**: every scenario's browser context is closed after it. That leak was the suite's
    late-run flakiness cause.
  - `d9943bd` + `2400f86` — **R4**: a project opens only once its scene has settled; concurrent saves
    and reloads coalesce (single-flight `reload()` with one trailing pass, a `_saving` guard, a
    `_saving` term on `checkOutsideEdits`).
  - `51b0177` — the dead Monaco loader deleted.
  - `2a4fa96` — **R4-G3**: a project *switch* demotes status before the new project's settle begins
    (`screen()` → start, workspace unmounted, shortcuts detached), `reloadScripts` clears `_stamps`
    per project, `save` stands down while `_checking`.

**Shared** (`.claude-shared`, 14 commits, 11 files, +2927/−1): research, plan, notes for every phase
and every review round, the phase-5 review and its two re-reviews, and the four full-suite green logs
in `code-foundations/C4/evidence/`.

## Check results

| Check | Result |
|---|---|
| e2e full suite (final tip `2a4fa96`, 2026-11-21 16:55→17:02Z) | **501 PASS / 0 FAIL / 0 skip**, 45 scenarios, `E2E_EXIT=0` |
| e2e history | 371 PASS (11-18) → 475 (11-19) → 486 (11-20) → **501** (11-21) |
| `npx ng build` | exit 0, 46.9 s, initial 2.00 MB (1 MB warning pre-existing, under the 3 MB error budget) |
| `ng build --base-href /editor/` (serving build) | exit 0, `<base href="/editor/">` |
| New pin `run.mjs:2555` switch-settle (R4-G3) | 14/14 PASS |
| New pin `run.mjs:1437` double-save coalescing (R4) | 12/12 PASS, incl. the `:1484` G2 focus-mid-save check |
| `tsc -p tsconfig.app.json --noEmit` | exit 0 |
| CSP scan | 0 `eval(` / 0 `new Function(` in the bundle |
| ScenarioCreator `e2e:build` (library sources compile) | PASS, DW-4.2 passed outright |
| Junk check | `git status --porcelain` empty in both repos; diff lists only intended files |

Editor-only task: the engine (`WebEngineTS`) is untouched on this branch beyond the `2acf332`
`package.json` tarball pin, so no graphify update is in scope.

## Debug history (bugs found and fixed, each with its regression)

- Boot regression from the import map (measured, fixed by removing the map) — notes § “the boot
  regression Debug found, and the fix”.
- `rewriteEngineImports` dropped the last import clause; two fixtures were themselves wrong.
- The library review found two blockers, fixed forward with failing-first regressions:
  `a310e89` (ghost attach on an object deleted mid-add) and `efdac04` (a zero-byte leftover hid the
  entry forever).
- The phase-5 adversarial review failed on R4 (reload/save re-entrancy); its re-review failed on the
  project-switch settle window (CS-3 TOCTOU); the R4-G3 re-review is **PASS @ 2a4fa96, 28 items:
  20 pass / 8 n/a / 0 fail**, with four non-blocking notes (N1–N4) recorded below.

## Deviations

- Monaco's worker and `typescript` could not produce a browser-linkable module in this build (AMD
  `require.toUrl`, Node `path`); `@babel/standalone` was used instead (recorded in the notes).
- On 2026-11-17 the machine had no network: the browser failing-first/passing pair for C4r4 was not
  evidenced, so those scenarios are red-by-construction only.
- The R4/R4-G3 fixes and their pins landed in the same commits, so no separate red run is evidenced
  for them either; red-first is by construction (documented per pin in the re-reviews).
- The last two review rounds ran trace-only (no builds/tests) inside the lead-managed build window;
  the executions happened in the gates before and after.
- The “hand-written run.lock” incident belonged to task P5c, not to C4 — it is recorded in
  `code-foundations/P5c/report.md`.

## What remains (new ROADMAP ⬜ rows)

- **C4r5** — the single-flight `reload()` has no direct pin; needs a scenario driving two concurrent
  reload callers (a library add during a save's reload).
- **C4r6** — `code.file()` survives a project switch: the open-file signal is not cleared, so the Code
  tab can show the previous project's path or, for a same-named path, the new project's text with a
  stale dirty dot.
- The R4-G3 recheck's non-blocking notes N1–N4 (a concurrent second open mid-settle; the
  `createFolderIn` micro-gap; an in-flight focus check across a switch; no direct pin for the
  `_checking` term of `save`) are trace-grounded, question-at-most severity, and filed in
  `review-phase5-r4-g3-recheck.md` rather than as rows.

## Git log and diff per repo

`WebEngineTSEditor` — `git log --oneline origin/master..HEAD` (20 commits), `git diff --stat
origin/master...HEAD` → **33 files changed, 3316 insertions(+), 29 deletions(-)**:

```
2a4fa96 fix(editor): a project switch settles before the workspace accepts edits; script stamps reset per project (C4 review R4-G3)
2400f86 fix(editor): concurrent saves and reloads coalesce — no revoked-URL import, no self-overwrite ask (C4 review R4)
51b0177 chore(editor): drop the unused monaco loader; correct a stale e2e comment
d9943bd fix(editor): a project opens only once its scene has settled, so no edit is wiped mid-open
4549b8b test(editor): the running engine is the installed tarball (BuildInfo, C4r1)
f019ee0 fix(editor): only a vanished script file is skipped; other read failures reach the Console (C4r2)
3bacd9b feat(editor): outside edits to a script reload on focus; dirty buffer and overwrite ask (C4 phase 5)
3191f9e test(editor): a saved scripted component survives a full editor reload (C4 DW-2.3)
efdac04 fix(editor): a failed library write heals on the next add, never hides the entry (C4 review)
a310e89 fix(editor): a library add whose target died mid-flight attaches nothing (C4 review)
dc9b099 feat(library): Add component offers ten shipped behaviours (C4 phase 4)
5b973a1 test(editor): close each scenario's browser contexts — the suite's late-run timeouts (T2 cause)
a4c29c2 test(editor): two C4r4 scenarios were wrong, not the code they check
bf29d14 fix(editor): one engine shim resolves every import form, and edits reach their importers (C4r4)
a581a85 fix(editor): a script file that vanished with its project is skipped, not shouted about
59bb0d3 feat(editor): a broken script says so in the Console, and a missing one says Missing script (C4 phase 3)
7ca9c7f Merge remote-tracking branch 'origin/master' into C4-editor-scripts-and-library
795763f feat(editor): a project's scripts compile, link and load — one engine instance (C4 phase 2)
2acf332 build(app): the engine gets TypeRegistry.replace, edit mode and C2 (C4 D4)
eaab306 feat(editor): the Code tab — a script file opens, edits and saves (C4 phase 1)
```

`.claude-shared` — `git log --oneline origin/main..HEAD` (21 commits at report time, incl. two
`origin/main` sync merges `19f668c`/`607fb8e` and earlier ones; task commits listed here),
`git diff --stat origin/main...HEAD` → **11 files changed, 2927 insertions(+), 1 deletion(-)**
(plus this report and the ROADMAP ticks in the report commit):

```
ae78227 docs(C4): R4-G3 re-review PASS + full e2e green 501/501 evidence
8111250 docs(C4): R4 re-review verdict + R4-G3 switch settle fix notes
8632a88 docs(C4): phase-5 review + full-suite green evidence 2026-11-19/20 (475/486 PASS)
be1c283 docs(C4): phase 4 review — two blockers found by probes, fixed forward with failing-first regressions
ee56826 docs(C4): phase 4 done — the library of ten, dedupe both ways, DW-4.2 passed outright
03a2a92 C4: debug gate green 371/371; DW-2.4 refuted — ScenarioCreator already compiles legacy decorators
ba44f5a C4: plan row 2b — the C4r4 fold-in
24ea712 C4: notes on the C4r4 fold-in (F1-F4) and the offline 2026-11-17 run
6404a0c docs(C4): phase 3 done — the scene-service rebuild finding, the diagnostics, and the suite evidence
6b80f10 docs(C4): phase 2 done — the runtime, the import map, three deviations and the bugs they caught
08e12f2 docs(C4): notes for phase 1 — what landed, the four build-time decisions, the checks, the limitation
07adbe4 docs(C4): phase 1 done — execution log, and why the import map moved to phase 2
506c9ce docs(C4): research and plan — the Code tab, the in-browser compile and link, the library of ten
65b928a Claim C4 (W1)
```

## ROADMAP rows

Ticked ✅ 2026-11-21 W1: **C4, C4r1, C4r2, C4r3, C4r4, T2** — each fix verified contained in this
branch (C4r1 `bf29d14`+`4549b8b`, C4r2 `f019ee0`, C4r3 the map removal measured in the notes, C4r4
`bf29d14`, T2 `5b973a1`; before/after quotes in `.workers/logs/C4-merge-report.md`). New ⬜ rows:
**C4r5, C4r6** (above). No other row touched; `origin/main`'s P5c row merged in untouched.

Merge into main?