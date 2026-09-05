# Shared work plan — all repositories

**The single place work is planned.** New tasks go here, under their project, not into a new
per-repo plan file.

**Open items only.** Completed work is removed from this file and recorded in
[`CHANGELOG.md`](CHANGELOG.md) — go there for what changed and why, and to git for the full
reasoning. If an item here has no owner action left, delete it.

**Not loaded into session context automatically** — unlike `ECOSYSTEM.md` and `ENGINE-GAPS.md`,
this file is read on demand. Keep it to *what to do and why*; deep design belongs in the documents
indexed at the bottom.

---

## 0. What decides the order

| Repo | State, 2026-09-05 |
|---|---|
| **WebEngineTS** | 53k LOC, 6 TODOs, 1765 tests. Healthy. |
| **testv/virtual-lab** | **Live — students use it.** Express + `pg` + nginx + Docker, Angular frontend. |
| **ScenarioCreator** | Active, 10 production scenarios. To be retired once the editor can export. |
| **WebEngineTSEditor** | Builds and serves as of 2026-09-05. Nothing has yet shown it *doing* anything. |
| **WebEngineTS-Benchmarks** | Harness + recorded results. Pre-2026-09-04 results are a different build — the handedness fix changed rendered output. |

The consumer with real users is the platform. Editor-justified engine work is no longer blocked on
"it doesn't build", but it should still sequence behind editor P1 (deciding what the editor is for)
rather than starting on the strength of the build alone.

**Three items need a human, not an agent:** the visual scenario pass (§1.1), the
`LineRenderer.useWorldSpace` default (§1.2), and what the editor is for (§3.1).

**Screenshots are available to an agent.** `WebEngineTS/scripts/shoot.mjs` drives the locally
installed Edge through Playwright, records the console and saves a PNG — so "load it and look" is
no longer a human-only step. It found the LineRenderer colour defect and confirmed its fix.

---

## 1. WebEngineTS — the engine

### 1.1 Look at the scenarios after the handedness fix — *needs a browser*
Static analysis found no scenario had compensated by hand, and three were rendering something
factually wrong that is now correct (see `CHANGELOG.md`). What analysis cannot answer: **text drawn
as 3D geometry** (it would read backwards), **sprites and billboards**, and **shadow direction**.
Consumers already carry the fixed engine. Reference: `WebEngineTS/design/coordinate-check/`.

### 1.2 `LineRenderer` is largely a stub wearing a `Renderer` interface — *partly needs a decision*
Surfaced by the visual harness on 2026-09-05. The missing per-frame driver is **fixed** (see
`CHANGELOG.md`); three gaps remain:

1. **`startWidth` / `endWidth` do nothing.** The material is built with a hardcoded
   `linewidth: 1`, and **WebGL ignores `linewidth` for `LineBasicMaterial` regardless** — every
   line is a 1 px hairline. Real width needs a ribbon mesh, which is what Unity's LineRenderer
   draws. ~1–2 days, and it **changes the look of every scenario with a line**. *(No decision on
   whether it is broken — only on when to absorb the visual change.)*
2. **`useWorldSpace` does nothing.** Stored, never read; vertices are always treated as local. The
   default is `true`, the opposite of what happens, and Unity's `true` means world space.
   Implementing it **changes rendered output** for any line under a transformed parent — DNA has
   one. **The default is a content decision.**
3. **The engine `Material` system is disconnected.** `_syncMaterialToThree` /
   `_syncMaterialsToThree` are commented out with a TODO, so `sharedMaterial` is ignored entirely
   and colour comes only from `startColor`. A line cannot be given a Material at all. Related:
   `_setInternalRenderObject` is bypassed, so `_internalRenderObject` stays `null` and the base
   `Renderer`'s shadow/visibility sync and `bounds` never apply to lines.

### 1.3 `RenderTexture` *(~2–3 days)*
The one genuinely missing Unity primitive for this domain (`NavMesh`, `Terrain`, `Tilemap` are
irrelevant; `CharacterController` is marginal). Unlocks the editor viewport, picture-in-picture,
minimaps and cheaper post-processing. Worth sequencing after §3.1.

### 1.4 Adapter generalization, stages 1–4 *(weeks)*
`WebEngineTS/design/render-adapter-plan.md`. Stage 0 is done. Stage 1 (resource handles) is the
large one and the real prerequisite for WebGPU. **Do not start it in fragments** — each stage must
leave exactly one way to reach the GPU, or the `instanceof THREE.Mesh` checks the engine relies on
start failing for whichever objects took the new path.

### Deferred, with the condition that revives each
| Item | Revives when |
|---|---|
| Canvas UI Stage 1 (`design/canvas-ui-roadmap.md`) | §3.1 says the editor needs the inspector surface |
| Unity parity Stages 2–4 (`design/unity-parity-plan.md`) | same |
| Texture UV convention C3 (`design/unity-coordinates-plan.md`) | someone runs a visual harness for UVs; it changes every texture's orientation |
| WebGPU backend | §1.4 Stage 1 lands |
| OffscreenCanvas | a measurement shows main-thread render cost matters |

---

## 2. testv/virtual-lab — the platform (server side)

1. **Confirm the G2 diagnosis** — re-run `e2e/tests/streaming.spec.ts` printing `liveTextures`
   *and* `textures`. Prediction: `liveTextures` differs, `textures` matches. If both match instead,
   the diagnosis in `ENGINE-GAPS.md` G2 is wrong and the gap reopens. **The fix itself is §4.2**,
   not work here.
2. **R8 / Phase 6 — streaming integration.** The path is proven; wiring it end to end is blocked on
   §4.1, not on the engine.
3. **R2 runtime half — KTX2 transcode is never called at runtime.** The file half is verified.
4. **Catalog rows have no `image_url`** — all ten production scenarios fall back to a placeholder.
   Cheap, cosmetic, seen by every student.
5. **R9 — performance telemetry** *(1–2 days, optional; decide before building)*.

Reference kept in that repo: `docs/implementation-plan.md` (closed history), `docs/test-plan.md`,
`docs/manual-browser-checks.md`, `docs/scenario-delivery-migration.md`.

---

## 3. WebEngineTSEditor — the editor

1. **P1 — decide what the editor is for** *(~1 day of thinking)*, before adding to it. This gates
   §1.3 and both deferred engine items. **Needs a human.**
2. **Check it boots in a browser.** It builds and serves, but a runtime error in `main.ts` would
   still return HTTP 200. Cheap, and it completes the P0 answer.
3. **P2 — serialization round-trip** *(~2–3 days)*.
4. **P3 — the generated Inspector** *(~1 week)*.
5. **P4 — undo and play mode** *(large)*.

---

## 4. ScenarioCreator — content and packaging

1. **Emit manifests for the streaming path** — blocks §2.2.
2. **Stop shipping redundant fallback textures, or mark them `Lazy`** — the cause of G2. Every
   solar-system planet declares a `.glb` *and* a loose albedo, and the streamed path decodes both
   because prefetch covers everything not marked `Lazy`. See `ENGINE-GAPS.md` G2.
3. **The LOD-variant VRAM claim is unmeasured** — texture variants shipped, the saving was never
   measured.
4. **Open question: where hashed objects live** — a directory beside the archive, or
   content-addressed storage. Needs a decision before streaming ships.
5. **Re-check the ten scenarios after the handedness fix** — the content half of §1.1.
6. Retirement, once the editor can author and export.

Per-scenario specifications stay as `docs/TASK-*.md` (11 files, ~2.1k lines) — they are content
specs, not plans.

---

## 5. WebEngineTS-Benchmarks

No standing tasks. The rule: **any engine change that moves a measured number invalidates comparison
with earlier runs.** Record the build stamp (`BuildInfo.version` / `builtAt`) with any result kept.

---

## 6. Where the deep documents live

Consolidating these would have put ~20k lines in shared context, so they stay put and are indexed
here instead.

| Document | Repo | What it is |
|---|---|---|
| `design/render-adapter-plan.md` | WebEngineTS | §1.4, staged |
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
