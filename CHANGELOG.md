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

### 2026-09-09
- **A saved scene was dropping six components whole.** `AudioSource`, `AudioListener`,
  `ParticleSystem`, `InstancedMeshRenderer`, `Animation` and `Animator` carried no
  serialization metadata, so a round trip lost not their settings but the components
  themselves. Closes §6.6 of the UI roadmap, the one item another repo was waiting on.
  Runtime state (`isPlaying`, `time`, `particleCount`) is deliberately not stored, and four
  ParticleSystem fields are left out because `ValueSerializer` has no representation for
  `ParticleBurst`, `AnimationCurve` or `Gradient` — both pinned by tests so adding one later
  is deliberate.
- **`ValueSerializer` gained `Curve`, `Gradient` and `Bursts`.** It could describe a Vector3
  and a Sprite but had no representation for `AnimationCurve`, `Gradient` or `ParticleBurst`,
  which is what kept a particle system's curve modules out of a saved scene. Stored by value,
  keyframes keeping their tangents and weights so a restored curve *evaluates* the same rather
  than merely carrying the same numbers.
- **Three.js isolation sweep.** Two real violations of the engine's headline rule:
  `ParticleSystem.particleTexture` was a raw `THREE.Texture` (now `Texture2D`), and
  `Mesh.fromThreeGeometry` was public and untagged (now `_fromThreeGeometry`).
  `AnimationClip`'s constructor takes a Three type and cannot be renamed, so it is tagged
  `@internal`. Verified against the built `.d.ts` rather than the source, since that is what
  a consumer sees.
- `design/canvas-ui-roadmap.md` was describing finished work as upcoming — five section
  headings still read P1 while the task table had them done, and §8 listed six steps of
  "next" work completed in August. Corrected. **Assume any plan in `design/` has drifted
  before working from it.**

### 2026-09-05
- **⚠ measurable — every textured sphere was wrapped backwards.** `Mesh.createSphere`
  carried `THREE.SphereGeometry`'s parameterisation, written for a right-handed frame, into this
  engine's left-handed one. A sphere is the same sphere either way, so it showed only on mapped
  content: the solar system's Earth rendered with India west of Africa and Madagascar off the wrong
  coast. Reported as the planets looking upside down — north was always up, east and west were
  swapped. Winding reversed to match; `tests/PrimitiveWinding.test.ts` still passes and
  `tests/SphereUvOrientation.test.ts` pins the mapping.
- **⚠ measurable — imported glTF models were their own mirror image, and lost their hierarchy.**
  glTF 2.0 is right-handed with −Z forward and this engine is left-handed with +Z forward;
  `_convertGLTFScene` copied node transforms across verbatim. The flip is now carried by one node
  below the returned root — not baked into geometry, which would convert the model out from under
  the animation clips that drive it, and not on the root, which `normalizeToSize` overwrites.
  Separately, each child was attached with the default `worldPositionStays`, which divides out the
  parent it has just been given: every node past the first collapsed onto its own local offset.
- **⚠ measurable — `Transform`'s point conversions answered in Three's mirrored world space.**
  `transformPoint`, `inverseTransformPoint`, the vector and direction pairs and both matrices read
  the backing `Object3D` directly, which sits below the scene's handedness mirror, while
  `position` and `rotation` answer in engine space. An object at `(1, 2, 5)` converted its own
  origin to z = −5, and `inverseTransformPoint(position)` returned `(0, 0, −10)` instead of the
  origin. All six now go through `_engineWorldMatrix`. The existing tests could not catch it —
  every case used z = 0, a round trip, or read only `.x` — so seven were added that compare each
  conversion against `position` on Z.
- **⚠ measurable — a `LineRenderer` ribbon kept the facing it was built with.** Width is
  geometry, so the ribbon is turned toward the camera once in `updateLine`, and nothing marked a
  line dirty when the camera or its parent moved: lines went edge-on and rendered as hairlines.
  Crystals showed it as unit-cell edges fading one by one as the lattice turned. Now re-faced from
  the per-frame driver whenever the camera's world position or the line's world matrix moves, with
  the geometry buffers reused so an orbiting camera does not allocate.
- **`LineRenderer.useWorldSpace` is honoured**, having been stored, serialized and never read — so
  its declared default of `true`, Unity's, described the opposite of what happened. World-space
  points are pulled through the inverse of the object's *engine* world matrix. No scenario changes
  shape: all eleven lines across the ten scenarios set the property explicitly, and the three
  asking for world space sit on transforms that never leave the origin.
- `Transform._ensureWorldMatrix` and `_engineWorldMatrix` are open to the engine (`@internal`), so
  a component can read a current world matrix without allocating a `Vector3` for the side effect.
- `scripts/shoot.mjs` gained `--do`: click, move, drag, key and wheel steps before the shot. A
  panel that only appears once something is clicked cannot be checked from a still frame of an
  untouched page, and a planet's texture cannot be read at a hundred pixels across.
- **⚠ measurable — nothing consumed `LineRenderer`'s dirty flag.** Every setter marks the line
  dirty and the class has a `_systemLateUpdate` that rebuilds — but `GameObject._systemLateUpdate`
  only visits `ScriptableBehaviour`s, and a LineRenderer is a `Renderer`, so it was never called.
  Ten setters were silently dropped; geometry only worked because `setPosition` rebuilds directly,
  so a line drawn orange rendered **white**. Now driven from `Application._loop` through a
  registry, like `LODGroup`.
- `scripts/shoot.mjs` — loads a page in the local Edge via Playwright, records the console and
  saves a screenshot. The defects that cost most here are invisible to unit tests and only appear
  in a rendered frame; this one was found and verified that way.
- **⚠ measurable — world bounds were read against a stale ancestor chain.** Three's
  `updateMatrixWorld` reads `parent.matrixWorld` without refreshing it, so `Renderer.bounds`
  reported an object **at the origin** however it was placed, before the first render. Predates the
  handedness work by a long way. `Transform._computeHierarchyBounds` had the same fault *plus*
  returned a mirrored Z. Both now use `updateWorldMatrix(true, …)`, which walks up first;
  `setParent`'s flush too. Three regression tests.
- **`"types"` now comes first in `package.json` exports.** It sat last, and conditions resolve in
  order — `"import"` matched first, so `"types"` was never reached and every TypeScript consumer
  silently lost engine types through the exports map. Surfaced only when the editor became the
  first consumer to resolve the package directly.
- `release:local` packs the tarball for **WebEngineTSEditor** as well; it used to hand over the
  engine *directory*, which loaded two THREE.js instances.
- Handedness fix verified against all ten scenarios by static analysis: **DNA** was rendering a
  left-handed helix (Z-form, not B-form), **solar-system** was retrograde, and **Optics** drew the
  object on the wrong side of its own documented sign convention. All three correct now, and no
  scenario had compensated by hand, so nothing needed editing.

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

### 2026-10-07
- **The scenario editor is served at `/editor/`**, through `docker-compose.editor.yml`. An override
  rather than a service in the base file, because the editor is built from another repository and
  the platform must keep building without it; `nginx.conf` gains only an include of
  `server.d/*.conf`, which matches nothing when the override is not applied. `/editor/` has its
  own CSP file, so nothing an authoring tool needs is granted to student pages. The upstream is
  resolved per request — with a literal name nginx kept the address from boot and hung once the
  editor container alone was rebuilt.

### 2026-09-05
- **G2 diagnosed upstream, and it is not an engine leak.** The streamed path eagerly decodes every
  non-`Lazy` manifest asset by design where the ZIP path is lazy, and the solar-system content ships
  a `.glb` *and* a redundant loose albedo for all six planets. Prediction to confirm here:
  `liveTextures` differs while `textures` matches. The fix belongs to ScenarioCreator.

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

### 2026-09-05
- **Kepler now draws the reference diagram** it was asked to look like: a starfield, the real Sun
  and Earth maps from `solar-system-scenario`, `r1` from the star to the body in yellow, `r2` on to
  the empty focus in violet, one semi-major axis in red labelled `a`, dots on the centre and the
  empty focus, and the `r1 + r2 = 2a` legend. Two causes behind "everything is too big": the star
  was drawn at **twice its own radius** — `Mesh.createSphere(1, …)` has radius 1, so the scale is
  the radius, and it was set to `BODY_RADIUS * 2` — and every stroke was two to three times the
  reference's. The sky is a camera-locked quad rather than `RenderSettings.skybox`, because three.js
  draws a scene background as a unit box through the camera's projection and this scenario's camera
  is orthographic: measured, that is a 360px square in the middle of a 1600px view. ZIP 21 KB → 2.3 MB.
- **A scenario's `update` runs while its async `awake` is still awaiting.** Loading Kepler's textures
  turned that into a real window and `_draw` reached an orbit that did not exist yet, once a frame.
  Worth knowing for any scenario that awaits in `awake`: guard with a ready flag.
- **Kepler opened on a circle, the one shape that cannot show Kepler's first law**, with the star
  at its centre and apsis crosses at what were genuinely arbitrary points. It now draws the
  ellipse's construction — both axes, the centre they cross at, and the radius vector from star to
  body — and launches at 0.8 of circular speed, an ellipse of e = 0.36. The apsides and the empty
  focus are drawn only above e = 0.01.
- **AtomStructure's electrons did not travel the orbits drawn for them.** Two faults: the electron
  circled in its shell's local *XY* plane on the word of a comment, where the engine builds a torus
  in *XZ* — only `THREE.TorusGeometry` uses XY; and the shell rings lost their tilt entirely,
  because `transform.parent =` preserves a child's world pose and the shell is tilted before its
  children exist. The electrons escaped the second because `ElectronOrbit` rewrites `localPosition`
  every frame. Result was three coplanar rings with eight electrons orbiting outside them.
- **Mechanics drew its force vectors a metre and a half beside the block.** Same parenting trap:
  the bench is shifted off the origin before the arrows are made. The blocks survived it only
  because `place` overwrites their local position. Every parenting call in `Ramp.ts` now passes
  `worldPositionStays = false`.
- **Kepler's third-law plot was drawn across the readout panel**, its own panel holding nothing but
  a title, because its parts anchored to the top-left of the screen while the panel is anchored
  bottom-left. Found while fixing it: the orange marker for the student's own body was off-screen
  entirely — `update` negated Y where the constructor did not — so the one thing the panel exists
  to show was never visible.
- **Circuits spaced its charge carriers by wire length, not by current.** The gap was
  `length / floor(length / spacing)`, so wires carrying identical current spaced them differently
  (200 px and 239 px in the same series loop) and a whole-number count re-spaced every carrier at
  once whenever it ticked over. Carriers now sit at whole multiples of the spacing, with the phase
  carried across wire boundaries rather than each wire recirculating its own set.
- **Every slider drew its label over its value** — identical code in all eight UIKit copies, both
  placed at the same origin. Reported in Kepler, where "Швидкість, часток кругової" collided with
  its reading. Now two columns, placed with the anchor's sign in mind.
- **An empty readout panel still painted its background** in Molecules, AtomStructure and DNA. The
  text and the panel were only ever set together by convention, across twelve write sites; they now
  go through one setter that owns both.
- **Optics, Circuits and Kepler rendered no 3D content at all**, and had not for some time. Each
  places a fixed orthographic camera through its own copy of `FlatCamera.ts` at `(0, 0, 20)` with
  no rotation, its header claiming it looks "straight down −Z" — Three's convention, not this
  engine's `+Z` forward. The camera faced away from the plane it was meant to show, so each drew
  its UI over an empty scene while the physics panels stayed correct. Moved to `(0, 0, −20)`.
  Verified by screenshot; **not** caused by the engine's handedness fix, confirmed by rebuilding
  the engine at the commit before it.

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

### 2026-10-09
- **What the editor is for is decided** (it was P1, the item that needed a human): teachers author
  scenarios on the site, a project is a folder on their own computer, scripts are both written in
  the editor and taken from a library, and it looks and works like the Unity editor. The plan
  against Unity, window by window, is `docs/unity-editor-plan.md`.
- **Start screen and recent projects.** Without a project there is no workspace and no WebGL
  context. Nothing opens by itself after a reload — the browser wants a click before it grants a
  folder again — so recent projects are listed and access is requested from the click.
- **New-project wizard**, three steps; the address is transliterated from the title (a Ukrainian
  title used to produce the id `scenario`); cancelling writes nothing. The first scene is built
  through the engine and serialized rather than kept as a JSON file.
- **A project it creates builds in ScenarioCreator and runs in the engine**, from the ZIP and from
  the streaming manifest alike — `npm run e2e:build` checks it and removes what it wrote.
- **Honest saving.** "Unsaved" follows a revision counter instead of `canUndo`; Save / Don't save /
  Cancel on closing; a recovery copy in `.editor/` offered back after a crash; the browser asks
  before the tab closes; one tab per project; the scene file is re-read on focus.
- **Defects that predate all of this, found by the new checks:** Delete did not delete, and every
  undo left a ghost of the old scene — `destroy()` defers to the end of the engine's frame and the
  editor runs no engine loop, so it now uses `destroyImmediate()`. A gizmo drag was not in the
  history, did not show in the inspector, and clicking a handle deselected the object.
- **`for await` over a directory handle lost the error in the production build** — a deleted
  folder surfaced as `undefined` — and behaved correctly under `ng serve`. The e2e is run against
  the built bundle for that reason.

### 2026-10-07
- **It runs in Docker beside the catalog**, at `/editor/` on the platform's port, through an
  override in virtual-lab. Boots without console errors — the check left open since 2026-09-05.
- **The Project panel was mock data; it is the folder on disk now** (File System Access API):
  tree, thumbnails, import by drag, scenes saved into the project.
- **`AppComponent` was 900 lines; it is a frame.** Menus, the Hierarchy menu, the toolbar and the
  keyboard reach one set of commands. Interface text is in typed dictionaries (Ukrainian and
  English, switched live); `alert` / `confirm` / `prompt` are replaced by promise-based dialogs;
  Preferences open from any screen.
- `Ctrl+Shift+N` and `Ctrl+N` belong to Chrome and cannot be intercepted; Create Empty is
  `Alt+Shift+N`.
- An end-to-end check, `npm run e2e`: eleven scenarios against a live URL. There are no unit tests.

### 2026-09-05
- **It builds, and it runs.** First `npm install` + `ng build` since extraction; `ng serve` serves
  the shell and a 666 kB `main.js`. Whether the Angular app boots without runtime errors in a
  browser is still unverified.
- **Was loading two THREE.js instances.** It took the engine as `file:../../WebEngineTS`, a symlink
  to the engine directory, so the bundler resolved the engine's own `node_modules/three` beside the
  app's. Measured as 12 occurrences of `__THREE_DEVTOOLS__` in the bundle against 6 in the engine's
  own — exactly 2×. Nothing crashes; the `instanceof THREE.Mesh` checks the engine relies on just
  stop matching. Now takes the packed tarball, and the bundle is back to 6.
- Fixed a duplicate `GameObject` import that blocked compilation.

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
