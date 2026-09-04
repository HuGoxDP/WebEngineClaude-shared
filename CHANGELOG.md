# Shared changelog — all repositories

**One changelog for the whole ecosystem**, a section per project, newest first. Add entries here
rather than starting a per-repo changelog.

One exception, deliberate: `WebEngineTS/CHANGELOG.md` stays, because `package.json` lists it in
`files` — it ships inside the npm tarball, so consumers installing the engine read it there. It is
the engine's *release notes*; this file is the *cross-project* record and is authoritative for
everything else.

Dates are commit dates. Anything that changes rendered output or a measured number is marked
**⚠ measurable** — a benchmark result is only comparable against another taken on the same build.

---

## WebEngineTS — the engine

### 2026-09-04
- **⚠ measurable — the renderer now matches Unity's handedness (F7).** The engine's left-handed
  world reached Three's right-handed one through a single `rotateY(π)`; a rotation cannot mirror,
  so every frame was a horizontal flip. Fixed with a reflection in `Scene._contentRoot`, cameras
  cancelling it so their view matrix stays proper. Three flips triangle winding per object from
  `matrixWorld.determinant() < 0`, so no geometry, index order or normal changed. **This changes
  the picture in every scenario** — content that compensated by hand now reads mirrored.
- `Transform.lookAt` aims **forward** at the target. It delegated to `Object3D.lookAt`, which aims
  −Z, so `forward` pointed away from whatever was looked at; the old camera compensation hid it.
  Also implements the `worldUp` parameter, which was a standing TODO.
- **⚠ measurable —** spatial audio pans into Web Audio's right-handed space. A source on engine +X
  panned into the *left* ear; that agreed with the picture only while the render was mirrored too.
- `design/coordinate-check/` covers `LineRenderer` and world-space UI as well as meshes.
- Ecosystem roadmap written, then superseded by this directory's `PLAN.md`.

### 2026-09-03
- `Camera.viewport` (`Rect`) is honoured — in rendering (`setViewport`/`setScissor`), in
  `pixelWidth`/`pixelHeight`/aspect, and in the screen conversions. Viewport coordinates stay
  frustum-relative, so they remain rect-independent.
- World-space `Canvas` projects through a rect-aware `_worldToSurfacePoint` (renamed from
  `_worldToViewportPoint`, which meant a different space from the new public method of that name).
- **⚠ measurable —** `worldToScreenPoint().z` is a world-unit distance, not negated NDC depth.
  Screen conversions size from new `Camera.pixelWidth`/`pixelHeight`, fed by `Application`, instead
  of `window` — so an embedded canvas converts correctly.
- Added `worldToViewportPoint`, `viewportToWorldPoint`, `screenToViewportPoint`,
  `viewportToScreenPoint`, `viewportPointToRay`, `cameraToWorldMatrix`; screen↔world and
  `screenPointToRay` are now correct for **orthographic** cameras.
- `Transform`: `transformVector`/`inverseTransformVector`, `localToWorldMatrix`/
  `worldToLocalMatrix`, `rotateAround`, `forward`/`up`/`right` setters, and a `Space` parameter on
  `translate`/`rotate`. Fixed a latent staleness bug where `transformPoint` read an un-updated
  world matrix.
- Diagnostics degradation on a non-WebGL backend is pinned (P2.8 stage 0); the WebGL-only counters
  reach around the `RenderBackend` seam and nothing had exercised their absence.
- Thesis/paper scaffolding removed.

### Earlier
See `WebEngineTS/CHANGELOG.md` for `[0.1.0]` and the running `[Unreleased]` section.

---

## testv/virtual-lab — the platform

### 2026-08-30
- Upstream Q&A updated with the engine's answers.

### 2026-08-13 / 14
- Content Security Policy, measured rather than guessed.
- Archive garbage collection — archives nothing refers to are collected.
- The Google Drive delivery path deleted entirely.
- Playwright e2e for the browser-only surface.
- Engine build identity surfaced at runtime.
- Catalog republished against the rebuilt scenarios.
- CI: the nginx check was never checking nginx — fixed.
- Deployed state recorded and verified.

---

## ScenarioCreator — content and packaging

### 2026-08-30
- Engine-gap entry corrected: flipped orientation on a de-embedded albedo map.

### 2026-08-20 → 24
- Benchscene2: the embedded data maps were lossy WebP; only the colour map is moved out of the GLB.
- Two textures were not the format their names claimed.
- Benchscene1 ships as a four-archive count sweep with the workload recorded.
- Engine gaps recorded: `Resources` tagged every texture sRGB; four `Mesh` primitives wound inside
  out; the KTX2 skybox taken up.

---

## WebEngineTSEditor — the editor

### 2026-08-11
- A plan written where there was none: get it running first, then decide what it is for. `app/` has
  still never been installed; see `PLAN.md` §3.

### 2026-07-22
- Repository initialised, extracted from `WebEngineTS/editor/`.

---

## WebEngineTS-Benchmarks

### 2026-08-30
- Completed resubmission plan and result documents removed.

### 2026-08-21 → 28
- Scene 1 matrix gained the W=3 write-rate pair; test scenarios added.
- The 24 August run recorded — 172 runs on Intel UHD — with one traceable summary.
- Documented that the Scene 2 cap reaches one map of three, and why that is fixable.
