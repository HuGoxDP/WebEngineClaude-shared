# A10 — The platform runs the released engine, from a versioned path

| | |
|---|---|
| Repo / branch | virtual-lab · `claude/scenario-platform-architecture-24f9fy` (head `709494c`) |
| Model | **Sonnet** |
| Size | 1–2 days |
| Depends on | A9 (`v0.2.0` exists) |
| Blocks | B-milestone-1 publishing (the editor publishes into this player) |

## Why

The student player is engine `0.1.0-local.1789023160893`: no version check, no E3/E5/E6/E10, and a
version-2 file loads hollow. The editor's milestone 1 publishes scenes that need E6/E3/E5/E10, and
scripts can instantiate prefab files, which are version 2 whenever they hold an internal reference.
Also: `/assets/WebEngineTS.standalone.js` is served `Cache-Control: public, max-age=2592000,
immutable` (`nginx/nginx.conf`, the `\.(js|css|…)$` block, ~154), so after an engine update a
returning browser can keep the old build for a month.

## Read first

- `CLAUDE.md` — "Engine integration (the part that is easy to break)", "Scenario storage", CSP.
- `frontend/package.json` (`"WebEngineTS": "file:WebEngineTS-0.1.0.tgz"`), `frontend/angular.json`
  (assets rule: glob `WebEngineTS.standalone.js` from `node_modules/WebEngineTS/dist` → `/assets`),
  `frontend/src/index.html` (import map with a nonce), `Dockerfile.frontend` (`npm install`, not `npm
  ci`, on purpose), `nginx/nginx.conf`, `nginx/csp.conf`.
- `backend/player-formats.js` — `SCENE_FORMAT_VERSIONS = [1]` and the header explaining when to raise
  it.
- `frontend/src/app/pages/viewer/` — where `BuildInfo` is shown under `?diag=1`, and
  `Texture2D.ktx2TranscoderPath`.
- `e2e/README.md` — how to run the Playwright suite against the stack.

## Do

1. **Depend on the release.** `frontend/package.json`: `"WebEngineTS":
   "https://github.com/HuGoxDP/WebEngineTS/releases/download/v0.2.0/WebEngineTS-0.2.0.tgz"`;
   `npm install` in `frontend/` so the lockfile records it. Delete the committed
   `frontend/WebEngineTS-0.1.0.tgz` and its mention in `CLAUDE.md` ("intentionally committed") — it is
   no longer needed; the Docker build fetches the tgz (it already needs the network for npm).
2. **Versioned engine path.** Angular assets rule `output: "/engine/0.2.0"` (instead of `/assets`);
   import map `"WebEngineTS": "/engine/0.2.0/WebEngineTS.standalone.js"`. Keep `index.html` `no-cache`
   (it is). The version string lives in one place: a small Node script run before `ng build`
   (`prebuild` in `package.json`) reads `node_modules/WebEngineTS/package.json` and writes the import
   map entry and the assets output, or — simpler — keep the version literal in both places and add a
   frontend unit test that fails when the import-map path does not contain the installed engine's
   version. Pick one and say why.
3. **nginx**: the `/engine/` path gets `Cache-Control: public, max-age=31536000, immutable` (it is
   versioned now); `csp.conf` included in that location (`add_header` does not inherit). Make sure no
   other location still serves an unversioned engine bundle.
4. **Prefab files version 2 are now readable.** In `backend/player-formats.js` split the rule:
   `SCENE_FORMAT_VERSIONS = [1]` stays (a link-mode *scene* still needs its prefabs preloaded, which
   the scenario template does not do); add `PREFAB_FORMAT_VERSIONS = [1, 2]` — a `.prefab.json` is
   loaded through `Resources`/`AssetFiles`, which preload nested prefabs, and the player now reads 2.
   Update the header text, `sceneFileProblem` (choose the list by extension), the tests (a v2 prefab
   accepted, a v3 refused, a v2 scene still refused), `CLAUDE.md`, `Readme.md`, `docs/test-plan.md`,
   ScenarioCreator `CLAUDE.md` "Platform contract", the editor `docs/integration-plan.md`.
5. **Run everything**: backend unit + integration (Postgres via docker compose), frontend `ng test`,
   and the Playwright e2e against the stack with the **13 published archives** (`e2e/README.md`) —
   every published scenario must still open on the new engine. If one fails, report it with the
   console output; do not change the scenario here (content belongs to ScenarioCreator).
6. **Check the running build**: open the viewer with `?diag=1`, confirm `BuildInfo.version` is
   `0.2.0`; `curl -I` the engine URL and confirm the immutable header.

## Acceptance

All suites green (counts in the report); e2e 35 (or the current number) pass on the new engine; the
viewer shows `0.2.0`; no file in `frontend/` is named `WebEngineTS-0.1.0.tgz`; the import map, the
Angular asset output and nginx agree on `/engine/0.2.0/`.

## Out of scope

Deploying to the production server (owner). Per-scenario engine pinning (E-growth, needs the player
iframe). Raising `SCENE_FORMAT_VERSIONS`.

## Commits

`build(frontend): run the released engine v0.2.0`, `feat(nginx): serve the engine from a versioned,
immutable path`, `feat(backend): accept version-2 prefab files the player now reads`, `docs: …`.

## Report back

Test counts per suite, the e2e result per published scenario, the header check, and anything the new
engine changed in a published scenario's behaviour.
