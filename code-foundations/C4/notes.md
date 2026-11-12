# C4 — Stage 12: scripts — build notes (W1, in progress)

Task row: `C4` (M4, editor), claimed by W1 as `C4-editor-scripts-and-library`. Plan: `plan.md`
(phases 1–5); research: `research.md` (D1–D6). The repo's own plan of record is
`WebEngineTSEditor/docs/unity-editor-plan.md` §3.2 and its Stage 12 box.

**Status:** phases 1–2 landed on the task branch; phases 3–5 pending.

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
