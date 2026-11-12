# Research: C4 — Stage 12: scripts (the editor's Code tab and the behaviour library)

**Task row:** `C4` in `.claude-shared/ROADMAP.md` (M4, editor, ~3.5 w), claimed by W1 as
`C4-editor-scripts-and-library`. Card: `tasks/C-milestone-2.md` C4. The repo's own plan of record is
`WebEngineTSEditor/docs/unity-editor-plan.md` §3.2 and its Stage 12 box (`:445–453`).

## What the editor already has (all file:line are on `origin/master`)

| Surface | Where | What it gives C4 |
|---|---|---|
| Workspace | `app/src/app/shell/workspace.component.ts:243` `bottomTab = signal<'project' \| 'console'>`, `.pane-tab` strip at `:193–206`, `@if` branches at `:209–213`, standalone `imports` at `:42–45` | A new tab is four edits in this one file. **C1 (dockable zones) is not merged**, so there is no zone abstraction to plug into — C4 must not assume one. |
| Window menu | `app/src/app/services/menu-model.service.ts:125–135` | every entry `disabled: true`; the "Code" item goes here |
| i18n | `app/src/app/i18n/en.ts` + `uk.ts` (typed against `en`, so a missing key fails the build) | new keys in both |
| Project store | `project.service.ts:295–333` (`readText`/`readFile`/`write`/`modifiedAt`/`remove`/`createFolder`), `initializeLayout :381–391` creates `scripts/` **and `scripts/components/`** | a script is `project.write('scripts/components/Foo.ts', text)` / `readText` — the store exists |
| Script kind | `project.service.ts:6–8` `ProjectEntryKind` includes `'script'`, `kindOf :557` maps `ts/js/mjs`, the Project panel icons it (`panels/project/project.component.ts:190`) and has a double-click (`:87`) | **`commands.service.ts:546` drops it**: `openProjectEntry()` starts with `if (entry.kind !== 'scene') return;` — the exact hook for "open in the Code tab" |
| Template | `project-templates.ts:86–98` `SCENARIO_TEMPLATE` | a scenario template exists; **no component template** (`@Serializable` + `ScriptableBehaviour`) |
| Engine loading | `app/src/index.html` has **no import map**; the engine is bundled by Angular (`package.json:26` `"WebEngineTS": "file:WebEngineTS-0.1.0.tgz"`), so every file imports `'WebEngineTS'` through npm | the repo's plan says the map must point `"WebEngineTS"` at a **shim re-exporting the editor's own engine instance**, so a user script and the app share one `TypeRegistry` (`docs/unity-editor-plan.md:109–111`, `docs/integration-plan.md:244–247`) |
| Console | `app/src/app/services/console.service.ts:70–98` patches console + `window.onerror` + `unhandledrejection`, keeps `source` (a best-effort `file:line`, `:106–115`); the panel prints it (`panels/console/console.component.ts:55`) | the surface exists; `_push` is private and the source cell is not clickable |
| Add component | `component-registry.service.ts:95–100` already lists every `@Serializable` class under a `Scripts` category; `inspector.component.ts:316` attaches it | a compiled user class appears for free once it is registered |
| MissingComponent | engine `src/engine/core/serialization/MissingComponent.ts:28–35` — `originalType: string`, `originalFields: Record<string, unknown>`; created by `SceneSerializer` when `TypeRegistry.get(type)` is null (`:2749–2762`), written back unchanged, name preserved (`:3088`); exported from the engine | **the editor has zero references to it** — `panels/inspector/component-section.component.ts:349–351` shows a `MissingComponent` as the generic "Component" with a cog icon and no fields |
| Engine pre-linking | engine `src/engine/core/scenario/Scenario.ts`: `_prelinkAllScripts :844` (all `.js` files, dependency graph, topological order), `_createRewrittenBlobUrl :928`, `_resolveRelativeImport :977` (appends `.js`), `_loadEntryPoint :1014` (`await import(blobUrl)`, default export, brand check), `_rewriteEngineImports :199` (leaves the bare `"WebEngineTS"` to the import map) | the algorithm is exact and battle-tested, but **private/@internal and not exported**; and it assumes pre-compiled `.js`, while the editor holds `.ts` |
| Tests | `app/e2e/run.mjs`: `newPage/instrument/check/seed/readDisk/diskState/openEmptyProject/noErrors`, `ONLY=` filter, 23 scenarios / 274 checks | the harness is ready; the scenario to copy is `run.mjs:944` "project panel: import, save, reload, reopen, delete" |
| CSP | platform `virtual-lab/nginx/csp-editor.conf:15`: `script-src 'self' blob: 'nonce-…'`, `worker-src 'self' blob:` | Monaco's ESM build + blob workers are allowed; **`'unsafe-eval'` is not, and must not be needed** |

## The two things C4 needs that do not exist yet

1. **Monaco** — `grep monaco` in `app/package.json` and `app/package-lock.json` is empty; the editor's only text surfaces are single-line `<input>`s and one `<textarea rows="3">`. Angular budget is 1 MB warn / 3 MB error (`angular.json`), so Monaco must be a lazy chunk.
2. **A current engine tarball** — the installed one is `0.1.0-local.1794336134`, and it has **no `TypeRegistry.replace`** (C3, merged into engine `master` 2026-11-11). "Reload on save" cannot swap a class without it. The engine's own `npm run release:local` installs into the **primary** consumer checkouts (`WebEngineTSEditor/app` at the root), which this task may not touch, so the pack has to be delivered into this task branch's worktree by hand.

## Decisions (binding for the plan)

| # | Decision | Why |
|---|---|---|
| D1 | The Code tab is a fifth entry in `workspace.component.ts`'s existing `bottomTab` union, not a new zone abstraction | C1 is unmerged; inventing a dock system here would duplicate C1 and block it. When C1 lands it absorbs this tab. |
| D2 | Monaco is added as an ESM dependency with its workers served as blob modules | the CSP has `blob:` in `script-src` and `worker-src` and no `'unsafe-eval'`; the repo's plan already chose Monaco's language service over esbuild-wasm for exactly this reason (`unity-editor-plan.md:133–136`) |
| D3 | TS→JS compilation and the pre-linker are **re-implemented in the editor**, not requested from the engine | the engine's pre-linker is `@internal`, assumes pre-compiled `.js`, and owns a ZIP source the editor does not have. The editor's version compiles `.ts` first and then applies the same four rules. |
| D4 | The engine tarball bump is its own step inside the reload phase, gated on the full e2e suite | it is the one change that can break every scenario at once; the suite is the only net |
| D5 | Library sources are copied into the project on add (`scripts/library/`), as the repo's plan says | the project must build in ScenarioCreator without the editor present (`unity-editor-plan.md:142–148`) |
| D6 | Owner question: none. Decision #7 (the ten behaviours) is already delegated to the C4 card, and the card says to confirm the list in the report — the plan lists it and the report confirms it. |

## Risks

- **The bundle budget.** Monaco is large; it must be a lazy route/chunk or the 3 MB error budget fails the build. Mitigation: dynamic `import()` in the Code tab component only.
- **Worker + CSP.** If Monaco's `ts.worker` needs anything beyond `worker-src blob:`, the editor will not run on the platform. Mitigation: prove it in a local build before the e2e depends on it; the `scenariocreator-check.mjs` chain must still build a project containing library scripts, and the repo's own note flags `build-package.mjs` running `tsc` **without `--experimentalDecorators`** (`unity-editor-plan.md:447–450`) — a script using `@SerializedField` may not build there. That is a real gate for D5's library sources, and it is a *ScenarioCreator* repo problem this task can only report, not fix.
- **The "one engine instance" rule.** If the map's shim and Angular's bundle disagree, `TypeRegistry` refuses the second registration (that is why C3 exists). Mitigation: the shim is the app's own module, so there is exactly one instance.
