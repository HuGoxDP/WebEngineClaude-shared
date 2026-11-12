# Plan: C4 — Stage 12: scripts (Code tab, in-browser compile and link, the behaviour library)
**Created:** 2026-11-12 (W1, from `research.md` beside it)
**Status:** ready
**Complexity:** complex (the largest card in the milestone: ~3.5 w)
**Gate:** Full for every phase that touches the runtime; Minimal for docs
**Repos:** `WebEngineTSEditor` (this task), `.claude-shared` (the row, notes)

## Context
A teacher authors a scenario in the editor and wants behaviour: add `Rotator` from a library, change its
speed in the inspector, open its code, edit, save — and the object rotates the new way on the platform. A
script with an error must break nothing in the scene and lose none of its data. Today the editor has no Code
tab, no script loading of any kind, and every scripted component in an existing project already reads as the
generic "Component" because nothing registers those classes. Research: `research.md` (D1–D6 binding).

**Constraints**
- The engine's runtime rules are the ones the platform runs: relative specifiers become Blob URLs; the bare
  `"WebEngineTS"` stays for the import map; one engine instance shared with the app (C3's
  `TypeRegistry.replace` is the engine's answer to a reload).
- The platform CSP allows `blob:` in `script-src` and `worker-src` and has **no `'unsafe-eval'`** — a
  build that needs `eval` is a defect, not a workaround.
- The editor's own bundle budget: 1 MB warn / 3 MB error (`angular.json`). Monaco must be lazy.
- The engine tarball in `app/` is stale (`0.1.0-local.1794336134`, no `TypeRegistry.replace`); bumping it is
  D4's first step and is gated on the whole suite.

---

### Phase 1: The Code tab — open a script, edit it, save it (Standard)
**File scope:** `app/package.json`, `app/package-lock.json`, `app/src/index.html`, `app/angular.json`,
`app/src/app/shell/workspace.component.ts`, `app/src/app/services/code-editor.service.ts` (new),
`app/src/app/panels/code/` (new), `app/src/app/services/menu-model.service.ts` (Window menu row),
`app/src/app/i18n/en.ts`, `uk.ts`, `app/src/app/services/commands.service.ts` (the `openProjectEntry` hook)
**Depends on:** none

**Goal:** a `.ts` (or `.js`) file in the project opens in a Code tab, can be edited, and saves back through
`ProjectService.write` — with a dirty mark, and no engine change.

**Scope:**
- IN: `monaco-editor` as an ESM dependency, dynamically imported by the panel only; the panel registers in
  `workspace.component.ts`'s tab union + strip + `@if` + `imports` (D1); a `<script type="importmap">` in
  `src/index.html` with `"WebEngineTS"` → a new shim module that re-exports the app's engine instance
  (`app/src/app/engine-shim.ts`), so a script and the app share one registry; `commands.service.ts`'s
  early return (`if (entry.kind !== 'scene') return;`) becomes a branch that opens a script; Ctrl+S saves
  through the project store; the unsaved mark belongs to the script file (a new `dirtyScripts()` signal, not
  the scene's).
- OUT: compilation, module loading, the library (later phases).

**Done when:**
- DW-1.1: `ng build` exit 0 under the budget, and Monaco is not in the initial chunk (the chunk name is in
  the build output).
- DW-1.2: e2e — open a project, double-click `scripts/components/Foo.ts` in the Project panel, the Code tab
  opens with the file's text, type, Ctrl+S, `readDisk` shows the new text; the unsaved mark appears and
  clears; the scene is not marked unsaved by a script edit.
- DW-1.3: the import map is served and a page module can `import "WebEngineTS"` at run time (a temporary
  probe module loaded from `blob:` in the e2e proves the map, not the bundler, resolves it).

### Phase 2: Compile, link and load — a component script becomes a real component (Full)
**File scope:** `app/src/app/services/script-runtime.service.ts` (new), `app/src/app/services/code-editor.service.ts`,
`app/src/app/shell/workspace.component.ts`, `app/src/app/i18n/*`, `app/WebEngineTS-0.1.0.tgz`,
`app/package-lock.json` (the engine bump, D4)
**Depends on:** Phase 1

**Goal:** compiling and loading the project's scripts registers their classes, so a scene that names them
deserialises into real components instead of `MissingComponent`.

**Scope:**
- IN: the engine bump first — pack the engine from this task's engine worktree with a stamped version and
  install the tarball into *this* worktree (never the primary), then the full e2e suite as its gate (D4).
  Then `script-runtime.service.ts`: enumerate the project's `scripts/**/*.{ts,js}`, strip `.d.ts`;
  compile each `.ts` with Monaco's worker (`getJavaScriptWorker().getEmitOutput`-shaped API, decorators
  enabled and `experimentalDecorators` set, because engine scripts use legacy decorators); rewrite relative
  specifiers to Blob URLs exactly as the engine does — dependency graph over relative imports, topological
  order, `.js` appended when absent, the bare `"WebEngineTS"` left alone (D3); `import()` each blob; collect
  the exported classes; `TypeRegistry.register` the ones missing and `TypeRegistry.replace` the ones the
  class swap needs; then rebuild the open scene (`SceneSerializer.serializeScene` → clear → deserialize) so
  the new classes attach. Trigger: on project open, and on save.
- OUT: error reporting polish (Phase 3), the library (Phase 4).

**Done when:**
- DW-2.1: e2e — a project with `scripts/components/Rotator.ts` (a `@Serializable` `ScriptableBehaviour`)
  opens, and the inspector shows the component with its fields (not "Component"); the object does what the
  script says in play.
- DW-2.2: e2e — edit the script's speed field's default, save, and the inspector's new object shows the new
  default (the class was replaced, not duplicated: `TypeRegistry` still has one entry for the name).
- DW-2.3: e2e — a scene saved with the class name loads into the same component after a reload of the editor
  (the blob URLs are re-made each load; nothing is cached across sessions).
- DW-2.4: `tsc` in ScenarioCreator still builds a project whose scripts use decorators — if it does not, the
  finding is parked as an ATTENTION row and the library sources are generated accordingly.

### Phase 3: Errors in the Console with jump-to-line, and "Missing script" (Standard)
**File scope:** `app/src/app/services/console.service.ts`, `app/src/app/panels/code/`,
`app/src/app/panels/console/console.component.ts`, `app/src/app/panels/inspector/component-section.component.ts`,
`app/src/app/services/script-runtime.service.ts`, `app/src/app/i18n/*`
**Depends on:** Phase 2

**Goal:** a broken script never breaks the scene, is visible, and points at its line; a component whose class
is missing says so.

**Scope:**
- IN: a public `push(entry)` on `ConsoleService` (its `_push` is private); TypeScript diagnostics from the
  worker reach it with `file:line`; the Console row's `source` becomes a click that opens the file in the Code
  tab at that line; `MissingComponent` is surfaced in the inspector — title from `.originalType`, a
  "Missing script" label, its `originalFields` shown read-only, and the data preserved on save (the engine
  already writes it back unchanged); a script that fails to compile keeps its old class loaded (the scene
  does not lose the component), and Play is told the project has errors.
- OUT: the library.

**Done when:**
- DW-3.1: e2e — a script with a syntax error: the Console names the line, the scene still opens, the object
  still has its component and its saved fields, `readDisk(scene)` is byte-identical.
- DW-3.2: e2e — a scene naming a class no script provides shows "Missing script <Name>" with the saved
  fields read-only, and saving keeps them.
- DW-3.3: e2e — clicking the Console row opens the file at the line.

### Phase 4: The library of ten behaviours (Standard)
**File scope:** `app/src/app/services/library.service.ts` (new), `app/src/app/library/*.ts` (ten sources),
`app/src/app/panels/inspector/` (add-from-library), `app/src/app/services/project.service.ts` (mkdir
`scripts/library`), `app/src/app/i18n/*`
**Depends on:** Phase 2

**Goal:** "Add component → Library" offers the ten behaviours; adding one copies its source into the project
and attaches it (D5).

**Scope:**
- IN: ten behaviours as TypeScript source constants (Rotator, Mover, Clickable, Toggle visibility, Show text
  on click, Quiz question, Timer, Follow path, Look at camera, Play animation — the card's list, confirmed in
  the report); each `@Serializable`, each with inspector-editable `@SerializedField`s; adding one writes
  `scripts/library/<Name>.ts`, recompiles and reloads the script runtime, and attaches it to the selection;
  the Add Component dialog gains a Library section listing what is already in the project.
- OUT: C5 (Play) — a library behaviour plays on the platform, which is C5's smoke test.

**Done when:**
- DW-4.1: e2e — add Rotator from the Library, the source lands in `scripts/library/Rotator.ts`, the
  component appears with `speed` editable, the object rotates in play.
- DW-4.2: the resulting project builds in ScenarioCreator (`npm run e2e:build`) — or the gap is recorded as an
  ATTENTION row with the failing command's output.
- DW-4.3: adding a second behaviour and a third keeps adding (no double registration, no ordering surprise).

### Phase 5: Adversarial review and the docs (Full → Minimal)
**File scope:** any file of Phases 1–4 (fixes only, each with a regression test),
`docs/unity-editor-plan.md` §3.2 status, `docs/test-plan`/`README.md`, `.claude-shared/ROADMAP.md`,
`.claude-shared/code-foundations/C4/notes.md`
**Depends on:** Phase 4

**Scope:** an independent reviewer tries to break it: a script that throws at import time; two scripts with
  the same class name; a script importing a sibling that does not exist; a script saving while the runtime
  loads; outside edits on window focus; the project deleted under an open script; the library behaviour
  edited after it was added. Then the docs: the repo's plan's Stage 12 box gets its status line, the test
  plan records the new scenarios, and the ROADMAP row turns ✅ with what landed.

**Done when:**
- DW-5.1: every finding is fixed with a regression test or recorded with why it is not a defect.
- DW-5.2: the full e2e suite is green with the recorded count in the notes; `ng build` exit 0.
- DW-5.3: the repo's own Stage 12 box and the test plan are updated; the ROADMAP row is ✅ with the
  library list this task ships.

## Execution Log

| Phase | Result | Notes |
|---|---|---|
| 1 | done (`eaab306`, `WebEngineTSEditor/C4-editor-scripts-and-library`) | Monaco in a lazy chunk (initial bundle +10 kB, inside the existing budget warning); the editor API rather than the `monaco-editor` entry, because the full entry pulls the codicon CSS and its `.ttf`, which this build has no loader for; the two Monarch grammars imported by specifier (a relative path 404s, chunks are served from `/editor/`); the file is opened before the tab switches, so the panel mounts once in `ngAfterViewInit`; the workspace routes a double-click by kind and the scene's dirty guard never applies to a script. e2e: 11 checks in a new scenario, the full suite green apart from the known "one tab per project" menu-click flake (passes in isolation, passes in the R1r runs). DW-1.3 (the import map) moved to Phase 2: the map must point `"WebEngineTS"` at a bundle the app also imports, which needs the D4 tarball bump. |

## Ordering note
Phases are strictly serial: each builds the surface the next one drives (a tab, then a module pipeline, then
diagnostics, then content). Phase 1 is the only one that lands nothing a user would call a script feature —
it is deliberately first because {Monaco, the import map, the tab, the save path} are what every later phase
reuses, and because the stale-tarball bump is not needed until Phase 2.
