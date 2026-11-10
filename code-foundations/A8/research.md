# A8 — the editor takes the new engine (research)

Worker **W3**, 2026-11-10. Claim `claims/A8`, branches `A8-editor-new-engine` in
WebEngineTSEditor + .claude-shared. Card: `tasks/A8-editor-new-engine.md`.

## Current state (measured)

- `app/package.json` depends on the engine as `"WebEngineTS": "file:WebEngineTS-0.1.0.tgz"`;
  the tarball is committed in `app/`, and `package-lock.json` records
  `node_modules/WebEngineTS` at `0.1.0-local.1793745537109` (already packed once after
  1789023160893 — the card's version is stale, the mechanic is the same). No `node_modules`
  in the W3 worktree yet (`npm ci` needed before `ng build`/e2e).
- The version gate is a single literal: `commands.service.ts:614`, `_loadSceneText`
  `data.version !== 1` → `scene.invalid`. Acceptance: `grep -n "version !== 1" app/src` empty.
- Every path that parses scene JSON from outside the session funnels through
  `_loadSceneText`: open main scene (378), autosave recovery (406), a dropped file (464),
  folder import (481), reload-from-disk (597). `scene.service.loadFromJSON` /
  `project-templates.ts:95` consume already-parsed JSON produced by the editor's own engine
  (clipboard/history/play-mode snapshots) — no external shape, no check needed there
  (card's "Read first" agrees).
- `document.service` only reads the autosave *text*; the recovery call site (406) is the
  one that will carry the check.
- i18n: `en.ts:321-322` `scene.parseFailed` / `scene.invalid`; `uk.ts:316-317` the uk pair.
  Tone for the new key: "{name} is not a valid scene file." → the tooNew message names the
  file, its version, the readable versions and says to update the editor.
- Engine API to use (A4, in `dist/` and `src/`): `SceneSerializer.canRead`,
  `versionOf`, `readableVersions`, `UnsupportedFormatError`.

## Decisions (with evidence)

1. **One gate, not five.** All five readers call `_loadSceneText`, so the version check is
   replaced once there; the five call sites keep their own pre-checks (parse failure etc).
   Evidence: the grep above.
2. **Pack by hand for the editor only**, exactly as `tasks/README.md` "Engine into a
   consumer" describes (build → stamp `0.1.0-local.<ts>` only for `npm pack` → restore
   `package.json` → rename → `npm install ./WebEngineTS-0.1.0.tgz` in `app`), never
   `release-local.mjs` (it would also touch virtual-lab / ScenarioCreator). Evidence: the
   card and the README; the W3 worktree layout has no `testv/` alias.
3. **Writing stays version 1** with `serializeScene` defaults — unchanged by this task.
4. **A5 interaction**: the card says repeat the pack if A5 lands later. A5 is in flight
   (W1). The pack uses whatever `origin/master` is at pack time; before the merge the
   branch syncs `origin/master` and, if it moved, re-packs + re-runs `ng build`/e2e.
5. **e2e environment**: the runner borrows Playwright from `testv/virtual-lab/e2e`
   (`E2E_PLAYWRIGHT_DIR` overridable). In W3 that path does not exist and has no
   `node_modules`: e2e runs inside `editor-e2e.lock` with
   `E2E_PLAYWRIGHT_DIR=<W3>/virtual-lab/e2e` after an `npm ci` there (or another install
   root), `E2E_BROWSER_CHANNEL=msedge` (Windows Edge). Recorded as a risk for the checks
   phase; `ng build` needs only the app's own `npm ci`.

## Risks

- A month of engine drift (E6 `MissingComponent`, E7 order, E10 `renderSettings`) may break
  an editor e2e after the pack; the card gives the rule (fix the editor when the new
  behaviour is right, otherwise report with file+line, no patching around).
