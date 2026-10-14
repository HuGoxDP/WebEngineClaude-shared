# Shared work plan — all repositories

**The single place work is planned.** New tasks go here, under their project, not into a new
per-repo plan file.

**Open defects from the 2026-09-05 visual review are being worked through in
[`ISSUES.md`](ISSUES.md)**, one line each; that file is deleted when empty.

**Open items only.** Completed work is removed from this file and recorded in
[`CHANGELOG.md`](CHANGELOG.md) — go there for what changed and why, and to git for the full
reasoning. If an item here has no owner action left, delete it.

**The direction these items serve** — the two format decisions (when link mode reaches files,
component ids), the target architecture, budgets and the order of work — is the vision document
of 2026-10-13: https://claude.ai/code/artifact/01113f63-16cd-4f87-912b-182e286b6501. This file keeps
the actionable items; that one keeps the reasons.

**How to do each item: [`tasks/`](tasks/README.md)** — one card per task, written so a session
(Sonnet for most) can do it without asking, with the files to read, the steps, the tests, the
acceptance checks and the owner decisions it waits on.

**Not loaded into session context automatically** — unlike `ECOSYSTEM.md` and `ENGINE-GAPS.md`,
this file is read on demand. Keep it to *what to do and why*; deep design belongs in the documents
indexed at the bottom.

---

## 0. What decides the order

| Repo | State, 2026-09-05 |
|---|---|
| **WebEngineTS** | *(2026-10-13)* 58k LOC, 4 TODOs, ~2,030 tests. Healthy — but **no consumer has any of the October work**: every one still runs the 2026-09-10 build (§1.2). |
| **testv/virtual-lab** | **Live — students use it.** Express + `pg` + nginx + Docker, Angular frontend. |
| **ScenarioCreator** | Active, 10 production scenarios. To be retired once the editor can export. |
| **WebEngineTSEditor** | *(2026-10-09)* Runs in Docker beside the catalog at `/editor/`. Start screen, new-project wizard, Project panel on a local folder, honest saving. A project it creates builds in ScenarioCreator and runs in the engine. Not yet: adding a cube, assets in a scene, scripts, Play, publishing. |
| **WebEngineTS-Benchmarks** | Harness + recorded results. Pre-2026-09-04 results are a different build — the handedness fix changed rendered output. |

The consumer with real users is the platform. **What the editor is for was decided 2026-10-09**
(§3): teachers author scenarios on the site, in an editor that looks and works like Unity's. That
makes editor-justified engine work a real requirement rather than a guess — the list is §1.5.

**Two items need a human, not an agent:** the visual scenario pass (§1.1) and the
`LineRenderer.useWorldSpace` default (§1.2).

**Screenshots are available to an agent.** `WebEngineTS/scripts/shoot.mjs` drives the locally
installed Edge through Playwright, records the console and saves a PNG — so "load it and look" is
no longer a human-only step. It found the LineRenderer colour defect and confirmed its fix.

---

## 1. WebEngineTS — the engine

### 1.1 Look at the scenarios after the handedness fix — *mostly done 2026-09-05*
Nine of ten screenshotted through `WebEngineTS/scripts/shoot.mjs`; no scenario had compensated for
the mirror by hand. It also turned up a defect static analysis had missed entirely — **Optics,
Circuits and Kepler rendered no 3D at all** (fixed in ScenarioCreator, see `CHANGELOG.md`).

**Still open, and it does need eyes:** confirming the DNA helix reads *right-handed* and the
solar-system orbits *prograde*. Both are derived and both screenshot cleanly, but neither can be
called from a still frame — the helix needs a judgement about which strand is in front, and orbital
sense needs two frames. Sprites, billboards and shadow direction are also unchecked.

### 1.2 First release, `v0.2.0` — delivery before features *(~2–3 weeks)*
The engine has E3, E5, E6, E7, E10, E11 and E13 and a version-2 reader; the platform, the editor and
ScenarioCreator all run `0.1.0-local.1789023160893` (2026-09-10), which checks no format version and
would load a version-2 scene hollow. In this order:

1. **Finish the E11 review** — the 20 findings on the prefab-instance serializer; most are fixed and
   pushed, the rest are in flight.
2. **Readers state what they read.** A public API for the scene/prefab format versions this build
   reads, the same gate on every reader (lone GameObject, `.mat.json` and `.physicmat.json`, which
   carry no version yet), the manifest's `manifestVersion` major refused when unknown. The editor
   opens files through it instead of its `version !== 1` literal. *(The platform side is done:
   `virtual-lab/backend/player-formats.js`.)*
3. **Component ids (Q2)** — scoped like node ids: only in prefab trees and instance interiors,
   legacy ids derived for old files, plain scenes byte for byte unchanged. Before the release, so
   the format is not frozen with `componentIndex` and a second readers-first cycle is not needed.
4. **Minify the standalone bundle** — 892 KB gzip today (unminified, with comments), 384 KB
   minified (measured 2026-10-13). Every student downloads it.
5. **Backfill `CHANGELOG.md`** — it has nothing on E3, E5, E6, E7, E10, E13 or the 2026-09-10
   entries; `release.yml` checks a section exists, not that it is complete.
6. **Tag `v0.2.0`** and move the platform onto the release URL (§2), the editor onto the same
   release.

**Link mode stays authoring-only (Q1).** Links live in the editor's project files from its stage 14;
Build and Publish expand them, so archives keep carrying version 1 (as Unity's player never sees
prefab links). Prefab files a script instantiates at run time are still version 2, which is why the
platform needs the version-2 reader anyway.

### 1.3 `RenderTexture` *(~2–3 days)*
The one genuinely missing Unity primitive for this domain (`NavMesh`, `Terrain`, `Tilemap` are
irrelevant; `CharacterController` is marginal). Unlocks the editor viewport, picture-in-picture,
minimaps and cheaper post-processing. The editor now asks for it as E8 (§1.5): rendering an
arbitrary camera into a target, for a Scene view drawn by the engine and for camera previews.

### 1.4 Adapter generalization, stages 1–4 *(weeks)*
`WebEngineTS/design/render-adapter-plan.md`. Stage 0 is done. Stage 1 (resource handles) is the
large one and the real prerequisite for WebGPU. **Do not start it in fragments** — each stage must
leave exactly one way to reach the GPU, or the `instanceof THREE.Mesh` checks the engine relies on
start failing for whichever objects took the new path.

### 1.5 What the editor needs from the engine
**Implemented 2026-10-10..13, waiting on §1.2 to reach anyone:** E3, E5, E6, E7, E10, E11, E13.
**Open:** E1 (`entryScene`, ½ day), E2 (edit mode, 3–5 days), E4 (replace a registered class, 1–2
days), E8 (render target, 2–3 weeks), E9 (gizmos), E12 (animator assets). The list below is the
original order, kept for its reasons. The editor's plan (`WebEngineTSEditor/docs/unity-editor-plan.md` §4) lists thirteen asks, E1–E13,
each with the Unity behaviour it blocks and the evidence it was checked against. In the order the
editor reaches them:

1. **E7 — sibling order and component order** (`setSiblingIndex`, move up/down). ~2 days.
2. **E3 — a reference to a mesh inside a GLB**, and **E5 — material / prefab / physic material as
   loadable assets with a guid.** ~1 week each. Without E3 a model dragged into a scene saves
   without its geometry.
3. **E6 — the serializer keeps a component of an unknown type instead of skipping it.** ~2–3 days,
   and **it is about data loss**: a scene opened while one script fails to compile loses that
   script's components on the next save. Before the editor loads any user script.
4. **E2 — edit mode** (script lifecycle does not run; `@ExecuteInEditMode` opts in) and **E4 — the
   type registry accepts a replacement class.** Together they are script reloading and Play.
5. **E8 — render a camera into a target** (§1.3). 2–3 weeks; improves Play, does not block it.
6. **E10** render settings saved with the scene, **E11** prefab identity and instance links,
   **E1** the loader reading `entryScene`. Later: E9, E12, E13.

Each is re-verified and given a row in `ENGINE-GAPS.md` when the editor's stage reaches it, not
before — the engine moves faster than a list.

### Deferred, with the condition that revives each
| Item | Revives when |
|---|---|
| Canvas UI Stage 1 (`design/canvas-ui-roadmap.md`) | the editor's UI tools are scheduled (its plan, "After") — the editor's own panels are Angular and do not need it |
| Unity parity Stages 2–4 (`design/unity-parity-plan.md`) | **revived in part by §1.5**: Stage 2's sidecar ids are E3/E5 and the `.meta` item in §4; Stage 4's prefabs are E11 |
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
6. **Author publish keys** *(~1 week; blocks the editor's Publish)*. One `ADMIN_TOKEN` cannot be
   handed to teachers — it deletes and publishes anything. A `publish_keys` table (hashed, one per
   person, revocable), `scenarios.owner_key_id`, and a scope: create a scenario unpublished, update
   and upload to one's own *unpublished* scenario, nothing else. Issued and revoked in `/admin`.
   Design: `WebEngineTSEditor/docs/unity-editor-plan.md` §7. *Decided 2026-10-09:* an author
   updates an already-published scenario only through a draft that an admin accepts.
7. **Run the browser e2e against the stack with the editor override applied.** The override was
   checked by hand and by the header tests; the Playwright browser was not installed, so the
   eleven browser specs did not run (`npx playwright install` in `e2e/`).

8. **Serve the engine from a versioned path** *(with §1.2.6)*. `/assets/WebEngineTS.standalone.js`
   is cached `immutable` for 30 days, so after an engine update a returning browser can keep the
   old build for a month. `/engine/<version>/…`, referenced from the no-cache `index.html`.
9. **Run scenarios away from the platform's origin** *(before publish keys or LTI logins exist)*.
   A teacher's script is arbitrary code and runs today on the same origin as the API. A player
   document in an iframe on its own origin isolates it, and is also what per-scenario engine
   pinning needs, since an import map cannot be remapped once a document has resolved it.
10. **LTI 1.3 for Moodle** *(after 9)* — Dynamic Registration, Deep Linking to an exact archive
    hash, grades through AGS, Platform Storage for Safari. The largest step for universities.
11. **Offline lessons** — a cache-first Service Worker over the content-addressed archives, a
    "prepare this lesson" action, `navigator.storage.persist()` (Safari wipes a site's storage after
    7 days without a visit).
12. **Backups of Postgres and the archives volume, with a restore actually tried; HTTPS on the
    production server** (the editor's folder access and publish keys both need it).

Reference kept in that repo: `docs/implementation-plan.md` (closed history), `docs/test-plan.md`,
`docs/manual-browser-checks.md`, `docs/scenario-delivery-migration.md`.

---

## 3. WebEngineTSEditor — the editor

**Decided 2026-10-09.** Teachers author scenarios in it, on the site; a project is a folder on
their own computer and only published scenarios reach the server; scripts are both written in the
editor and taken from a library of ready behaviours; and **it looks and works like the Unity
editor.** Stages 0–5 are done (`CHANGELOG.md`). The plan, with a parity table per Unity window, is
`docs/unity-editor-plan.md`; about eight months of one person to the end of milestone 3.

1. **Stage 6 — scene and objects** *(~2 weeks; next)*. 3D primitives, Unity's scene navigation and
   tools, selection, component gizmos, a scene-lighting toggle. Today a cube cannot be added, and a
   scene with no light looks lit in the editor and black on the platform.
2. **Stages 7–9 — Hierarchy, Inspector, Project and assets** *(~6.5 weeks; E7, E3, E5, §4.7)*.
3. **Stage 10 — Build, Build And Run, Publish** *(~2 weeks; §2.6)*. **Milestone 1:** a scenario
   without code, from "Create project" to the catalog.
4. **Stages 11–13 — dockable windows, scripts, Play inside the editor** *(~7.5 weeks; E2, E4, E6)*.
   **Milestone 2.**
5. **Stages 14–16 — prefabs, settings windows, Unity-style undo** *(~6 weeks; E10, E11)*.
   **Milestone 3.** After it: Animation, Animator, UI tools, Profiler — each its own decision.
6. **Redeploy the editor container** — the image predates stages 3–5; Docker Desktop was off.
7. **Open scene files through the engine's version check** (§1.2.2) — today `_loadSceneText`
   accepts only `version === 1`, so the editor could not reopen a prefab file its own engine wrote.
8. **A second project store for Safari and Firefox** — the project folder goes through
   `showDirectoryPicker`, which only Chromium has. OPFS or the platform's server; the same store
   is what share links and co-editing need later. Decide before the first real authors.
9. **Check the native folder picker by hand once.** The e2e substitutes a folder inside the
   browser, so everything after the dialog is tested and the dialog itself is not.

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
6. Retirement, once the editor can author and export. Not before the editor's milestone 1 — and
   even then it stays the release builder (KTX2, LOD, the streaming manifest).
7. **Take an asset's guid from `<file>.meta` when one exists** *(~1–2 days; blocks the editor's
   stage 9)*. The guid is a hash of the path today, so renaming a file in the editor's Project
   window would break every scene that refers to it. Derived as now when there is no `.meta`, so
   the ten scenarios are untouched.
8. **`--experimentalDecorators` in `build-package.mjs`** *(check first; minutes if needed)*. It
   runs `tsc` with `--ignoreConfig`, so the flag set in `tsconfig.json` does not apply, and the
   engine's decorators are the legacy kind. No scenario uses `@SerializedField` yet, which is why
   it has not surfaced; the editor's scripts will.
9. **Write `entryScene` into the manifest** when the scenario has one *(minutes; with engine E1)*.

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
| `docs/unity-editor-plan.md` | WebEngineTSEditor | **§3 and §1.5** — the editor against Unity, window by window; engine asks E1–E13; publish keys |
| `docs/integration-plan.md` | WebEngineTSEditor | the two contracts (project folder, ZIP) and the Docker deployment |
| `docs/editor-ux-plan.md` | WebEngineTSEditor | the editor's lifecycle and its start, wizard and publish screens |
| `docs/implementation-plan.md` | WebEngineTSEditor | stages 0–5 as built, with every deviation and why |

Gap reporting keeps its existing split on purpose: the **index** is `ENGINE-GAPS.md` here, the
**evidence** stays in the repo that found it (`ScenarioCreator/docs/ENGINE-GAPS.md`,
`testv/virtual-lab/docs/upstream/`), and the engine answers in
`WebEngineTS/design/upstream-answers.md`.
