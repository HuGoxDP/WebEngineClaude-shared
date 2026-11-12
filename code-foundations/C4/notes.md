# C4 — Stage 12: scripts — build notes (W1, in progress)

Task row: `C4` (M4, editor), claimed by W1 as `C4-editor-scripts-and-library`. Plan: `plan.md`
(phases 1–5); research: `research.md` (D1–D6). The repo's own plan of record is
`WebEngineTSEditor/docs/unity-editor-plan.md` §3.2 and its Stage 12 box.

**Status:** phase 1 landed on the task branch; phases 2–5 pending. The row stays 🟡 until the card's
done-when are met.

## Phase 1 — the Code tab (`eaab306`)

What landed: `monaco-editor` as an ESM dependency, loaded by the panel only; a `CodeEditorService`
holding the open file, its dirty state and the target a Console row will jump to; a `panels/code`
component; the workspace's `bottomTab` union gaining `'code'` (C1 is not merged, so there is no zone
abstraction to plug into — D1); a double-click on a `script` entry in the Project panel routed by kind,
a scene still opening through the command; i18n keys in both languages.

### Decisions taken while building (beyond the plan's D1–D6)

- **The editor API, not the `monaco-editor` entry.** The full entry pulls the contrib widgets, which
  import the codicon CSS, which imports a `.ttf` — and `@angular/build`'s application builder has no
  loader for it. Importing `esm/vs/editor/editor.api` plus the two Monarch grammars keeps the graph
  CSS- and font-free; the completion widgets arrive with phase 3's diagnostics.
- **Grammars by specifier, with an ambient `.d.ts`.** A relative path 404s at run time because a chunk is
  served from `/editor/`; the grammar modules carry no declarations, so `monaco-grammars.d.ts` declares
  the two import paths (they export nothing the panel reads).
- **The file is opened before the tab switches.** With an `effect` mounting the editor the renderer
  crashed: the panel was created with no file, the effect then saw a file but no host, and it re-ran on
  every change-detection tick. Opening first and mounting once in `ngAfterViewInit` removed the effect
  entirely, and the panel is re-created per file with `@for ... track f.path`.
- **Monaco's textarea is focused, not clicked.** A click on `.monaco-editor textarea` is not stable while
  the editor lays out (Playwright retries, then times out); `focus()` is actionability-free and the typed
  keys reach the model.

### Checks

- `ng build --base-href /editor/` exit 0; initial total 1.86 MB (the warning is pre-existing, the budget
  is 1 MB warn / 3 MB error) and Monaco is a 2.29 MB **lazy** chunk, so the initial bundle grew 10 kB.
- The new e2e scenario: 11 checks green.
- The full suite: 276 checks green, one failure — the known `"one tab per project"` menu-click flake,
  which passes in isolation and passed in the R1r runs of the same suite. `app/src` is untouched by that
  scenario, and nothing in this phase changes the menus.

### Known limitation of phase 1

- The import map (`DW-1.3`) is not here: it must point `"WebEngineTS"` at a bundle the app also imports
  (one engine instance, so `TypeRegistry` is shared — C3's answer to a reload), and that needs the engine
  tarball bump, which is phase 2's first step. The Code tab therefore does not yet *run* a script.
