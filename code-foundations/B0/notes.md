# B0 — the loader reads `entryScene`

Branches `B0-entry-scene` in WebEngineTS (`45ff622`), ScenarioCreator (`4303f80`), .claude-shared.

## What landed
- Engine: `Scenario.run()` calls `_loadEntryScene()` right after the entry point's `awake()` (`Scenario.ts`).
  It reads `manifest.entryScene` through `ScenarioAssets.getAsset` (path relative to `assets/`, an
  `assets/` prefix is accepted), checks the format version (`SceneSerializer._refuseUnknownVersion`), loads
  everything `SceneSerializer.assetReferences` lists through `Resources` and then runs
  `SceneSerializer.deserializeScene`. The preload is the new public `AssetFiles.loadReferencesOf(json, path)`,
  a thin wrapper over the loader prefab files already use (cycle guard included).
- Streaming: `scenario.json` accepts `entryScene` (non-empty string), `toScenarioManifest` carries it.
- A missing file or an unreadable version fails the run before anything is built; `run()`'s catch unloads.
- No `entryScene`: no code path changes (test: no `Resources.loadAtPath`, empty scene).
- ScenarioCreator: `scenario.meta.json` `entryScene` (normalised: slashes, `./`, `assets/`) -> ZIP
  `manifest.json` and `<name>.scenario.json`; the build fails if the file is not in `assets/`.
  Works with the old engine tarball (the old parser ignores the unknown key) - no `release:local` needed.

## Why after awake, and the redundancy decision
The scene names component classes; they are registered by decorators when the entry module (and what
`awake()` imports through `context.importScript`) is evaluated. Before `awake()` the entry module is
already imported, so the classes the scene needs exist; building before the import would not work.
Consequence: an entry script that looks up scene objects in its own `awake()` will not see them yet
(they appear right after). The editor template does exactly the load-in-`awake` today, so its manual load
becomes **redundant** once `entryScene` is written - and harmful if both are present (the world is built
twice). Evidence: `tests/ScenarioEntryScene.test.ts` (scene absent at `awake`, present after; `loadAtPath`
untouched without the field). The manual load differs only in that it never preloaded prefab/material files
(negative control: removing the preload makes the prefab test fail).

## Follow-ups (not done here)
- Editor (B7): packager writes `entryScene` from Build Settings; `SCENARIO_TEMPLATE` in
  `WebEngineTSEditor/app/src/app/services/project-templates.ts` drops its `getAsset`/`deserializeScene`
  call. Order matters: the platform's engine bundle must read `entryScene` first, or a template without the
  manual load shows an empty scene on an old engine.
- `.github/docs/SCENARIO_FORMAT.md` in the engine (Ukrainian, partly stale) was only touched for the example value of `entryScene`.
- Release: engine change reaches consumers via `npm run release:local` (owner, after merge).

## Checks
Engine `npm run typecheck`, `npm test` (152 files passed, 2666 tests passed, 9 skipped), `npm run build`: exit 0.
ScenarioCreator `build:all`, `build --all --tests`, `manifest:all --tests`, `manifest:verify` (108 files, 0
problems), `node --test tests/meta.test.mjs` 4/4.
