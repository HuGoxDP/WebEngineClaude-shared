# P7 — Confirm G2 (`liveTextures` vs `textures` in the streaming e2e)

Card: ROADMAP `P7` — *"Confirm G2 (`liveTextures` vs `textures` in the streaming e2e)"*, source
`PLAN.md` §2.1. Branch `P7-confirm-g2-streaming` in `virtual-lab` (+ `.claude-shared` for the row).

## The question

G2 in `ENGINE-GAPS.md`: "Streamed asset path reports ~2.9× the texture VRAM of the ZIP path for the
same scenario". The 2026-09-05 diagnosis says it is **not an engine leak**: the streamed path
eagerly decodes every non-`Lazy` manifest asset, and solar-system ships redundant fallbacks (a
`.glb` *and* a loose albedo per planet). The documented consequence: `renderer.textures` matches at
19 while `estimatedTextureVramBytes` does not — the former counts GPU uploads, the latter counts
every live `Texture` object.

**Predicted reading, still to be confirmed on the platform:** `liveTextures` differs while
`textures` matches. `PLAN.md` §2.1: re-run `e2e/tests/streaming.spec.ts` printing both.

Field mapping (the e2e snapshot, `e2e/helpers/engine.ts`):
- `liveTextures` ⇄ `textureVramBytes` = `renderer.estimatedTextureVramBytes` (every live `Texture`)
- `textures` ⇄ `textureCount` = `renderer.textures` (GPU uploads)

## Infra work the run needed (all gitignored runtime data, no repo content changed)

1. **`.env`** — the worktree had none (gitignored). Note: Docker Compose v5 rejects
   `.env.example`'s Ukrainian comments (`)` in a variable name), so a minimal `.env` was written
   by hand (`DB_*`, `API_PORT`, `FRONTEND_PORT=8044`, a fresh `ADMIN_TOKEN`).
2. **Stack** — `docker compose up -d` under `vl-db.lock`. First boot failed: the DB volume had been
   initialized with a blank password from a partial `.env`; `docker compose down` +
   `docker volume rm virtual_lab_pgdata` reset it. The `vl-r2` stack from another session uses its
   own `vl_r2_pgdata`, so nothing shared was touched.
3. **Catalog** — `backend` needed `npm ci`; `npm run publish:release --release <dir>` filled the
   catalog from `ScenarioCreator/ReleaseScenarios` (13 rows). The script's legacy
   `/api/scenarios/<id>/approve` step 404s against the current API (the approval lives in the bulk
   route / catalog-admin compatibility now) — publish itself succeeded, rows are visible.
4. **Per-asset store** — `npm run import:assets --release <dir>` registered manifests. The release
   shipped only one sidecar (`Circuits.scenario.json`); `build-manifest.mjs --scenario
   solar-system-scenario` and `--scenario Molecules` emitted the two the streaming spec needs
   (solar-system: 5 scripts / 18 assets, 1 critical + 6 high + 11 low — the priorities the spec's
   comment expects). The primary's `ReleaseScenarios` is junctioned into the worker worktree
   (`mklink /J`), so the emitted sidecars and the shared `objects/` store stay single-copy.
5. **Engine** — the frontend tgz was 6 days stale (`0.1.0-local.1793745537109`), and G2's row
   requires re-verification against the current build, so `npm run release:local` in the engine
   packed fresh master and updated `virtual-lab/frontend`; the frontend image was rebuilt.
6. **The frontend image is rebuilt from a stale-lock trap that silently keeps the old viewer.**
   The stack had been running an image built **2 weeks** earlier: the first
   `docker compose build frontend` failed with `EINTEGRITY` — `frontend/package-lock.json`
   recorded the sha512 of the old tgz, the new pack's bytes differ, so `npm install` inside the
   Docker build refuses the dependency. `release:local`'s reinstall had refreshed
   `node_modules` but **not** the lock (a plain `npm install` skips re-resolving an unchanged
   dependency line), so `docker compose build` kept failing while the stack went on serving the
   old image. Symptom: the viewer ran scenarios **inline in the page** — no
   `/player/player.html` frame at all — so every spec that reads the engine through the
   sandboxed player failed (`no player frame appeared`) and the `?stream=1` run never reached
   "running". Fix: `npm install WebEngineTS@file:./WebEngineTS-0.1.0.tgz` in
   `virtual-lab/frontend` (updates the lock's version + integrity), then
   `docker compose build frontend` + `up -d`. After that the sandboxed iframe mounts and the
   player handshake works.

## Result

_(filled in after the run)_
