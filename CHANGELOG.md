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

### 2026-11-12

- **`v0.3.0` released** — `TypeRegistry.replace` (C3) and `Application.dispose()` resetting `Time` (G5).
  Cut by hand on the owner's request: GitHub Actions were switched off the same day (no billable
  GitHub features), so `release.yml`'s steps ran locally and the release was created through the
  API with all six assets. Consumers still pin `v0.2.0` until A10b.

### 2026-11-10
- **`Prefab.revert` no longer wakes a fresh instance as a scene root (M0.2f).** Reverting a top-level
  instance that sits under a parent rebuilt it with `instantiate()` into the scene — where it woke
  (`awake`, `onEnable`) — and moved it under the holder only afterwards, so under an **inactive**
  holder it woke and was immediately disabled again (`awake`, `onEnable`, `onDisable`) and its
  `awake` had seen the scene root, not the holder. **Changes observable lifecycle order:** the fresh
  tree is now built directly under the holder at the saved index before the wake pass (new
  `SceneSerializer._instantiatePrefabUnderParent`) — under an inactive holder it never wakes and waits
  for activation (like a load and a nested instance since M0.2a), and under an active one its `awake`
  sees the parent. A true scene-root instance reverts exactly as before.
  `tests/PrefabRevertUnderHolder.test.ts`; notes `code-foundations/M0.2f/notes.md`.
- **Guard review (M0.8): the root `hook-guard search` nudge stays.** Measured with the real binary:
  it fires on the Grep tool and on `grep`/`rg` Bash commands inside the engine, answers with the
  graph's hits and the next command inline, and is silent on every other command shape and outside
  the graph's coverage. Advisory only (always exit 0), instant. Verdict: keep, no settings change.
  Notes `code-foundations/M0.8/notes.md`.
- Dev tooling only: no engine source, API, rendered output or measured number changes.

### 2026-11-04
- **The engine has a local code graph (graphify), and workspace-root sessions reach it by default.**
  `WebEngineTS/graphify-out/` holds a code-only AST graph (no LLM extraction), git-ignored and never
  committed; git hooks installed in the engine's main checkout rebuild it after each commit, merge and
  checkout. Recipes (`explain`, `affected`, `query`, `path`, `god-nodes`) are in `WebEngineTS/CLAUDE.md`
  § Knowledge graph (graphify). Sessions launched from the workspace root get `GRAPHIFY_OUT` and a
  `hook-guard search` nudge from the root `.claude/settings.local.json` (uncommitted, the root is no repo),
  plus a short block in `workspace/CLAUDE.md` and the root `CLAUDE.md`. Rebuilds run only inside the
  engine's main checkout, never from the root or a worktree.
- Dev tooling only: no engine source, API, rendered output or measured number changes.

### 2026-10-24 → 27
- **The engine ships a sandboxed player for scenario code, and a host client for it.** A teacher's
  script is arbitrary code; until now it ran in the page, beside the API, the admin token and the
  editor. `dist/player/` (`player.html`, `player.js`, `player.nginx.conf`) is a page that runs a
  scenario in an `<iframe sandbox>` on an opaque origin, served with the CSP, `sandbox` and
  `frame-ancestors` that the shipped snippet carries; `WebEngineTS/player-host` (`PlayerHost`, protocol
  v1, no engine code in it) is what a host page drives it with: origin and version checked before a
  byte is sent, then a private `MessageChannel`; restart is always a fresh frame. The measured CSP and
  tokens, per browser, are in `WebEngineTS/design/player-sandbox.md`; `npm run player-smoke` re-runs
  it on the shipped files in Chromium, Firefox and WebKit. KTX2 transcodes inside the frame. `release:local`
  now finds virtual-lab at the workspace root or under `testv/`, and refuses a tarball without the player.
  Release notes: `WebEngineTS/CHANGELOG.md` (*Unreleased*).
- **`Scenario.engineModuleUrl` replaces the host import map for the player.** Set before a load, it makes
  the pre-linker rewrite a scenario's bare `"WebEngineTS"` import to an absolute URL; unset, the output is
  byte for byte what it was, so ScenarioCreator, the benchmarks and the editor keep their import maps.
  It is also what per-scenario engine pinning needs (an import map cannot be remapped once a document has
  resolved it); pinning itself is not built.
- **`MemoryProfiler.diagnosticsAllowed` latches at `false`.** A scenario could reopen the gate its host had
  closed; now `true` after `false` is ignored with a warning. Policy, not a boundary: only the sandboxed
  player is one. A host that closes the gate and reopens it must set it once instead.
- **Space pauses inside the player** when the frame has focus, so the HUD's pause works whichever side has
  the keyboard.
- Nothing here changes rendered output or, expectedly, a measured number: the new code runs outside the
  frame loop, and was not measured.

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

### Earlier
See `WebEngineTS/CHANGELOG.md` for `[0.1.0]` and the running `[Unreleased]` section.

---

## testv/virtual-lab — the platform
### 2026-11-12
- **Author publish keys and drafts an admin accepts (B6).** Most of the card's surface already
  shipped as "Nocturne release 2"; this task hardened it and finished it. What landed:
  - keys are `vlk_` + 32 random bytes (base64url, 43 chars) and only their SHA-256 is stored;
    the bootstrap comparison hashes both sides to fixed 32-byte digests, so it no longer
    branches on the expected token's length; a start-up warning names an `ADMIN_TOKEN` shorter
    than 32 characters (the value is never printed);
  - `REQUIRE_HTTPS=true` refuses a presented credential with `403 https_required` before
    anything is resolved (nginx maps `X-Forwarded-Proto`, `docker-compose.https.yml` publishes
    8443 and turns it on; everywhere else the switch is off, so today's behaviour is unchanged);
  - `POST /api/keys/:id/rotate` — a new token, same label and role, one transaction that moves
    every `scenarios.owner_key_id` and revokes the old key — and `PUT /api/scenarios/:id/owner`
    for the one thing rotation cannot do: a moderator hands one scenario to another key without
    orphaning it;
  - an approve is bound to the version the moderator reviewed: the admin UI sends
    `currentVersion.id` and a swap under it is a 409 `Архів змінився після перевірки` that
    reloads the card instead of publishing unseen bytes (scripts that omit it keep today's
    behaviour); the journal's era filter keeps a scenario's previous owner out of the new
    owner's history; covers have their own per-key counter (`AUTHOR_PREVIEWS_PER_HOUR`, 30);
  - `/admin` shows who owns each row, counts what a key owns, and rotates a key from the access
    page with a one-time dialog; sign-in is refused outside a secure context.
  - **Security suite**, per the card's review focus: the §7 rights table as one `describe` per
    row (every "Ні" cell asserted with the status and the database untouched), a BOLA sweep that
    enumerates Express's own stack (26 `:id` routes) so a future route cannot forget the owner
    check, the alias fields an author may and may not send, and a `console.*` capture over a
    whole key life cycle that fails if a token or its SHA-256 is written.
  - **Adversarial review** (`.claude-shared/code-foundations/B6/security-review.md`): one medium
    finding — a key revoked while a request was in flight still wrote (a 31 MB upload landed
    71 s after the revocation, because the principal was resolved once at the start of the
    request and write routes re-checked only ownership). Fixed: `auth.requireLiveKey` re-reads
    the key row, locked, as the first statement of every write transaction, and the archive
    route also reads it unlocked before the store commits bytes. Three low findings became
    follow-up rows.
  - Checks, one green run: backend **1658/1658** (fail 0, skipped 0), frontend **770/770**
    plus `ng build` and `check:csp`, e2e `admin-moderation admin-workflow draft-preview` **20
    passed**. Docs: `docs/publish-api.md` is the author contract for the editor's Publish (B7);
    `docs/privacy.md` states the journal's retention as assumed.

### 2026-11-11 (platform, later)
- **The browser e2e runs, with the editor in the stack (M2.1).** The suite that could not run
  without a Playwright browser now runs end to end against `docker compose -f docker-compose.yml
  -f docker-compose.editor.yml`: 91 passed / 2 skipped on the full suite, and 45/1 on the heavy
  specs once the catalog was re-published after a `down -v` (an empty-store detour that reads
  like product breakage — the check that tells them apart is written down). The single failure is
  a hardware-bound budget: the manifest path's first frame takes ~100 s against the spec's 60 s
  on software WebGL (the correctness half passes); that speed is the streaming lane's problem
  (E-G2a / R8). How to run it all lives in `docs/e2e-with-editor.md`.


### 2026-11-11
- **The platform can back itself up, and the restore is proven (P5a).** A `backup` service in the
  stack keeps nightly backups: a logical `pg_dump` (crash-consistent, restorable into a newer
  server) plus read-only copies of the four content volumes (content-addressed, so an append-only
  copy is consistent), each with a manifest, pruned to `BACKUP_KEEP_DAYS`. `backup/restore.mjs`
  restores one backup (dry run by default, `--yes` to run), and
  `docs/backup-restore.md` is the written procedure — **run once on a scratch stack** with its
  output recorded: a seeded row and object survived `down -v` and came back (row count 1, object
  sha256 unchanged, nginx serves the restored bytes). Retention pinned by 8 unit tests; the
  backend suite is 1487/1487 against the test database. Production's off-host target, its
  certificate and a restore there are the owner's (P5b).
- **The stack answers TLS on 443** (self-signed, built by `nginx/make-cert.mjs`, published by
  `docker-compose.https.yml`, HSTS on https answers only) — the local proof for the HTTPS part
  of P5a; production mounts its own certificate at `/etc/nginx/tls/`.
- **Fixed:** a comment continuation in `.env.example` that had lost its `#`, which
  `docker compose`'s env parser rejected; a failed backup no longer leaves a manifest-less
  directory behind; a backup failure during the run is loud and leaves no partial evidence.

### 2026-11-11 (later still)
- **The pre-compressed serving is now proved on the wire (P3b).** The P3 anomaly was a harness
  effect: an in-page fetch sends no `Accept-Encoding` under Playwright, and Playwright's
  request context decompresses transparently. A raw `node:http` request sees the truth, and
  `e2e/tests/compression.spec.ts` pins it: `Content-Encoding: gzip`, at least 2:1 smaller,
  `gunzip` of the compressed body equal to the identity one byte for byte.

### 2026-11-11 (later)
- **The static assets are served pre-compressed (P3).** The frontend image now pre-compresses
  the text assets it ships (`gzip -9 -k`, Dockerfile.frontend) and nginx answers with
  `gzip_static on`. The engine bundle, the biggest immutable file the stack serves, transfers
  473,875 → 393,306 bytes (**−17%**) and the compressed body gunzips to exactly the identity
  one; an identity request is unchanged. Brotli would need the `ngx_brotli` module (not in the
  stock image) and is not shipped — see the notes, and the new **P3b** row for the
  browser-level proof that is still open.


### 2026-10-27 → 28
- **virtual-lab works as an LTI 1.3 tool for Moodle.** The admin registers it with one URL (Dynamic Registration), a teacher
  picks a lab through Deep Linking, a student opens it from the course in a new window without a separate login, presses
  «Здати» (graded) or «Завершити» (non-graded, 100) and the grade lands in the Moodle gradebook; relaunch shows «Роботу здано,
  оцінка X з 100»; an instructor gets a view mode. Own module on `jose` (`backend/lti/`), not `ltijs`; the link targets the
  scenario's latest published version, not a sha256; no Platform Storage; one submission per student per activity, read from
  Moodle AGS; **the platform stores no grades, attempts, names or e-mails** (`virtual-lab/docs/privacy.md`).
  - **Engine contract:** a scenario reports `{ score: 0..1, completed }` with `ScenarioBehaviour.reportResult`, carried by the
    player's `onResult`. Circuits has a task mode (four tasks, `graded: true` in its manifest) as the first graded scenario.
  - **Verified** on a local Moodle 5.0.2 stand over HTTPS (`virtual-lab/lti-demo/`): full walkthrough with screenshots in
    `virtual-lab/docs/lti-demo.md`. Moodle's "Select content" iframe is
    handled: `/lti/pick` is frameable through `LTI_FRAME_ANCESTORS` and the LTI cookies are `Partitioned`, verified in Chromium
    with third-party cookies blocked (`PLAN.md` §2.10). Open: deploy to KSU-online; Safari/Firefox not exercised.

### 2026-10-26 → 27
- **Scenario code no longer runs on the platform's origin.** Every scenario — ZIP and `?stream=1` — runs
  in the engine's sandboxed player (`/player/`, an `<iframe sandbox>` on an opaque origin) driven by
  `PlayerHost`, so a hostile archive can no longer read the page's storage (the admin token), navigate
  `top`, call `/api/admin/*` with the page's credentials, or reach `/editor/`. An e2e builds exactly such an
  archive and shows each of those failing. Closes `PLAN.md` §2.9 (*isolation before keys*); **author keys
  (§2.6) are unblocked from the isolation side** — in production, deploy this first. Plan:
  `.code-foundations/plans/2026-10-24-player-isolation.md`; research: `…/research/2026-10-24-scenario-delivery-and-script-isolation.md`.
  - **Viewer:** keeps the archive as a `Blob`; restart opens a **fresh frame** (no second download for a ZIP)
    and now works for a streamed run too; pause is real — the HUD button and Space with either the host
    or the frame focused; FPS comes from the player. The host always sends `diag: false`, so the profiler
    stays off for any scenario and `?diag=1` shows only the engine build stamp. The page-side profiler guard
    (`viewer-profiler.ts`) is deleted, and with it the loop that re-closed the gate every second.
  - **CSP and nginx:** `/` has no import map and `script-src 'self'` — no `blob:`, no nonce; `frame-src 'self'`
    is the one directive added. `/player/` is served with the engine's own header snippet; the engine bundle, the
    basis transcoder and `/a/` answer `Access-Control-Allow-Origin: *` because the frame's origin is `null`.
    The import map and its nonce `sub_filter` moved into `/editor/` (`editor.conf`, inside `location ^~ /editor/`;
    `csp-editor.conf` untouched), which still shares the platform origin and still runs what the editor runs — the residual
    risk until editor Play moves onto the player.
  - **Engine integration:** the page imports only `WebEngineTS/player-host`; `angular.json` copies
    `dist/player/` to `/player/` and no longer lists `WebEngineTS` under `externalDependencies` (esbuild treats
    it as covering subpaths, which left the `player-host` import unresolvable). `transcoderPath` goes to the
    player.
  - **Tests:** unit 293, backend 348, e2e 104 (hostile archive, KTX2 render through the player, the
    frame-aware helpers, `e2e/editor-csp-harness/` pinning `/editor/`'s nonce); `npm run check:csp` and
    `npm run test:scripts` guard the built `index.html`.
- **`docs/scenario-delivery-migration.md` Stage 3 no longer names MinIO**: its open-source repository was
  archived on 2026-04-25. SeaweedFS, Garage and a hosted S3 are the candidates; the Docker volume served by
  nginx remains the current choice.

### 2026-10-13
- **The platform refuses what its student player would misread** — at upload, in `publish:release`
  and in `import:assets`. The player (engine `0.1.0-local.1789023160893`) checks no scene format
  version, so a version-2 ("link mode") scene would load hollow, silently. Every `*.scene.json` /
  `*.prefab.json` may only declare a `version` the player reads (absent means 1; only 1 today),
  `manifestVersion` must have major 1 and a streaming `schema` must be 1; each refusal names the
  file and what the player reads. Stated once, with when to raise it, in `backend/player-formats.js`.
  `publish:release` now validates before it writes a catalog row, so a refused archive no longer
  leaves a row behind with no archive. All 17 current ScenarioCreator archives and manifests pass.

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

### 2026-11-11
- **ScenarioCreator builds against the released engine, and assets can keep their own guids (A11).**
  The engine dependency moves from the committed tarball to the v0.2.0 release URL, so the lockfile
  pins that exact tarball and every manifest reports `engineVersion: 0.2.0` instead of an
  unfetchable `-local` stamp — the only change in any archive (all ten production file lists
  byte-identical). An asset's guid now comes from its `<file>.meta` sidecar when present and
  32-hex (malformed → a warning and the derived guid; `.meta` files never enter an artifact),
  which unblocks editor stage 9's rename-stable assets; both the ZIP and the streaming manifest
  share the rule from `scenario-meta.mjs`, so they cannot disagree. Scenario scripts compile with
  `--experimentalDecorators` — the engine's serialization API is the legacy decorator kind and the
  builder runs `tsc --ignoreConfig`, so no tsconfig could supply the flag (recorded failure:
  TS1240 without it); no `--emitDecoratorMetadata`, because the engine reads no design: metadata.
  Two fixtures (`TestScenarios/GuidFromMeta`, `TestScenarios/DecoratorScenario`); all four
  verifiers green; production archives and manifests byte-identical otherwise.

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

### 2026-11-10
- **The editor runs the current engine and reads version 2 (A8).** The app takes
  WebEngineTS `0.1.0-local.1794329867` (packed from engine master by hand, editor-only,
  tarball + lockfile committed), and the scene open path no longer asks the literal
  `data.version !== 1`: a file states its version, and one this build cannot read gets its
  own message (`scene.tooNew`, en + uk) naming the file, its version and the versions this
  editor reads — including the editor's own link-mode files, which it previously refused.
  Everything a reader opens (open, autosave recovery, dropped file, folder import,
  reload-from-disk) funnels through `_loadSceneText`, so one change covers all of them;
  a refusal leaves selection, history and the open scene untouched. Writing is unchanged
  (version 1, expand mode). The full pre-existing e2e suite (142 checks) passed unchanged
  on the new engine, and 17 new checks pin the reader paths (`e2e` total 159, all green).

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

### 2026-08-21 → 28
- Scene 1 matrix gained the W=3 write-rate pair; test scenarios added.
- The 24 August run recorded — 172 runs on Intel UHD — with one traceable summary.
- Documented that the Scene 2 cap reaches one map of three, and why that is fixable.
