# C4 — Stage 12: scripts — build notes (W1, done 2026-11-21)

Task row: `C4` (M4, editor), claimed by W1 as `C4-editor-scripts-and-library`. Plan: `plan.md`
(phases 1–5); research: `research.md` (D1–D6). The repo's own plan of record is
`WebEngineTSEditor/docs/unity-editor-plan.md` §3.2 and its Stage 12 box.

**Status:** done — all five phases + the review fix chain (R4, R4-G3) landed on the task branch; final verification PASS @ `2a4fa96` (2026-11-21), full e2e 501/501 over 45 scenarios. See the Report section at the end and `report.md`.

## Phase 1 — the Code tab (`eaab306`)

Monaco in a lazy chunk, `CodeEditorService` (the open file, its own dirty state, the jump target a Console
row will use), `panels/code`, the workspace's `bottomTab` union gaining `'code'` (C1 is unmerged, so there
is no zone abstraction — D1), a double-click routed by kind, i18n in both languages.

### Decisions taken while building (beyond D1–D6)

- The editor API, not the `monaco-editor` entry — the full entry pulls the codicon CSS and its `.ttf`, and
  this build has no loader for it.
- Grammars by specifier with an ambient `.d.ts` — a relative path 404s at run time.
- The file is opened *before* the tab switches, so the panel mounts once in `ngAfterViewInit`: an
  effect-driven mount crashed the renderer.
- Monaco's textarea is `.focus()`ed, not clicked — a click is never "stable" while the editor lays out.
- DW-1.3 (the import map) moved to Phase 2: it must point at a bundle the app *also* imports, which needs
  the D4 engine bump.

### Checks

`ng build` exit 0 with Monaco in a lazy chunk (initial +10 kB). New e2e scenario: 11 checks green.

## Phase 2 — the script runtime (`2acf332`, `795763f`)

### What landed

1. **The engine bump** (`2acf332`): the app ran on `0.1.0-local.1794336134`, from before C2 and C3. Packed
   from this task's engine worktree with a stamped version and installed into *this worktree only* — the
   primary checkouts are untouched (`release:local` installs into them). Gate: the whole e2e suite,
   **285 checks green, no failures** — the same net A8 used for the last engine upgrade.
2. **The runtime** (`795763f`): `ScriptRuntimeService` — enumerate `scripts/**/*.{ts,js}`; transpile each
   `.ts`; rewrite relative specifiers to Blob URLs in dependency order; `import()`; register or swap each
   exported class; then rebuild the scene. A save re-runs the pass.
3. **The import map** — `"WebEngineTS"` *and* `"three"` resolve to one URL, shared by the app bundle, the
   engine and a scenario script's module. The engine is `WebEngineTS.esm.js` plus the 316 KB of three
   addons it and the editor import; both are `externalDependencies`. Initial bundle: **1.87 MB → 480 kB**,
   and the budget warning is gone.

### The three deviations, and why

| Plan said | What happened | Why |
|---|---|---|
| compile with **Monaco's worker** (D3) | `@babel/standalone` | Monaco's ESM build locates its worker through an AMD `require.toUrl` shim a bundler cannot satisfy: `getTypeScriptWorker` rejects with "TypeScript not registered!" no matter how the language is woken (a model, `setModelLanguage`, or `setupTypeScript` directly — the last of which does register the worker, and then fails in the worker's own bootstrap). `typescript` is the other obvious choice and is unbundleable: it reaches Node's `path`. Babel is a dependency, so esbuild bundles it into a chunk nothing loads until a project's scripts are compiled, needs no worker, no wasm, no `eval`. |
| DW-1.3 in Phase 1 | Phase 2 | The map has to point at a bundle the app also imports (one engine instance, one `TypeRegistry`) — which is the D4 bump. |
| DW-2.3 (reload re-opens) in Phase 2 | Phase 5 | It needs a full page reload; it belongs with the adversarial review, not the first runtime pass. |

### Bugs the tests caught (in my own implementation, before the phase passed)

- **`_settle` loaded the scene before the scripts.** A saved scene names components by type name, so the
  classes must be registered first; the scene is now loaded after the runtime.
- **`getJavaScriptWorker` rejected** ("JavaScript not registered!"): it needs the `javascript` language
  registered, which only happens when a JS model is created — and this app creates only TypeScript ones.
- **Babel's plugin names** in standalone carry no `@babel/plugin-` prefix, and the package is CJS so the API
  lands on `default`.
- **`ScriptTarget.ES2022` does not exist** in Monaco's enum — an undefined target silently falls back to the
  ES3/CommonJS defaults, which emits `async` as a generator (hence "Unexpected token 'async'").
- **The e2e typed a multi-line source into Monaco**, and auto-closing brackets rewrote it (a paste works);
  and `canvas` matched Monaco's own canvases once the Code tab was open.
- **The runtime's `_register` ran *after* the module's decorator had already refused**, which is why the
  engine's advisory ("call `TypeRegistry.replace`") appears in the console on every reload swap. The test
  asserts that advisory as the only console entry: refusing and then replacing is what a reload swap is.

### Checks

- The new scenario: 10 checks green (project opens with the component attached and its saved field; the
  script opens in the Code tab; a paste-and-save rewrites the file; the workspace survives the swap; a fresh
  object gets the script's new default; the console holds only the swap advisory).
- The full suite: **271 of 277 in one run, 260 in another, 226 in a third**, with the failing scenarios
  passing one at a time every time and the failure signatures changing between runs (30 s timeouts on page
  load and on `.work`, "Unexpected end of JSON input", a `page.goto` timeout). That is the machine, not the
  code: three workers plus my own repeated browser runs. The same suite was **285 green** when the machine
  was free (the engine-bump gate, earlier in this run). Re-run on a quiet machine before calling it red;
  the phase-2 code has not changed between the 271 and the 226 runs, and the minified-three change that
  came out of that investigation reduced the asset weight by 1.3 MB.

### Known limitation of phase 2

- The engine's advisory on reload is a `console.error`, so a project with a script reload shows one red
  console line every save. It is the engine telling the host what it did; making `register` quieter is an
  engine change, not this repo's.
- 3.4 MB of vendored engine/three files in `src/assets/engine/`. The alternative (the self-contained
  standalone bundle) brings back two copies of three, which is a warning today and an `instanceof` trap
  tomorrow.

## Phase 3 — diagnostics, jump-to-line, and "Missing script" (`59bb0d3`)

### The bug the tests caught (and it was mine)

My first rebuild *replaced the world by hand* — serialize the live scene, destroy every root,
deserialize — and the panels were never told: the hierarchy kept rendering the destroyed objects, and a
click on such a row selected one whose components were already gone, so the Inspector showed a bare
Transform. `SceneService.loadFromJSON` is the editor's own "replace the world" operation (clear +
deserialize + `_refresh`), and using it fixed the whole class of bug. The lesson: a runtime that rebuilds
the world must go through the editor's own mutation API, not around it.

### The other findings, and how each was closed

- `console.error` cannot report a *script* diagnostic: the source it derives is a call-stack frame, which
  for a transpile error points at this service. `ConsoleService.push(entry)` takes the file and line with
  the message, and the row's `source` becomes a button.
- The Code tab has to be *shown* by a click in the Console panel, which cannot reach the workspace. A
  `showRequest` signal on `CodeEditorService` plus an effect in the workspace does it — the effect is
  signal-driven (no DOM), which is the rule C4's Phase 1 established after an effect-driven mount crashed
  the renderer.
- Babel's `loc` is on the thrown error; the message carries the same location as
  `…/file.ts: Unexpected token (3:6)`, so the row shows the human-readable one.
- A module that fails to transpile is left out of the link entirely — the class the project already loaded
  stays registered, which is the whole of DW-3.1's "a broken script never breaks the scene".
- `MissingComponent` was invisible: the inspector's filter (`TypeRegistry.getTypeName(c) !== null`) dropped
  it precisely because it is the placeholder for a name the registry has *no* entry for. It now carries
  `.originalType` as its title, a "Missing script" tag, and its `.originalFields` as read-only rows.

### Checks

The two scenarios are 12 checks green: the Console names the file and the line; the row is clickable and
opens the file at that line; the component survives the broken save with its saved value and the scene file
is untouched; the placeholder is titled, marked, shown read-only and saves back unchanged.

The full suite: **319 of 327**, with the 8 failures in five scenarios that pass in isolation every time and
whose signatures change between runs (30 s timeouts on `.work` and on a hierarchy row, "Unexpected end of
JSON input", a `page.goto` connection refusal when the static server died between runs). This machine runs
three workers, Docker and my own browser runs; the same suite was 285 green earlier in this task's life on
a quieter machine. Per the Debug rule the merge waits for one fully green run, so Phase 3 stays on the task
branch.

## The boot regression Debug found, and the fix

The suites above were blamed on the machine. They were not: the import map that landed with phase 2
(DW-1.3) served the engine as an **external** module, and page boot went from ~0.85 s to ~3.0 s
(measured: 859–932 ms with the engine bundled, ~3000 ms with the map). Thirty seconds is the harness's
whole timeout, and a page that takes three of them to boot makes every scenario a coin toss. The evidence
that it was mine and not the load: the same suite was **285 green on this machine** in the engine-bump
gate, before the map existed, and the failing scenarios still pass one at a time.

The map existed for one reason — a script and the app must share **one** engine instance, so the classes a
script registers are the ones the app's `TypeRegistry` resolves. That survives without it:

- `index.html` has no import map again; `angular.json` has no `externalDependencies` again (the engine is
  bundled, initial 1.98 MB, inside the existing budget warning).
- `ScriptRuntimeService`'s constructor publishes the app's own engine namespace on
  `globalThis.__wetsEngine`.
- `rewriteEngineImports` turns a script's `import|export … from 'WebEngineTS'` into
  `const { … } = globalThis.__wetsEngine` (star-as → `const ns = globalThis.__wetsEngine`, `export` →
  the destructure plus an `export { … }`). The specifier the engine hands a blob URL for is therefore the
  one module instance, exactly as the map made it — one `TypeRegistry`, one `three`.

Three things came out of the same pass:

- **The last import binding was dropped.** The clause capture `([\s\S]*?\s+from\s+|)` swallowed the
  trailing ` from ` (the printed match showed `clause = "{ ScriptableBehaviour, Serializable } from "`),
  so the second name parsed as empty and vanished. The pattern is now
  `/(import|export)\s+([\s\S]*?)(?:\s+from\s+)?(["'])(WebEngineTS)\3/g` and the clause is split after
  stripping its braces. A compile of a real script found it: the class never reached the registry and the
  component showed as `MissingComponent`.
- **Unchanged modules are not re-imported.** `_loaded` keeps each file's compiled code; when nothing
  registered or replaced a class, the world is not rebuilt at all (`SceneService.loadFromJSON` only on
  `changed`), so a save with a comment edit costs a transpile and no reload.
- **The 3.4 MB of vendored engine/three files in `src/assets/engine/` are dead.** Nothing referenced
  them once the bundle carries three again, and `angular.json` copied them into every build. Both the
  directory (21 files) and the `assets` entry are gone; the record of why they were there stays in phase
  2's notes above.

`@babel/standalone` (3 MB, the largest lazy chunk) is now preloaded from `AppComponent`'s constructor
while the start screen is up, so the first project open does not wait on it.

Local-only note for the next run: the static server on 8043 serves the build under `/editor/`, so that
build is `ng build --base-href /editor/`. The default `ng build` (`<base href="/">`) boots a blank page
there — three 404s and an empty `<body>`.

### Checks

The three C4 scenarios are green (10 + 7 + 5 checks) and boot measures 846–870 ms on the final build.
The last full-suite run on it was 341 checks with exactly one failure — the recovery scenario, which
passes 16/16 in isolation, the same load-flake signature the earlier runs showed.

## C4r4 folded in (2026-11-17, offline run)

Claude's review of the bundled-engine rewrite (review-claude-2026-11-14.md, row C4r4) is folded in:
`script-runtime.service.ts` builds **one engine shim per page load** — a Blob module whose source is
`const e = globalThis.__wetsEngine; export const { …every named key… } = e; export default e.default;` —
and the bare `"WebEngineTS"` specifier is rewritten to that URL with the engine's own token regex
(`Scenario._ENGINE_IMPORT_RE`, copied verbatim). Every form then binds by construction: sibling-first,
comment-first, default, default+named, namespace, `export * from`, `export { X } from`, dynamic
`import()`. The previous clause-level destructure emitted `from undefined` for any statement before the
engine import (F1) and served only one form (F2).

F3: `fresh` is closed under **importers** (reverse-dependency closure over `deps`), so editing `Base.ts`
re-imports `Enemy.ts` against the new Base class. F4: a module whose code **and** dependency closure are
unchanged keeps its Blob URL (`_loaded` now holds `{code, url}`), so an untouched base is never evaluated
twice; URLs are revoked when a module is replaced or leaves the project.

Two e2e scenarios prove it: every import form with one marker per form, and Base/Enemy edit
propagation through the probe's `scriptClass(name)` tokens (`debug-probe.ts`: a token per class object,
`parent` = the script class it extends) — the importer's parent token moves with a base edit and stays
with an importer-only edit. Regression discipline: the import-form rewrite was pre-verified in Node
(16/16 checks over the copied functions); the browser failing-first/passing pair was NOT completed —
2026-11-17 had no network on this machine (every adapter "Media disconnected"), Google-Fonts DNS
timeouts added ~14 s to every page boot, and `ng build` output goes to `app/dist/browser`, discovered
late. Local state at run end: editor at bf29d14 on `C4-editor-scripts-and-library`, `tsc --noEmit`
clean, nothing pushed, merge not attempted.

## 2026-11-18 — debug gate green; DW-2.4 refuted; phase 4 in build

### The debug gate: first fully green full suite — 371 PASS / 0 FAIL

Run history: #1 305/14, #2 317/3, #3 ~311/7 (all late-suite locator timeouts), #4 **371/371** after the two
fixes below. Evidence: `evidence/e2e-full-green-2026-11-18.log`.

- **Fix 1 (`a4c29c2`, editor) — two C4r4 scenarios were wrong, not the code they check.** (a) The
  import-forms fixture `Forms.ts` used `@Serializable`/`@SerializedField` without importing them: the module
  threw `ReferenceError: Serializable is not defined` at evaluation, Forms never registered, the inspector
  showed Missing script, all 7 markers empty. With `Serializable, SerializedField` added to the WebEngineTS
  import, all seven import forms bind (browser-verified: markers `"true,true,true,true,true,true,true"`).
  The shim rewrite was already correct. (b) `editScript()` clicked the Project panel folder tree twice per
  scenario, but the first edit leaves the bottom pane on the Code tab and app-project only mounts while its
  own tab is active; it now clicks the Project tab first.
- **Fix 2 (`5b973a1`, editor) — close each scenario's browser contexts; the T2 root cause.** `newPage()`
  opened a fresh browser context per scenario and nothing closed it: ~30 live editors (WebGL renderer, rAF
  loop, workers) accumulated in one browser process. Measured over 14 project opens: "Open folder" to
  visible `.work` grew **192 ms → 20463 ms** with contexts held; with each context closed after its scenario
  the same 14 opens stayed **250–890 ms**. The runner now closes every `browser.contexts()` after each
  scenario (failure screenshot first) and resets `lastPage`. No timeout raised, no retry added, no check
  weakened. This is ROADMAP row T2's late-suite flakiness cause — every previously failing scenario had
  passed in isolation.

Environment that worked: build `MSYS_NO_PATHCONV=1 npm run build -- --base-href /editor/` (Git Bash
otherwise rewrites `/editor/` into a Windows path and the page blanks); `app/dist/browser` served by an
ad-hoc static server on `http://localhost:8044/editor/`; suite run with
`E2E_PLAYWRIGHT_DIR=/e/Projects/WebstormProjects/WebEngine/.workers/W1/virtual-lab/e2e E2E_BROWSER_CHANNEL=chromium LANG=C.UTF-8`.

### DW-2.4 refuted — ScenarioCreator already compiles legacy decorators

The research note (Worker+CSP/D5 paragraph) and `unity-editor-plan.md`'s Stage 12 box claimed
`build-package.mjs` runs `tsc` without `--experimentalDecorators`. Stale: `build-package.mjs:196` passes
`--experimentalDecorators` (with `--ignoreConfig`), fix commit `229480d` ("fix: compile scenario scripts
with legacy decorators"), present in both the W1 worktree and the primary checkout. **No ScenarioCreator
change needed; C4 stays editor-only.**

Build proof: `node build-package.mjs --scenario DecoratorScenario` in `.workers/W1/ScenarioCreator` exit 0,
no tsc errors; ZIP `ReleaseScenarios/test/DecoratorScenario.zip` (gitignored) contains `scripts/Scenario.js`
with legacy emit `__decorate([ SerializedField() …` and
`__decorate([ Serializable({ typeName: "DecoratorFixture.Spinner" }) …`. The fixture uses `@Serializable`,
`@SerializedField`, `@Range`. `git status` clean before and after.

Engine decorators are legacy: `WebEngineTS/tsconfig.json:16` `experimentalDecorators: true`;
`Decorators.ts:50-51` class decorator `(target: T): T`, `:219-220` field decorator `(target, propertyKey)`.
No `emitDecoratorMetadata` needed. Consuming projects need `experimentalDecorators: true` — ScenarioCreator's
CLI already supplies it.

Caveat: ScenarioCreator's installed `node_modules/WebEngineTS` is an older local pack
(`0.1.0-local.1793745537109`, ~2026-11-11) while the editor's is `0.1.0-local.1794476123298` (~2026-11-12);
its `package.json` pins the v0.2.0 release URL, so `npm ci` there would swap the engine. Not a blocker for
the DW-4.2 build check, but the check compiles against whatever is installed.

### Phase 4 dispatched (in build) — the library of ten

Binding decisions at dispatch: ten sources copied into the project as `scripts/library/<Name>.ts` (D5);
names Rotator, Mover, Clickable, ToggleVisibility, ShowTextOnClick, QuizQuestion, Timer, FollowPath,
LookAtCamera, PlayAnimation; async add path in `CommandsService` (write → reloadScripts → re-find target
after `_rebuildScene` clears selection → attach → re-select); Library section in the Add Component dialog,
entries already in the project not offered twice; the written `.ts` is permanent (scene-only undo).
Clickable via `Input.getMouseButtonDown(0)` + `Camera.main.screenPointToRay` + `Physics.raycast` (no
`OnMouseDown` exists; needs a Collider); FollowPath via `FieldType.Array` of Vector3 waypoints +
`Vector3.moveTowards` (no spline type); PlayAnimation tolerant of a missing Animation/Animator sibling.
All ten feasible with the installed engine's public API; no engine change, no new dependency.

## 2026-11-19 — phase 4 done (`dc9b099`)

The library of ten landed: `app/src/app/library/*.ts` (ten source constants, public overrides, explicit
FieldTypes, engine public API only), `library.service.ts` (catalog; installed = file on disk OR class
already provided by project scripts), `addLibrary` in `CommandsService` (write → `reloadScripts` →
re-find by name after the rebuild → `_history.record` attach → re-select; the file is permanent, undo
scene-only), the Library section in Add Component, and an Array-of-Vector3 waypoint editor in
`component-section.component.ts` for FollowPath.

Two findings beyond the plan:
- The component registry is not signal-backed, so `LibraryService.offered` reads
  `ScriptRuntimeService.classNames` to keep the picker reactive after a reload.
- Dedupe needed the reverse rule too: a class the project's own scripts provide (at any path) must never
  be offered by Library, else it shadows the author's script — caught by the phase-2 regression scenario.

Checks: `ng build --base-href /editor/` exit 0 (initial 1.99 MB, inside budget); `ONLY="library:"` 34 PASS
(source copied, speed editable, rotates in play, stop restores pose, second behaviour attaches, no
duplicate-registration advisory); wizard scenario PASS (exports Rotator on Camera, feeds DW-4.2);
`npm run e2e:build` PASS — DW-4.2 passed outright, no ATTENTION row; all ten extracted sources compile
under ScenarioCreator flags (`--strict --experimentalDecorators`, bundler resolution) exit 0; C4 script
regressions (phase-2 swap, broken script, missing script, import forms, base module, script file) green.

### Phase 4 batch review — FAIL, two blockers fixed forward (2026-11-19)

The independent review ran every DW item green (library 24/24, script regressions, wizard 23/23,
e2e:build 6/6, strict tsc on all ten sources) but demonstrated two edge-case defects with probes:

1. **Deleted-mid-add ghost attach** (`a310e89`): with the write in flight, deleting the target object
   left `findGameObject(name) ?? target` falling back to the destroyed original — component on a dead
   object, phantom undo entry, destroyed object re-selected. Fix: re-find after the rebuild, abort
   cleanly when gone (no attach, no history, no selection). Regression: the C4r5 scenario delays the
   write 1500 ms, deletes mid-flight, asserts no ghost and that the first Ctrl+Z restores the object.
2. **Zero-byte leftover hides the entry forever** (`efdac04`): `write` creates the entry before
   `createWritable`, so a quota throw left a 0-byte `scripts/library/<Name>.ts`; after reopen
   `isInstalled` (file exists) hid it from Library while Scripts had no class to offer. Fix:
   `isInstalled` = file exists AND the class is registered (stale file stays offered, next add heals
   it); the catch path removes only a partial file this add itself created, never an author's file.
   Three regression scenarios: stale-empty heal + author file never overwritten; failed-write partial
   removed + retry heals; failed write never deletes an existing file.

Failing-first proven on the pre-fix build (7 checks failed), passing after (19/19 C4r5 checks).
Gate filters green: library (6 scenarios), script (4), import (3), base module (1); ng build exit 0.
Non-blocking review notes: the 1 MB initial-budget warning is pre-existing (1.99 MB, under the 3 MB
error budget); same-label adds within 500 ms coalesce into one undo step (history service, low impact);
`findGameObject` returns the first name match — duplicate-named objects could re-find the wrong one
(trace-supported, unexecuted; candidate follow-up row).

### R4-G3 switch settle fix (2026-11-21)

R4 re-review (`review-phase5-r4-recheck.md`) FAIL item 2 confirmed by trace and fixed forward:
on a project SWITCH, status never left 'open' during `_enter`/browser-create, so the workspace,
menus and shortcuts stayed live through the new project's `reloadScripts` gap — an Alt+Shift+N
there created an object `_resetScene` then wiped, and Open Project stayed clickable mid-settle.
d9943bd's deferred-status mechanism protected only the start-screen path.

Fix (editor, `fix(editor): … (C4 review R4-G3)`):
- `commands.service.ts` `_enter` + createProject browser branch: `status.set('closed')` before
  the switch begins — same guard as the start-screen path; `screen()` → 'start', workspace
  unmounts, shortcuts detach; `_settle` still sets 'open' only at the end.
- `code-editor.service.ts` `reloadScripts`: `_stamps.clear()` before the re-seed — the previous
  project's same-named paths must not read as outside edits after a switch (verdict Notes item).
- `code-editor.service.ts` `save`: stands down while `_checking` — closes the verdict's
  spurious-ask note (a focus check in flight could read the save's own write before the stamp).

Pins (run.mjs, no runs — lead-managed build window; failing-first by construction on 2400f86):
- new scenario "a project switch settles before the workspace accepts edits (C4 review R4-G3)":
  open A (with an extra script B lacks), arm `holdScriptRead`, File → Open Project to B; during
  the held read: `.work` count 0, menubar gone, Alt+Shift+N inert; after release: B's scene,
  Saved, no phantom GameObject; a focus event then adds no third reload (stamps cleared);
  post-settle Alt+Shift+N creates and the object stays. On 2400f86 the workspace stays mounted
  through the gap, so the `.work`/menubar checks fail and the keypress leaves a wiped-then-absent
  GameObject trail — red by construction.
- double-save scenario extended (G2): a focus event inside the same held write→stamp window must
  not raise the outside-change ask (pins the `_saving` guard on `checkOutsideEdits`).

Deferred follow-up ⬜ candidates (trace-grounded, not fixed here):
- G1: single-flight `reload()` (shared promise + trailing `_rerun` pass) still has no direct pin —
  needs a scenario driving two concurrent reload callers (library add during a save's reload).
- `code.file()` buffer survives a switch: the Code tab can still show the previous project's file
  after switching (panel unmounts, signal does not clear). Same family, low severity; a
  `file.set(null)` on switch/close would close it.

## Report (2026-11-21)

Full report: `report.md` (this folder). Final tip `2a4fa96`, verification PASS
(`.workers/logs/C4-verify-2a4fa96.md`): full e2e **501 PASS / 0 FAIL / 0 skip, 45 scenarios**,
`E2E_EXIT=0` (16:55→17:02Z); `ng build` exit 0; new pins green — switch-settle :2555 14/14,
double-save :1437 12/12 incl. the :1484 G2 focus-mid-save check. Full-suite green history:
371 (11-18) → 475 (11-19) → 486 (11-20) → 501 (11-21), logs in `evidence/`.

ROADMAP ticks on this branch: **C4, C4r1, C4r2, C4r3, C4r4, T2** — every fix verified contained in
the branch (C4r1: vendored engine + import map removed, `4549b8b` BuildInfo pin; C4r2: `f019ee0` +
the two read-failure scenarios; C4r3: measured boot 859–932 ms bundled vs ~3000 ms mapped, map
removed, final boot 846–870 ms — the row's 10-boot median protocol was superseded by removing the
cause; C4r4: `bf29d14` + `a4c29c2`; T2: `5b973a1`, leaked browser contexts, 192→20463 ms vs
250–890 ms over 14 opens). New ⬜ follow-ups: **C4r5** (direct pin for the single-flight reload,
deferred candidate G1 above) and **C4r6** (`code.file()` staleness after a switch, deferred
candidate above). Review notes N1–N4 stay non-blocking in `review-phase5-r4-g3-recheck.md`.
