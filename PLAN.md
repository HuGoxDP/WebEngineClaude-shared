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
| **WebEngineTS** | 2026-09-04 | 53k LOC, 6 TODOs, 1762 tests. Healthy. |
| **testv/virtual-lab** | 2026-08-30 | **Live — students use it.** Express + `pg` + nginx + Docker, Angular frontend. |
| **ScenarioCreator** | 2026-08-30 | Active, 10 production scenarios. To be retired once the editor can export. |
| **WebEngineTSEditor** | 2026-08-11 | **Dormant stub.** 19 `.ts` files; `app/` has never been `npm install`ed, so `release:local` has always skipped it. |
| **WebEngineTS-Benchmarks** | 2026-08-30 | Harness + recorded results. Re-measure after any engine change that moves a number. |

**The consequence:** much of the engine's planned work (Canvas UI Stage 1, Unity-parity Stages 2–4)
is justified by the editor — and the editor does not build. Until it does, that work is
speculative. The consumer with real users is the platform.

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
- **`Renderer._computeWorldBounds` has no test** across the handedness mirror. The fix is reasoned,
  not witnessed; standing a `MeshRenderer` with real geometry up headlessly did not work cheaply.

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

1. **G2 — the streamed path holds ~2.9× the texture VRAM of the ZIP path** *(the one blocker)*.
   269.8 MB vs 92.8 MB, same scenario, same 19 live textures — so the platform will not default to
   streaming. The engine has already shown `Resources` + a source are identical
   (`WebEngineTS/tests/SourceVramParity.test.ts`) and added the instrument. **Next move is here:**
   re-run `e2e/tests/streaming.spec.ts` printing both `liveTextures` and `textures`.
   - `liveTextures` differs, `textures` matches → the streamed path retains textures nothing drew.
     A leak; send both figures upstream.
   - Both match → same textures estimated at different sizes. Check `textureFormats`, then
     dimensions.
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

1. **P0 — make it run at all** *(~0.5 day)*. `npm install` in `app/`, build against the current
   engine, see what breaks. The engine has moved a long way underneath it: full component
   serialization, prefab variants, `ScriptableObject`, the Animator state machine, the
   `RenderBackend` seam, the streaming stack, and now the handedness change.
   - **Hazard to settle while there:** `app/package.json` takes the engine as
     `file:../../WebEngineTS` — a directory, not a packed tarball — and also depends on `three`.
     That is the configuration `WebEngineTS/CLAUDE.md` warns about: the bundler may resolve the
     engine's own `node_modules/three` and load **two** THREE instances, which does not crash, it
     quietly breaks every `instanceof THREE.Mesh` check.
2. **P1 — decide what the editor is for** *(~1 day of thinking)*, before adding to it.
3. **P2 — serialization round-trip** *(~2–3 days)*.
4. **P3 — the generated Inspector** *(~1 week)*.
5. **P4 — undo and play mode** *(large)*.

---

## 4. ScenarioCreator — content and packaging

P0–P4 are done (compression, `scenario.json`, real manifest metadata, LOD variants, housekeeping).
Open:

1. **Emit manifests for the streaming path** — blocks virtual-lab item 2.
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
