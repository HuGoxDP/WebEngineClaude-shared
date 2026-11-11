# M2.2 — virtual-lab checks on the engine tarball P7 committed (`frontend/WebEngineTS-0.1.0.tgz`, eb7f314)

Branch `M2.2-engine-tarball-checks` in `virtual-lab` (+ `.claude-shared` for the row). W1.
Task: the platform's next deploy ships this tarball — run the platform's full checks on it,
ahead of A10.

## Green

| Check | Result |
|---|---|
| backend unit (`npm run test:unit`) | **288 / 288** |
| backend Postgres suite (`docker-compose.test.yml`, `vl-db.lock`) | **1487 / 1487** |
| frontend (`npx ng test --no-watch`) | **767 / 767** |
| browser e2e, main path (`npx playwright test`, the whole suite) | **95 passed · 2 skipped · 4 did not run · 0 failed (43.7m), exit 0** |

## Red — the manifest/streaming subset of the browser e2e

After the per-asset store was filled (`npm run import:assets -- --release ../ReleaseScenarios`),
the five manifest-path specs fail on **this stack**:

- `ktx2.spec.ts` "a scenario that loads .ktx2 transcodes it instead of expanding it"
- `streaming.spec.ts` ×3 (the catalog advertises the manifest; `?stream=1`; asset-heavy
  scenario renders the same from a manifest as from its ZIP)
- `viewer-player.spec.ts` "DW-5.2 `?stream=1`: runs in a sandboxed frame, focus, FPS"

**This is a setup gap in the worker worktree, not evidence against the tarball.** P7 verified
the same tarball green on the platform (streaming e2e: textures 20/20, VRAM 273.8 MB manifest
vs 96.8 MB ZIP, draw calls 27/27). What this worktree lacks: the per-scenario archives and
manifests the streaming specs need. `ReleaseScenarios` (junctioned from the primary) carries ten
`*.scenario.json` sidecars but the release's scenario **archives do not include the streaming
scenario's own zip** (`build-manifest.mjs --scenario solar-system-scenario` → "No archive at
…/ReleaseScenarios/solar-system-scenario.zip. Build it first: npm run build -- --scenario …"),
and each missing archive is a full ScenarioCreator build (minutes). The first failure's shape —
no ZIP requests at all in the default mode, because the catalog row advertises a manifest
whose objects are not all in the store — is the same signature.

Also seen: the frontend container restarted once mid-run, which failed the second gated run's
global-setup until the stack was brought back up.

## What the next run needs

1. In `ScenarioCreator`: build the streaming scenario's archive (`npm run build -- --scenario
   solar-system-scenario`, and `Molecules`), then `node build-manifest.mjs --scenario …` for
   each, then re-run `import:assets` and the five specs.
2. If they still red with complete archives and manifests in the store, the tarball itself is
   at fault: restore the previous tarball in `virtual-lab/frontend/` and ATTENTION.

## Resolution (2026-11-11, same claim) — GREEN

The red subset was environmental, not the tarball. Three causes, all in the worker's setup:

1. **Stale containers** — the stack predated the P3b/P5a merges (nginx config, frontend image).
   `docker compose down` + `up -d --wait` on the merged `main` rebuilt it. (Also the Docker daemon
   had stopped; restarted.)
2. **Missing scenario archive** — `ReleaseScenarios` had ten `*.scenario.json` sidecars but no
   archive for the streaming scenario. `npm run build -- --scenario solar-system-scenario` (and
   `Molecules`) in `ScenarioCreator`, then `build-manifest.mjs --scenario …` for each, then
   `import:assets` re-registered the manifests.
3. **Missing fixtures junction** — the admin specs resolve `SMALL_ARCHIVE` through
   `.workers/ScenarioCreator/ReleaseScenarios/test/` (the shared junction, not the worker
   worktree); it did not exist. Created with `mklink /J`. One further failure — the golden path
   asserting an *unpublished* bench scenario is a 404 anonymously — came from `publish:release`
   having published every release row including the benches; unpublished `benchscene3-solarsystem`
   via `PUT /api/catalog/:id {"isPublished": false}`.

Final run on the rebuilt stack, same tarball (`frontend/WebEngineTS-0.1.0.tgz`, eb7f314):

| Check | Result |
|---|---|
| backend unit | 288 / 288 |
| backend Postgres suite (vl-db.lock) | 1487 / 1487 |
| frontend `ng test` | 767 / 767 |
| browser e2e — full suite | **141 passed · 3 skipped · 0 failed (15.0m), exit 0** |

Manifest-path numbers inside the run: solar-system first frame ZIP 44.7 s vs manifest 42.3 s,
draw calls 27/27, textures 20/20 (VRAM 96.8 MB ZIP vs 224.8 MB manifest — SC-G2's lazy fix
landed), molecules manifest 1410 ms / 3 draw calls. Verdict on the tarball: **safe to ship** — no
code change in this task, no follow-up row needed.
