# P6 — a cover for every catalog row

Branch `P6-catalog-covers` in `virtual-lab` (+ `.claude-shared`). W1. Resumed after decision #24
(recorded on `origin/main`; the question was filed here as #21 and renumbered — #21–23 are N3's).
**Answer (delegated):** a worker generates one cover per scenario from its own assets and uploads
it through the preview API; no off-origin URLs.

## What the answer's "(skybox or largest texture, downscaled to the preview limit)" could not mean

The archives ship no raster a cover can be: only `solar-system` and `Kepler` have
`assets/skybox/stars_panorama.jpg` (2:1, 1.75 MB); the other eight scenarios have no `assets/` at
all — their look is procedural, built by their scripts. And `backend/preview-image.js` accepts
PNG/JPEG only, ≥800 px wide, **16:10 ±5%**, ≤8192 px: a 2:1 skybox would be *refused*, not merely
"downscaled". So the cover is the scenario's own **rendered look** — literally its assets, through
the engine the platform serves.

## What landed (virtual-lab, one commit)

`e2e/scripts/make-covers.mjs`:
- For each catalog row without a cover, opens `/play/<id>` on the running stack, waits until the
  engine in the player frame reports drawn frames, screenshots the frame's canvas and letterboxes
  it onto 1280×800 (16:10 exactly, the aspect a preview needs — the letterbox colour is the
  platform's page background).
- Uploads the bytes through `POST /api/scenarios/:id/preview` (multipart, the bootstrap
  `ADMIN_TOKEN` — an author or a moderator may set a cover, nothing weaker). The route stores
  them under their content hash at `/previews/<sha256>.png`: same origin, so the CSP's `img-src
  'self'` allows them; no external URL exists to leak.
- `--only id,id` and `--force` to redo one; rows that already carry a cover are skipped.

No engine, backend or frontend code changes; the script is the whole deliverable and is
reproducible against any stack.

## Checks

The upload path itself is already covered: `player-serving.spec.ts` asserts `ACAO: *` and the CSP
on the served engine paths, `csp.spec.ts` loads a scenario under the policy, and the preview
route's acceptance rules (PNG/JPEG, 16:10, ≥800 px, ≤5 MB, ≤8192 px) are pinned by
`preview-image`'s unit tests. The script's own output is verified per row: `imageUrl` becomes
`/previews/<sha256>.png`, and `curl -sI` on it answers 200 with `image/png` and the platform's
cache policy.
