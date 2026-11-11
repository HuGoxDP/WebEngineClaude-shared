# Plan: N6a — texture-orientation harness (stage 0 of the UV-convention plan)
**Created:** 2026-11-11 (Claude, architect lane)
**Status:** ready
**Complexity:** moderate
**Review cadence:** per phase
**Check-ins:** quiet
---
## Context
`N6` (one UV convention, closes gap G4) changes the orientation of every texture and may only start
with a before/after reference. The by-eye reference it was planned around was deleted by the owner
(`a3fe342`), and was about handedness, not textures. N6a builds a **machine-read** replacement: one
headless Chromium frame with a grid of textured tiles, every tile read back as identity / flipV /
flipH / rot180, pinned against `expected.json`. Research, facts with line numbers and every decision:
`code-foundations/N6a/research.md` — **read it first; its Decisions (D-1 … D-10) are binding.**
Base: WebEngineTS `master` `2569fc4`. Deleted design docs are read from history only:
`git show a3fe342^:design/unity-coordinates-plan.md` — never restore them.

**Success criteria:**
1. `npm run build && npm run orientation-check` renders the 13-tile grid in Chromium (SwiftShader),
   prints one reading per tile, and exits 0 against the committed `expected.json` and reference crops.
2. Two consecutive runs give identical readings and crops within D-4's tolerance.
3. The harness fails (exit 1, naming the tile) when one reading changes — shown by a test that
   flips one texture with `flipVertically` through the `--probe-flip <tile>` switch.
4. The first reading is compared with the predictions table (Phase 3); every difference is written
   up in `notes.md` as a finding with the tile's crop, not adjusted away.
5. `npm run typecheck`, `npm test`, `npm run build` green; no new dependency in `package.json`.

## Constraints
- Engine repo only, and only under `scripts/orientation-check/`, `tests/OrientationHarness.test.ts`
  and one `package.json` script line; plus the task's `.claude-shared` notes. **No `src/` change**
  — this task measures, it changes no behaviour (N6 does).
- Reuse `scripts/player-smoke/browsers.mjs` (`launchBrowser`, `CHROMIUM_ARGS`) and
  `locate-playwright.mjs` (`loadPlaywright`) by import; do not copy them, do not change them.
- Plain `.mjs` (like player-smoke) with a `.d.mts` beside every module a vitest test imports (the
  player-smoke pattern, e.g. `browsers.d.mts`), so `npm run typecheck` covers the tests.
- Never weaken a test; anything this plan does not answer is a question: park (ATTENTION), do not guess.

## Layout (fixed — the runner and the page share it from `layout.mjs`)
Viewport 800×600, device scale factor 1. Orthographic camera at `(0, 0, −10)` looking +Z, upright,
`orthographicSize = 5` → 60 px per world unit; screen pixel of world `(x, y)` is
`(400 + 60x, 300 − 60y)` (top-down pixel rows). Clear colour solid grey `(0.5, 0.5, 0.5)`.
Five columns `x ∈ {−5.2, −2.6, 0, 2.6, 5.2}`, three rows `y ∈ {3, 0, −3}`; every tile is 2×2 world
units (120×120 px). Quadrant sample centres: tile centre ± 0.5 world units (± 30 px) on each axis;
each sample is the mean of a 9×9 px block.

| Row \ col | −5.2 | −2.6 | 0 | 2.6 | 5.2 |
|---|---|---|---|---|---|
| **3** | `quad-png` | `quad-ktx2` | `plane-png` | `cube-png` | `sprite-png` |
| **0** | `gltf-embedded` | `gltf-png` | `gltf-ktx2` | `ui-png` | — |
| **−3** | `sphere-png` (ref) | `cylinder-png` (ref) | `capsule-png` (ref) | `torus-png` (ref) | — |

- Mesh tiles use `new Material(Shader.Unlit)` with `mainTexture` (no lighting in the reading).
- `quad-*`: `Mesh.createQuad(2, 2)`. `plane-png`: `Mesh.createPlane(2, 2)` rotated
  `Quaternion.Euler(−90, 0, 0)` (normal +Y → −Z, toward the camera; its +Z edge becomes screen-up).
  `cube-png`: `Mesh.createCube(2)`, the −Z face is the one seen. `sprite-png`: `SpriteRenderer.sprite`
  = the PNG texture, scaled so it covers exactly 2×2 world units (state the pixels-per-unit used).
  `ui-png`: a ScreenSpaceOverlay `Canvas` with one `UIImage` (`sprite` = the PNG texture), a
  120×120 px rect centred at the tile's pixel centre — UI pixels are top-left/Y-down (CLAUDE.md, C2).
- glTF tiles: one 2-triangle quad `.glb` (D-7): positions `(±1, ±1, 0)`, glTF UVs top-left origin
  (vertex `(−1, 1)` → uv `(0, 0)`, `(1, 1)` → `(1, 0)`, `(−1, −1)` → `(0, 1)`, `(1, −1)` → `(1, 1)`),
  `doubleSided: true`, embedded quadrant PNG. `gltf-png`/`gltf-ktx2` replace the imported
  material's albedo/main texture with the separately-loaded PNG/KTX2 — state in `notes.md` which
  property the importer's material uses and that the replacement is the same call content makes.
- Reference tiles: `createSphere(1)`, `createCylinder(0.8, 2)`, `createCapsule(0.6, 2)`,
  `createTorus(...)` with arguments that fit 2×2 (record them); each rotated nowhere.

Reading names: `identity` (screen TL/TR/BL/BR = red/green/blue/yellow), `flipV` (blue/yellow/red/
green), `flipH` (green/red/yellow/blue), `rot180` (yellow/blue/green/red), `missing` (any sample
within 0.08 of the clear grey in every channel), `unknown` (anything else). A sample's colour is the
nearest of the four hues after dividing by its largest channel; a sample whose largest channel is
< 0.15 is `unknown`.

---
## Implementation Phases

### Phase 1: Pure parts — fixtures, decoder, classifier, layout
**Skills:** code-foundations:cc-defensive-programming, code-foundations:cc-routine-and-class-design
**Model:** sonnet
**Gate:** Standard
**Depends on:** none
**File scope:** scripts/orientation-check/layout.mjs, scripts/orientation-check/layout.d.mts, scripts/orientation-check/quadrant.mjs, scripts/orientation-check/quadrant.d.mts, scripts/orientation-check/png-decode.mjs, scripts/orientation-check/png-decode.d.mts, scripts/orientation-check/classify.mjs, scripts/orientation-check/classify.d.mts, tests/OrientationHarness.test.ts

**Goal:** every piece that does not need a browser exists and is unit-tested.

**Scope:**
- IN: `layout.mjs` — the constants above, `TILES` (id, column, row, kind: `"classify" | "reference"`),
  `tilePixelCentre(id)`, `quadrantSamplePoints(id)` → `{tl, tr, bl, br}` pixel coords, `tileCrop(id)`
  → `{x, y, width: 120, height: 120}`. `quadrant.mjs` — `makeQuadrantPng(size = 16)` (RGBA, row 0 =
  top; quadrants exactly `size/2`, `size` a multiple of 8 so KTX2 4×4 blocks stay flat) and
  `makeQuadGlb(png)` per the layout (reuse the chunk/padding approach of
  `scripts/player-smoke/fixtures.mjs:132-170`; import its `pngChunk`/`crc32` only if exported,
  otherwise write the few lines here — do not modify player-smoke). `png-decode.mjs` —
  `decodePng(buffer)` → `{width, height, rgba: Uint8Array}` for bit depth 8, colour types 2 and 6,
  interlace 0, filters 0–4 (Paeth per the PNG spec); throws a named error on anything else.
  `classify.mjs` — `sampleMean(image, x, y, half = 4)`, `hueOf(rgb)` (`"red" | "green" | "blue" |
  "yellow" | "grey" | "dark"`), `classifyTile(samples)` (reading names above),
  `compareCrops(a, b, {maxDelta = 3, minShare = 0.995})` → `{ok, share, worst}`.
- OUT: anything that launches a browser.

**Edge cases:** PNG with several IDAT chunks (concatenate before inflating); a sample block clipped
by the image edge (throw — the layout never produces one, so it is a bug); `classifyTile` with two
equal hues (→ `unknown`); a pure-grey sample next to a dark one (`missing` wins only when every
channel is near the clear colour).

**Done when:**
- [ ] DW-1.1: `decodePng(makeQuadrantPng(16))` returns 16×16 with pixel (0,0) red, (15,0) green, (0,15) blue, (15,15) yellow — test in `tests/OrientationHarness.test.ts`.
- [ ] DW-1.2: the decoder round-trips an RGB (colour type 2) image built in the test with every filter type 0–4 on at least one row (the test encodes rows with each filter by hand) and rejects interlaced and 16-bit headers with a named error.
- [ ] DW-1.3: `classifyTile` returns each of `identity`, `flipV`, `flipH`, `rot180`, `missing`, `unknown` for hand-built sample sets; `hueOf` is unchanged by scaling a colour by 0.3 (lighting-proof) and by sRGB→linear conversion of pure channels.
- [ ] DW-1.4: `quadrantSamplePoints` for every tile lies inside its `tileCrop` and every crop inside 800×600; no two crops overlap (test iterates `TILES`).
- [ ] DW-1.5: `makeQuadGlb` output parses as GLB 2.0 (magic, version, JSON chunk with `doubleSided: true`, TEXCOORD_0 values exactly as the layout lists) — test reads the JSON chunk back.
- [ ] DW-1.6: `npm run typecheck` and `npm test` green.

### Phase 2: The KTX2 fixture
**Skills:** code-foundations:cc-defensive-programming
**Model:** sonnet
**Gate:** Standard
**Depends on:** 1
**File scope:** scripts/orientation-check/make-ktx2.mjs, scripts/orientation-check/fixtures/quadrant.ktx2, scripts/orientation-check/fixtures/README.md

**Goal:** a committed UASTC KTX2 of the quadrant picture, with the command that made it (D-6).

**Scope:**
- IN: `make-ktx2.mjs` — installs `ktx2-encoder@0.6.0` into `os.tmpdir()` with
  `npm install --prefix <tmp> --no-save` (never touches the engine's `package.json`/lockfile),
  launches Chromium via `launchBrowser`, encodes `makeQuadrantPng(16)` to UASTC (no supercompression
  or Zstd — whichever the encoder supports; record which), writes `fixtures/quadrant.ktx2`, prints its
  SHA-256. `fixtures/README.md`: what the file is, the exact command, encoder version, settings, hash.
- OUT: changing the player-smoke `test.ktx2`.

**Edge cases:** the encoder wants a URL for its WASM — serve it from the temp dir through a
`page.route`; the encoder's output flips rows itself (check its options and record that none is
applied — the fixture must store row 0 = top, like the PNG).

**Done when:**
- [ ] DW-2.1: `fixtures/quadrant.ktx2` exists, header `vkFormat` and supercompression scheme recorded in `fixtures/README.md`, 16×16, 1 level, and a vitest case in `tests/OrientationHarness.test.ts` asserts the header fields and the file's SHA-256 equals the README's.
- [ ] DW-2.2: a second run of `node scripts/orientation-check/make-ktx2.mjs` reproduces the same hash, or `fixtures/README.md` states why the encoder is not deterministic (then the test pins the header only).
- [ ] DW-2.3: `git diff origin/master -- package.json package-lock.json` is empty after this phase.
- [ ] DW-2.4: if the encoder cannot produce the file in ½ day: stop, write the question with the attempts into `OWNER-DECISIONS.md` on the task branch, park (ATTENTION). No hand-written KTX2.

### Phase 3: Page, server, runner, first reading
**Skills:** code-foundations:cc-defensive-programming, code-foundations:aposd-verifying-correctness
**Model:** sonnet
**Gate:** Full
**Depends on:** 1, 2
**File scope:** scripts/orientation-check/page.html, scripts/orientation-check/scene.js, scripts/orientation-check/server.mjs, scripts/orientation-check/run.mjs, scripts/orientation-check/expected.json, scripts/orientation-check/reference/sphere-png.png, scripts/orientation-check/reference/cylinder-png.png, scripts/orientation-check/reference/capsule-png.png, scripts/orientation-check/reference/torus-png.png, scripts/orientation-check/README.md, package.json, tests/OrientationHarness.test.ts

**Goal:** `npm run orientation-check` renders the grid, reads it, and compares it with the pins.

**Scope:**
- IN: `server.mjs` — `node:http` on an ephemeral port serving `page.html`, `scene.js`,
  `layout.mjs`, `dist/WebEngineTS.standalone.js` (as `/engine.js`), the Basis transcoder directory
  (`node_modules/three/examples/jsm/libs/basis`, as player-smoke's `run.mjs:33` uses), and the
  fixtures (`/assets/quadrant.png`, `/assets/quadrant.ktx2`, `/assets/quad.glb`, generated from
  Phase 1/2 at start-up). `page.html` — a 800×600 canvas, an import map `WebEngineTS → /engine.js`,
  `scene.js`. `scene.js` — builds the layout with the public API only (`Application`, `GameObject`,
  `Camera`, `Mesh`, `Material`, `Shader.Unlit`, `Resources`/`Texture2D`, `SpriteRenderer`, `Sprite`,
  `Canvas`, `UIImage`; load the assets through `Texture2D.fromArrayBuffer`/`fromKTX2ArrayBuffer` and
  the engine's glTF path exactly as content does — record which call in `notes.md`), sets the
  transcoder path, waits for every load, then three rendered frames, then
  `window.__orient = { ready: true, engine: BuildInfo.version, errors: [] }` (any load error goes
  into `errors`, never thrown away). `run.mjs` — requires `dist/`, starts the server, launches
  Chromium (`launchBrowser`), viewport 800×600 / DSF 1, waits for `__orient.ready` (30 s timeout →
  exit 2 with the page console), screenshots the canvas element, decodes, classifies every
  `classify` tile, compares every `reference` tile, prints a table (tile, reading, expected, ok),
  exits 1 on any mismatch or non-empty `errors`. Flags: `--update` (write `expected.json` + reference
  PNG crops — encode with a tiny PNG writer in `quadrant.mjs` or reuse `makePng`'s chunk code),
  `--json <file>`, `--probe-flip <tile>` (the page toggles `flipVertically` on that tile's texture —
  for DW-3.4 only). `package.json`: `"orientation-check": "node scripts/orientation-check/run.mjs"`.
  `README.md`: what the harness answers, how to run, how N6 updates the pins (`--update` in the
  same commit as the engine change, the `expected.json` diff is the review), the predictions table
  and today's reading side by side.
- OUT: Firefox/WebKit; CI wiring; any `src/` change.

**Predictions for today's engine** (from research F-1/F-3; check, do not force): `quad-png`,
`plane-png`, `cube-png`, `sprite-png`, `ui-png`, `gltf-embedded`, `gltf-ktx2` → `identity`;
`quad-ktx2`, `gltf-png` → `flipV`. A reading that differs is a finding: keep the reading in
`expected.json` (it is what the engine does), describe it with its crop in `notes.md`, and add a
`⬜` follow-up row in the Report if it is a defect beyond G4.

**Edge cases:** the transcoder fails to load (→ `errors`, exit 1 — not a `missing` reading);
`dist/` older than `src/` (warn with both mtimes); the screenshot's DSF ≠ 1 (assert the decoded size
is 800×600); a tile reading `missing` because of back-face culling (record — that is information
about winding, D-7).

**Done when:**
- [ ] DW-3.1: `npm run build && npm run orientation-check` exits 0 and prints 13 rows; the output is pasted in `notes.md`.
- [ ] DW-3.2: run it twice more: identical readings, every reference crop `ok` (paste both outputs' summary lines).
- [ ] DW-3.3: `notes.md` has the predictions-vs-reading table; each difference has its crop (saved under the task's `.claude-shared/code-foundations/N6a/` as PNG) and a sentence of cause, or "cause unknown" — not a guess.
- [ ] DW-3.4: `npm run orientation-check -- --probe-flip quad-png` exits 1 and names `quad-png` (expected `identity`, got `flipV` — or whatever the flip turns the pinned reading into); a vitest case drives `run.mjs`'s pure comparison function (exported, in `classify.mjs` if needed) with that result, so `npm test` covers the failure path without a browser.
- [ ] DW-3.5: a deliberately broken asset URL (temporary local edit, reverted) makes the run exit 1 with the load error printed — described in `notes.md`.
- [ ] DW-3.6: `npm run typecheck`, `npm test`, `npm run build` green; `git diff --stat origin/master` touches only the files of this plan's scopes.

### Phase 4: Notes and roadmap (Minimal)
**Model:** sonnet
**Gate:** Minimal
**Depends on:** 3
**File scope:** .claude-shared: code-foundations/N6a/notes.md, ROADMAP.md (row N6a only), CHANGELOG.md (WebEngineTS section, one entry)

**Done when:**
- [ ] DW-4.1: ROADMAP N6a → `✅ <date> W<n>` with the reading summary (how many tiles `identity`, which are not); N6's row text unchanged (Claude plans N6 next).
- [ ] DW-4.2: CHANGELOG entry names the command and the pin files.

---
## Deviation rules
- A tile that cannot be built with the public API as specified (e.g. `UIImage` needs a different
  setup): build it the way the engine's own tests do, record the deviation in `notes.md`.
- The reading is never tuned to match a prediction. No `src/` edits; an engine bug found here is a
  `⬜` row, not a fix in this task.
