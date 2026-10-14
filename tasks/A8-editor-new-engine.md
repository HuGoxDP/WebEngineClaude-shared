# A8 — The editor takes the new engine and opens files through its version check

| | |
|---|---|
| Repo / branch | WebEngineTSEditor (`app/`) · `claude/scenario-platform-architecture-24f9fy` (head `b4a1a22`) |
| Model | **Sonnet** |
| Size | 1 day |
| Depends on | A4 (the public version API). Repeat the pack step after A5 if A5 lands later. |
| Blocks | A9 (the release is only cut once the editor works on it) |

## Why

The editor runs engine `0.1.0-local.1789023160893` (2026-09-10) and accepts a scene only when
`data.version !== 1` is false (`app/src/app/services/commands.service.ts`, `_loadSceneText`,
~line 614). Readers first: the editor must read version 2 before anything writes it — a prefab file
written by its own engine is already version 2 whenever it holds an internal reference, so today
the editor could not reopen it.

## Read first

- `app/src/app/services/commands.service.ts` — `_loadSceneText` (~605–622), `_writeScene` (~551).
- `app/src/app/services/document.service.ts` — autosave read/write, reload-from-disk.
- `app/src/app/services/scene.service.ts` — `loadFromJSON`, `serialize`.
- `app/src/app/services/clipboard.service.ts`, `history.service.ts`, `play-mode.service.ts` —
  in-memory snapshots (made by the same engine; they need no check).
- `app/src/app/services/project-templates.ts` — `SCENARIO_TEMPLATE` (runs in the player, not here).
- The i18n files (`grep -rn "scene.invalid" app/src`), uk and en.
- `README.md` and `.github/workflows/ci.yml` — how CI installs (`npm ci` from the committed lockfile
  and `app/WebEngineTS-0.1.0.tgz`), builds, runs the docker smoke and the e2e.
- `WebEngineTS/scripts/release-local.mjs` — how a consumer gets a packed engine.

## Do

1. **Pack the engine for the editor only**, as `release-local.mjs` does (see `tasks/README.md`,
   "Engine into a consumer"): build, stamp `0.1.0-local.<ts>` for `npm pack` only, restore
   `package.json`, rename to `WebEngineTS-0.1.0.tgz`, copy to `app/`, `cd app && npm install
   ./WebEngineTS-0.1.0.tgz`. Commit the tarball and `app/package-lock.json` together. Do not touch
   virtual-lab or ScenarioCreator.
2. **Open through the engine.** Replace the literal check with the engine's API (A4:
   `SceneSerializer.canRead` / `versionOf` / `readableVersions`, `UnsupportedFormatError`) in
   `_loadSceneText` and in every other path that parses scene or prefab JSON coming from outside the
   session: reading from disk, reload on focus, autosave recovery, a dropped file, the system
   clipboard if it accepts JSON (find them: `grep -rn "JSON.parse" app/src/app/services`).
3. **Messages.** A file newer than this editor reads gets its own message (new i18n key, e.g.
   `scene.tooNew`, uk and en, same tone as `scene.invalid`): names the file, its version, the versions
   this editor reads, and says to update the editor. A malformed file keeps `scene.invalid`. Nothing in
   the editor state changes on refusal (selection, history, current scene).
4. **Writing is unchanged**: the editor still saves with `SceneSerializer.serializeScene` defaults
   (expand mode, version 1).
5. **Behaviour drift from a month of engine changes**: run the whole CI sequence. If an editor test
   or e2e breaks because the engine changed behaviour (E6 `MissingComponent`, E7 order, E10
   `renderSettings` in scenes), fix the editor when the new behaviour is right; if the engine looks
   wrong, stop and report it with evidence (a file and a line) instead of patching around it — that is
   an `ENGINE-GAPS.md` row.

## Tests

The editor has no unit-test runner; its tests are the e2e (`app/e2e/run.mjs`). Add e2e scenarios:
open a v1 scene; a scene with no `version`; a v2 scene (generate one with the new engine in link mode
from a small Node script under `app/e2e/fixtures/`, committed as JSON); a v3 scene → the `tooNew`
message, uk and en; garbage → `invalid`. Each asserts the previous scene is still shown after a refusal.

## Acceptance

`cd app && npm ci` succeeds from the committed lockfile (the tarball's integrity matches); `npx ng
build`; `npm run e2e` all green; CI green after the push. `grep -n "version !== 1" app/src` returns
nothing.

## Out of scope

Prefab authoring (stage 14). Writing version 2. The Angular 19 → 21 / zoneless move.

## Commits

`build(app): take the engine with the version-2 reader` (tarball + lockfile),
`feat(app): open scenes through the engine's version check`, `test(e2e): …`, `docs: …` (README /
`docs/integration-plan.md` if they mention the version literal).

## Report back

Engine stamp packed (`BuildInfo.version`), e2e counts before/after, any engine behaviour change
that needed an editor change, and anything reported instead of patched.
