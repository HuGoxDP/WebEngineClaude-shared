# A10 — the platform runs the released engine v0.2.0, from a versioned path

Branch `A10-platform-on-release` in `virtual-lab` (+ `WebEngineTSEditor`, `ScenarioCreator` and
`.claude-shared` for the doc/card touches). W1. Card: `tasks/A10-platform-on-release.md`.

## What landed (4 commits in virtual-lab, 2 doc commits)

1. `build(frontend): run the released engine v0.2.0 from a versioned path` — `frontend/package.json`
   depends on the GitHub Release tarball URL (no more committed `frontend/WebEngineTS-0.1.0.tgz`;
   the Docker build already needs the network for npm); the Angular assets rule publishes the
   bundle to `/engine/0.2.0/`; `player-config.ts`'s `ENGINE_URL` names that path; a new spec
   reads the installed engine's version and fails when the URL does not carry it.
2. `feat(nginx): serve the engine from a versioned, immutable path` — the no-cache exact-match
   `/assets/WebEngineTS.standalone.js` location is replaced by `/engine/` with
   `max-age=31536000, immutable`, keeping `ACAO: *` (the frame's origin is `null`) and the CSP
   include. The old path 404s.
3. `feat(backend): accept version-2 prefab files the player now reads` — `PREFAB_FORMAT_VERSIONS =
   [1, 2]` (a prefab is loaded through `Resources`/`AssetFiles`, which preloads the prefabs nested
   inside it); a scene stays `[1]` (a link-mode scene needs its prefabs preloaded, which the
   exported scenario template does not do); `sceneFileProblem` picks the list by extension.
4. `build(docker): fetch the engine release tarball at build time` — the Dockerfile copied the
   deleted tarball; it now just runs `npm install` (without `--prefer-offline`, so the tarball is
   actually fetched).
5. `test(e2e): the frame loads the engine from its versioned path` — the suite carries its own
   `ENGINE_URL`; it named `/assets`, and every frame-dependent test failed with "Failed to fetch
   dynamically imported module". Helpers, the compression proof, the player-serving lists and the
   profiler-gate test now name `/engine/<version>/`, and a new `engine-url.spec.ts` pins that
   version against the frontend's dependency when its checkout is beside the e2e.
6. Cross-repo docs: `ScenarioCreator/CLAUDE.md` "Platform contract" (prefab 2 is accepted) and
   `WebEngineTSEditor/docs/integration-plan.md` (the editor's Play iframe uses the versioned path).

## Checks (on the rebuilt stack)

| Check | Result |
|---|---|
| backend unit | 292 / 292 |
| backend Postgres suite (vl-db.lock) | 1491 / 1491 |
| frontend `ng test` | 768 / 768 |
| frontend build + CSP assumptions | green; `dist/browser/engine/0.2.0/` published |
| browser e2e, full suite | **142 passed · 3 skipped · 0 failed** (last run: one test failed with a leftover hardcoded `/assets` URL inside `viewer.spec.ts`; fixed in `65efbd9` and that file re-ran 16/16) |
| running stack | `/engine/0.2.0/WebEngineTS.standalone.js` → 200, `Cache-Control: public, max-age=31536000, immutable`, `ACAO: *`, CSP present; `/assets/WebEngineTS.standalone.js` → 404; the bundle carries `0.2.0` |

## What the new engine changed for a published scenario

Nothing broke. The streaming manifest path now measures **96.8 MB live textures, exactly the ZIP
path** (was 224.8 MB at M2.2): the excess E-G2a filed is gone in 0.2.0. Draw calls 27/27,
textures 20/20 on solar-system; molecules first frame 1047 ms.

## Deviations recorded

- The card's "import map in `index.html`" no longer exists (player isolation removed it; the CSP
  check `scripts/check-csp-assumptions.mjs` rejects one). The engine URL has one holder instead:
  `player-config.ts`'s `ENGINE_URL`, pinned by the spec.
- `docker compose up -d` does not rebuild an existing image; `--build` (then an explicit
  `docker compose build frontend`) was needed to see the new path on the stack.
- W3 holds `editor-e2e.lock` territory (`VirtualLabEditor` container is up on the same network);
  nothing of mine touched it.
