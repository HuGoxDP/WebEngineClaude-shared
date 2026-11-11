# Research: N6a — texture-orientation harness (stage 0 of the UV-convention plan)
**Date:** 2026-11-11 (Claude, architect lane)
**Base:** WebEngineTS `master` `2569fc4`
**Feeds:** `N6` (UV convention C3 / gap G4), which may not start before this lands.

## Why this task exists

`N6` was marked "after a visual harness", and both its card (`tasks/E-growth.md`) and
`ENGINE-GAPS.md` G4 point at `WebEngineTS/design/coordinate-check/` and
`design/unity-coordinates-plan.md`. **Neither exists any more**: the owner deleted both (with 17
other design files) in `a3fe342` (2026-10-23, "Remove unused and outdated documentation"). The
convention used since A5 applies: do not restore them; read them from history —
`git show a3fe342^:design/unity-coordinates-plan.md`, `git show a3fe342^:design/coordinate-check/README.md`.

The deleted harness was also the wrong shape for N6: it was a **by-eye** page for F7 (the
handedness mirror, fixed 2026-09-03 and pinned numerically in `tests/CoordinateSpaces.test.ts:390`),
with untextured primitives. N6 needs the opposite: **textured** cases, read **by machine**, so a
worker can run it before and after the change without the owner looking at a screen.

## Facts (with evidence)

- F-1 Three loaders, two conventions (deleted plan §2, still true on `2569fc4`):
  `Texture2D.fromArrayBuffer` (`src/engine/core/graphics/Texture2D.ts:727`) and canvas textures
  (`:297`, `:752`) keep Three's `flipY = true`; glTF textures `false`; `fromKTX2ArrayBuffer` (`:237`)
  `false`, forced by `CompressedTexture`. The table in `Texture2D.ts:91` documents it.
- F-2 `Texture.flipVertically` (`src/engine/core/graphics/Texture.ts:243-251`) is the public
  switch (it writes `flipY` and `needsUpdate`). Its doc comment still cites the deleted plan
  (`Texture.ts:240`) — harmless, but N6 should repoint it.
- F-3 Observed consequences (ENGINE-GAPS G4; ScenarioCreator `docs/ENGINE-GAPS.md` §6): a
  separately-loaded PNG on a glTF mesh samples upside down (Benchscene2: max channel Δ 173); the
  same map as `.ktx2` samples right.
- F-4 Seven primitive builders in `src/engine/core/graphics/Mesh.ts`: `createCube` :696,
  `createSphere` :762, `createPlane` :833 (XZ, +Y, Unity's), `createCylinder` :902,
  `createCapsule` :1018, `createTorus` :1161, `createQuad` :1239. The deleted plan's stage 2 changes
  every one of them by one shared `v → 1 − v`; flat faces can be classified, curved ones only
  compared against a reference picture.
- F-5 `SpriteRenderer` expresses flips as negative texture repeat
  (`src/engine/core/components/SpriteRenderer.ts:423-435`); `UIImage.sprite` accepts a `Sprite` or a
  `Texture2D` (`src/engine/core/ui/UIImage.ts:135`). Both are separate orientation paths the
  plan said to audit "not assume".
- F-6 Headless rendering already works: `scripts/player-smoke/` launches Chromium with SwiftShader
  (`browsers.mjs:6-11`), borrows Playwright from virtual-lab's `e2e/`
  (`locate-playwright.mjs:24-58`), and generates PNG/GLB fixtures in code (`fixtures.mjs:104`
  `makePng`, `:132` `makeGlb`). The run is `npm run build` then `node scripts/player-smoke/run.mjs`;
  it is not in `npm test` and not in CI (no workflow mentions Playwright).
- F-7 The existing `scripts/player-smoke/fixtures/test.ktx2` is 16×16, `vkFormat 0`,
  supercompression 2 (UASTC + Zstd), origin unrecorded — its picture is unknown, so it cannot serve
  as an orientation probe.
- F-8 No KTX2 encoder is on this machine (`toktx`, `basisu`, `ktx` absent from `PATH`).
  `ktx2-encoder@0.6.0` (npm, "KTX2 encoder for browser applications", Basis Universal compiled to
  WASM) exists and can run inside the Chromium the harness already launches.
- F-9 Engine camera API: `Camera.orthographic` / `orthographicSize` setters
  (`src/engine/core/components/Camera.ts:247`, `:281`); `Material.mainTexture`
  (`src/engine/core/graphics/Material.ts:176-180`); `Sprite.fromTexture` (`Sprite.ts:131`).

## Decisions

- **D-1 Machine-read, not by eye.** Every textured case uses one **quadrant texture**: four flat
  quadrants, top-left red, top-right green, bottom-left blue, bottom-right yellow (as stored in the
  file, row 0 = top). The four pure hues survive lighting, sRGB/linear and block compression, and
  one 2×2 reading tells identity / vertical flip / horizontal flip / 180° apart — a checkerboard
  could not (deleted plan §3 stage 0 asked for "non-symmetric"; this is that, made machine-readable).
- **D-2 Sampling positions come from the layout, never from the engine's projection.** An
  orthographic camera at `(0, 0, −10)` looking +Z, `orthographicSize = 5`, viewport 800×600 → 60 px
  per world unit, +X right and +Y up assumed (Unity's screen). The runner computes each tile's four
  quadrant centres itself. If the engine mirrored again (F7), the harness would see it — using
  `worldToScreenPoint` would hide it.
- **D-3 Characterisation first.** The harness pins **today's** readings in
  `scripts/orientation-check/expected.json` and exits 1 on any difference. N6 then changes
  `expected.json` in the same commit as the engine change, so the diff of that one file *is* the
  behaviour change a reviewer reads. The plan's predictions (plan, Phase 3) are checked against the
  first reading; a prediction that turns out wrong is recorded as a finding, never "fixed" here.
- **D-4 Curved primitives get a reference picture, not a classification.** Sphere, cylinder,
  capsule, torus: the tile crop is saved as `scripts/orientation-check/reference/<id>.png` and
  compared with a tolerance (per channel |Δ| ≤ 3 on ≥ 99.5 % of pixels — SwiftShader is
  deterministic on one machine, the tolerance absorbs another CPU). N6 stage 2 must keep the four
  pictures (deleted plan: "every primitive must be pixel-identical to its reference") and the
  classification of the flat cases tells whether the textures followed.
- **D-5 Own page and server, shared launch code.** A plain page that imports
  `dist/WebEngineTS.standalone.js` (no sandbox, no ZIP: the player's isolation is not under test)
  served by a ~40-line `node:http` server of the harness's own; `loadPlaywright` and `launchBrowser`
  imported from `scripts/player-smoke/`. Chromium only (SwiftShader); Firefox/WebKit are not needed
  to read a UV convention.
- **D-6 KTX2 fixture generated once, committed with its generator.** `make-ktx2.mjs` builds the
  quadrant PNG, encodes it to UASTC (no Zstd needed) with `ktx2-encoder@0.6.0` inside the launched
  Chromium (installed to a temp dir with `npm install --prefix`, never a dependency of the engine
  package), and writes `fixtures/quadrant.ktx2`. The fixture is committed; the generator is re-run
  only to change it. If the encoder cannot run in ½ day of trying, this is a question (park,
  ATTENTION), not a hand-written KTX2.
- **D-7 glTF cases are a 2-triangle quad with glTF's UV origin** (top-left vertex uv (0,0)),
  `doubleSided: true` so a handedness surprise in the importer shows as a reading (flipH or
  missing) instead of a culled tile. Three glTF tiles: embedded PNG; the same mesh with its
  material's map replaced by a separately-loaded PNG (the G4 case); the same mesh with a
  separately-loaded KTX2.
- **D-8 A tiny PNG decoder in the harness** (8-bit RGB/RGBA, non-interlaced, filters 0–4, via
  `node:zlib`) reads Playwright's screenshot; no new dependency. Unit-tested against `makePng`
  output and a screenshot-shaped RGB PNG.
- **D-9 Not in `npm test`, not in CI** (same as player-smoke: it needs `dist/` and a browser).
  Pure parts — decoder, classifier, layout maths, fixture generators — are vitest-tested and so are
  in `npm test`. `npm run orientation-check` is the command N6 runs.
- **D-10 Docs.** The stale pointers to the deleted files in `.claude-shared` were repointed to
  history by Claude in this pass; the engine's own `Texture.ts:240` pointer is N6's to change (it
  rewrites that comment anyway). The harness's README replaces the deleted page as N6's reference.

## Open for N6, not here

`Texture.uvOrigin`, the orientation tally in `MemoryReport`, the shared `v → 1 − v`, the loader
switch to `flipY = false`, removing content workarounds, the CLAUDE.md entry — deleted plan §3
stages 1–4. N6 is still 🧠: Claude writes its plan after this harness has produced its first
reading.
