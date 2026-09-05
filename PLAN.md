# Shared work plan — all repositories

**The single place work is planned.** New tasks go here, under their project, not into a new
per-repo plan file. Replaced the five scattered plans on 2026-09-04:
`WebEngineTS/design/ROADMAP.md`, `ScenarioCreator/docs/PLAN.md`, `WebEngineTSEditor/docs/PLAN.md`,
`testv/virtual-lab/docs/PLAN.md` and `testv/virtual-lab/docs/roadmap.md`. Their completed items are
not carried over — git has them if the reasoning is ever needed again.

**Not loaded into session context automatically** — unlike `ECOSYSTEM.md` and `ENGINE-GAPS.md`,
this file is read on demand. Keep it to *what to do and why*; deep design belongs in the documents
indexed at the bottom.

---

## 0. What decides the order

Measured 2026-09-03, not assumed:

| Repo | Last commit | State |
|---|---|---|
| **WebEngineTS** | 2026-09-05 | 53k LOC, 6 TODOs, 1765 tests. Healthy. |
| **testv/virtual-lab** | 2026-08-30 | **Live — students use it.** Express + `pg` + nginx + Docker, Angular frontend. |
| **ScenarioCreator** | 2026-08-30 | Active, 10 production scenarios. To be retired once the editor can export. |
| **WebEngineTSEditor** | 2026-09-05 | 19 `.ts` files, and **it builds** as of today. Takes the packed tarball like every other consumer. Whether it *runs* usefully is still open. |
| **WebEngineTS-Benchmarks** | 2026-08-30 | Harness + recorded results. Re-measure after any engine change that moves a number. |

**The consequence, revised 2026-09-05:** the work justified by the editor (Canvas UI Stage 1,
Unity-parity Stages 2–4) was parked because the editor did not build. It does now, so those items
are no longer speculative on that ground — but nothing has yet shown the editor *doing* anything, so
sequence them behind editor P1 (decide what it is for) rather than starting them outright. The
consumer with real users is still the platform.

---

## 1. WebEngineTS — the engine

### P0 — Verify the handedness fix against real content — **static analysis done 2026-09-04, visual pass outstanding**

**No scenario compensated for the old mirror by hand.** Searched all ten for mirror/flip/handedness
comments and negative scales: the only "mirror" hits are *optical* mirrors in Optics. So the fix
makes previously-wrong content right, and breaks nothing.

Three scenarios were rendering something factually wrong before, and are now correct — no content
edit needed in any of them:

| Scenario | Handedness-carrying claim | Before the fix |
|---|---|---|
| **DNA** | `nodeAt()` traces `(r·cos a, y, r·sin a)` with `a` and `y` both increasing. In the right-handed triple `(X, Z, Y)` that is `(a cos t, a sin t, b t)`, `b > 0`, torsion `> 0` ⇒ **right-handed**, correct B-DNA | rendered **left-handed** — the Z-form, wrong biology |
| **solar-system** | `Orbiter` steps `x = cos θ`, `z = sin θ` with θ increasing. Viewed from north (right `+X`, up `+Z`) that is **counterclockwise** ⇒ prograde, correct | rendered **clockwise** — retrograde |
| **Optics** | `Rays.ts` documents the standard sign convention: *"d — object distance, POSITIVE to the left of the element"* | drew the object on the **right**, light travelling right-to-left, contradicting its own rule |

Not sensitive, checked and dismissed: **Molecules** (46 species, every one achiral — no stereocentre,
so a mirror image superimposes), **Crystals** (8 structures, all centrosymmetric space groups —
NaCl, CsCl, diamond, graphite, Cu, α-Fe, Mg, Ar; no quartz), **AtomStructure** and **GasTheory**
(spherical / random). **Circuits** is DC only — no magnetic field, so no right-hand rule.
**Mechanics** is an incline under vertical gravity with no cross products. **Kepler** is an abstract
two-body demo where either orbital sense is valid. For those four the mirror changed layout, not
meaning.

**Still to do — the part static analysis cannot answer.** Load each scenario and look, specifically
for: any text drawn as 3D geometry (it would read backwards), sprites and billboards, and shadow
direction. Push the fixed engine to the consumers first with `npm run release:local`.

### P1 — Defects found but not fixed *(~1 day)*
- **`LineRenderer.useWorldSpace` is a no-op.** Stored, never read; vertices are always local. The
  default is `true`, the opposite of what happens, and Unity's `true` means world space. Fixing it
  **changes rendered output** for any LineRenderer under a transformed parent — DNA has one. The
  default is a content decision, not a free choice.
- ~~`Renderer._computeWorldBounds` has no test~~ — **done 2026-09-05, and it was hiding a real
  bug.** Three's `updateMatrixWorld` reads `parent.matrixWorld` without refreshing it, so world
  bounds were computed against a stale ancestor chain — identity before the first render. Bounds
  came back at the origin however the object was placed, and had done since long before the
  handedness work. `Transform._computeHierarchyBounds` had the same fault *plus* returned a
  mirrored Z. Both fixed, three regression tests added.

### P2 — `RenderTexture` *(~2–3 days, after the editor question is settled)*
The one genuinely missing Unity primitive for this domain (`NavMesh`, `Terrain`, `Tilemap` are
irrelevant; `CharacterController` is marginal). Unlocks the editor viewport, picture-in-picture,
minimaps and cheaper post-processing.

### P3 — Adapter generalization, stages 1–4 *(weeks)*
`WebEngineTS/design/render-adapter-plan.md`. Stage 0 landed 2026-09-03. Stage 1 (resource handles)
is the large one and the real prerequisite for WebGPU. **Do not start it in fragments** — each
stage must leave exactly one way to reach the GPU, or the `instanceof THREE.Mesh` checks the engine
relies on start failing for whichever objects took the new path.

### Deferred, with the condition that revives each
| Item | Revives when |
|---|---|
| Canvas UI Stage 1 (`design/canvas-ui-roadmap.md`) | the editor builds and needs the inspector surface |
| Unity parity Stages 2–4 (`design/unity-parity-plan.md`) | same |
| Texture UV convention C3 (`design/unity-coordinates-plan.md`) | someone runs a visual harness for UVs; it changes every texture's orientation |
| WebGPU backend | P3 Stage 1 lands |
| OffscreenCanvas | a measurement shows main-thread render cost matters |

---

## 2. testv/virtual-lab — the platform (server side)

Express + `multer` + `pg`, nginx, Docker Compose, Playwright e2e. Closed: catalog republish, KTX2
file half, build identity, Playwright, archive GC, CSP, the Google Drive removal, the CI nginx
check.

1. **G2 — diagnosed 2026-09-05; the remaining work is content-side, not platform-side.**
   Streamed scenarios eagerly decode every non-`Lazy` manifest asset
   (`Scenario._preloadCriticalAssets`, then `_startDeferredLoading`); the ZIP path is lazy by
   design. The solar-system content ships **redundant assets** — all six planets declare both a
   `.glb` and a loose albedo `.jpg`, plus Earth's normal and emissive — so the streamed path
   decodes both sets and the ZIP path never touches the unused ones. That is why
   `renderer.textures` matches at 19 (GPU uploads) while `estimatedTextureVramBytes` does not
   (every live `Texture` object). **Not an engine leak.**
   - **To confirm:** re-run `e2e/tests/streaming.spec.ts` printing `liveTextures` *and* `textures`.
     Prediction: `liveTextures` differs, `textures` matches.
   - **To fix (ScenarioCreator, §4):** mark the fallback textures `Lazy` in the manifest, or stop
     emitting them for planets that have a model.
   - Only then is the "2.9×" number worth re-reading as a streaming cost.

2. **R8 / Phase 6 — streaming integration.** The path is proven; wiring it end to end is blocked on
   ScenarioCreator emitting manifests, not on the engine.
3. **R2 runtime half — KTX2 transcode is never called at runtime.** The file half is verified.
4. **Catalog rows have no `image_url`** — all ten production scenarios fall back to a placeholder.
   Cheap, cosmetic, seen by every student.
5. **R9 — performance telemetry** *(1–2 days, optional; decide before building)*.

Reference kept in that repo: `docs/implementation-plan.md` (closed history, Phases 0–5),
`docs/test-plan.md`, `docs/manual-browser-checks.md`, `docs/scenario-delivery-migration.md`.

---

## 3. WebEngineTSEditor — the editor

**P0 blocks everything and costs half a day.** It is also the highest information-per-hour action in
the ecosystem: it decides whether several engine plans are real.

1. ~~**P0 — make it run at all**~~ — **done 2026-09-05.** `npm install` succeeded and `ng build`
   now produces a bundle. Two defects had to be fixed to get there:
   - **Engine `package.json` exports were mis-ordered** — `"types"` came *after* `"import"` and
     `"require"`. Conditions resolve in order, so `types` was never reached and **every**
     TypeScript consumer silently lost types through the exports map. Fixed engine-side.
   - **The editor loaded two THREE.js instances.** It took the engine as
     `file:../../WebEngineTS`, a symlink to the engine *directory*, so the bundler resolved the
     engine's own `node_modules/three` alongside the app's. Measured by counting
     `__THREE_DEVTOOLS__` in the output bundle: 12 against the engine bundle's 6, exactly 2×.
     `instanceof THREE.Mesh` checks would have failed silently for objects from the other copy.
     Fixed by packing the tarball for the editor like every other consumer — now 6.
   - One editor-side compile error: a duplicate `GameObject` import.

   **The editor is therefore viable**, which un-gates the plans that were waiting on this answer.
   `ng serve` also verified 2026-09-05: the dev server builds in ~4 s, serves the app shell
   (HTTP 200, title *"WETS · Editor"*) and a 666 kB `main.js`. **What is still unverified is whether
   the Angular app boots without runtime errors in a browser** — that needs eyes on a page, not a
   status code.

2. **P1 — decide what the editor is for** *(~1 day of thinking)*, before adding to it.
3. **P2 — serialization round-trip** *(~2–3 days)*.
4. **P3 — the generated Inspector** *(~1 week)*.
5. **P4 — undo and play mode** *(large)*.

---

## 4. ScenarioCreator — content and packaging

P0–P4 are done (compression, `scenario.json`, real manifest metadata, LOD variants, housekeeping).
Open:

1. **Emit manifests for the streaming path** — blocks virtual-lab item 2.
2. **Stop shipping redundant fallback textures, or mark them `Lazy`** — the cause of G2. Every
   solar-system planet declares a `.glb` *and* a loose albedo; the streamed path decodes both
   because prefetch covers everything not marked `Lazy`. See `ENGINE-GAPS.md` G2.
2. **P3's VRAM claim is unmeasured** — LOD texture variants shipped, the saving was never measured.
3. **Open question: where hashed objects live** — a directory beside the archive, or content-addressed
   storage. Needs a decision before streaming ships.
4. **Re-check the ten scenarios after the handedness fix** — see engine P0.
5. Retirement, once the editor can author and export.

Per-scenario specifications stay as `docs/TASK-*.md` (11 files, ~2.1k lines) — they are content
specs, not plans.

---

## 5. WebEngineTS-Benchmarks

No standing plan. The rule: **any engine change that moves a measured number invalidates comparison
with earlier runs.** Record the build stamp (`BuildInfo.version` / `builtAt`) with any result kept.
The handedness fix (2026-09-04) changed rendered output — treat pre-2026-09-04 results as a
different build.

---

## 6. Where the deep documents live

Consolidating these would have put ~20k lines in shared context, so they stay put and are indexed
here instead.

| Document | Repo | What it is |
|---|---|---|
| `design/render-adapter-plan.md` | WebEngineTS | P3 above, staged |
| `design/canvas-ui-roadmap.md` | WebEngineTS | UI toolkit, 884 lines |
| `design/unity-parity-plan.md` | WebEngineTS | serialization/editor architecture, 838 lines |
| `design/asset-streaming-proposal.md` | WebEngineTS | streaming design |
| `design/unity-coordinate-spaces.md` | WebEngineTS | **closed** — the coordinate contract reference |
| `design/unity-coordinates-plan.md` | WebEngineTS | texture UV convention (C3), open |
| `design/handoff-boundary.md` | WebEngineTS | why engine feature work paused for consumers |
| `design/audit/` | WebEngineTS | historical audit, 3.5k lines |
| `.github/docs/*.md` | WebEngineTS | API reference, 24 files |
| `docs/TASK-*.md` | ScenarioCreator | per-scenario content specs |
| `docs/implementation-plan.md`, `test-plan.md`, `manual-browser-checks.md` | virtual-lab | closed history and procedures |

Gap reporting keeps its existing split on purpose: the **index** is `ENGINE-GAPS.md` here, the
**evidence** stays in the repo that found it (`ScenarioCreator/docs/ENGINE-GAPS.md`,
`testv/virtual-lab/docs/upstream/`), and the engine answers in
`WebEngineTS/design/upstream-answers.md`.
