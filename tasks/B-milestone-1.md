# Phase B — editor milestone 1: a scenario without code, from "Create project" to the catalog

The editor's own plan is the specification: `WebEngineTSEditor/docs/unity-editor-plan.md` §5 (parity
tables per window) and §6 stages 6–10. These cards split each stage into session-sized tasks, add
acceptance checks, and slot in the engine and platform work milestone 1 needs. Estimates are the
plan's: ~11 editor weeks + ~3 engine + ~1.5 platform.

**Every editor task**: read `WebEngineTSEditor/README.md`, the stage text in
`docs/unity-editor-plan.md` §6 and the matching §5 table rows first. Build and test on the built
bundle (`npx ng build` + `npm run e2e`), never only on `ng serve` (stage 3 showed they diverge). Every
stage ends with a scenario for the catalog built only with that stage's features (§9 of that plan);
if it does not build and run on the platform, the stage is not closed. Add e2e scenarios to
`app/e2e/run.mjs` for each task. UI strings in uk and en.

**Order**: B0 any time; B1 → B2 → B3 → B4 → B7; B5 and B6 (platform) before B7's Publish.

---

## B0 — Engine E1: the loader reads `entryScene` *(engine; Sonnet; ½ day)*
`ScenarioTypes.ts:124` declares `entryScene` and nothing reads it; the scenario template loads
`scenes/main.scene.json` by hand.
- `Scenario` (ZIP and streaming): if the manifest has `entryScene`, after the entry script's
  `awake`, load that scene through the same path the template uses today (`getAsset` →
  `SceneSerializer.deserializeScene`) — **with** `SceneSerializer.assetReferences(json)` preloaded
  through `Resources` first, so a scene that references prefab/material files is complete. Decide
  with evidence whether the template's manual load then becomes redundant (it should); keep
  backward compatibility for archives without `entryScene`.
- Tests: a ZIP with `entryScene` and a prefab file referenced by the scene loads complete; without
  `entryScene` nothing changes.
- ScenarioCreator then writes `entryScene` when `scenario.meta.json` names one (`PLAN.md` §4.9; minutes).

---

## B1 — Stage 6: scene and objects *(editor; ~2 weeks; Sonnet; human check for navigation feel)*

| Task | Do | Done when |
|---|---|---|
| B1.1 3D Object menu | GameObject → 3D Object → Cube, Sphere, Capsule, Cylinder, Plane, Quad via `Mesh.create*`, with `MeshFilter`, `MeshRenderer`, a default `StandardMaterial`. Same in the Hierarchy "+". New object placed in front of the editor camera and selected; one undo step. | e2e: each primitive created, saved, reopened, present; built archive shows a cube on the platform (`e2e:build`). |
| B1.2 Navigation controller | Replace `OrbitControls` with Unity's scheme: LMB select/box; Alt+LMB orbit; RMB look + WASD/QE fly, Shift faster; MMB pan; wheel zoom; `F` frame selected, `Shift+F` follow. One class, unit-free (e2e drives it with mouse events). | e2e: each gesture moves the camera as expected (assert camera transform deltas); human check of feel listed in the report. |
| B1.3 Orientation cube | three's `ViewHelper` (editor-side, not engine): click an axis → look along it; centre → perspective/iso toggle. | e2e: click +X → camera forward is −X. |
| B1.4 Tools | `Q` hand, `Y` combined; Pivot/Center and Local/Global honoured by move/rotate/scale gizmos; snapping with `Ctrl` or toggle, step from settings. | e2e: snapped move lands on the grid step; Local vs Global differ on a rotated object. |
| B1.5 Selection | Orange outline (editor-side post-pass or second render of the selected meshes); box select; `Ctrl`/`Shift` add/toggle. | e2e: box selects three of four cubes. |
| B1.6 Component gizmos | Editor-drawn icons and wireframes: light direction/radius/cone, camera frustum, colliders, audio source. Gizmos menu toggles each. | e2e: toggling hides the camera frustum; screenshot in the report. |
| B1.7 Scene lighting and view | Lighting toggle (on by default when the scene has a light), Shaded/Wireframe, grid show + step. | A scene with no light looks unlit in the editor **and** on the platform (today it looks lit in the editor, black on the platform). |

Gotcha: the viewport renders with its own `THREE.WebGLRenderer` (plan §3.5) until E8; keep editor-only
drawing (gizmos, outline) out of anything that is serialized.

---

## B2 — Stage 7: Hierarchy *(editor; ~1 week; Sonnet; needs E7 — done in the engine, delivered by A8)*
Expand/collapse (state in `.editor/`); drag between rows with an insertion line (uses
`Transform.setSiblingIndex`); full context menu; keyboard (arrows, F2, Del, Ctrl+D); `Alt+Shift+N`
empty child; search with `t:` type filter; inactive rows grey; eye and pick toggles; double-click
frames; icon by main component.
**Done when**: a 30-object tree is rebuilt by drag and keyboard as in Unity, and the order survives
save → reopen (E7 writes sibling order).

---

## B3 — Stage 8: Inspector *(editor; ~2.5 weeks; Sonnet; split in four sessions)*
1. **Header**: active toggle (`setActive`), Tag and Layer dropdowns with "Add Tag…/Add Layer…",
   names stored in `ProjectSettings/TagManager.json` (new project file; document it in
   `docs/integration-plan.md` contract A).
2. **Transform**: Reset, Copy/Paste, drag-on-label, Euler angles without jumps (keep the authored
   Euler, convert only on change).
3. **Components**: collapse remembered, enable toggle (`Behaviour.enabled`), full component menu
   (Reset, Remove, Move Up/Down via E7, Copy/Paste Values). **Add Component built from the engine's
   type registry and categories** — delete the hand-written `BUILTINS`.
4. **Field editors for every `FieldType`**: number with drag, slider for `@Range`, bool, string, enum,
   Vector2/3/4, rotation, colour picker with alpha, Rect, Bounds, object/component/asset references
   (drag, picker, highlight target), Sprite, Mesh, curve, gradient, arrays with reorder, nested
   structs, `@Header`, `@Tooltip`. Multi-object editing with "—" for mixed values.
**Done when**: each of the engine's 44 serializable components is fully editable, and the inspector
code contains no component name (`grep` for component class names in the inspector folder → none).

---

## B4 — Stage 9: Project and assets *(editor + ScenarioCreator; ~3 weeks; Sonnet; needs A11's `.meta`)*
1. `.meta` with GUID written next to every asset by the editor (format agreed in A11); rename/move a
   texture → the scene's reference survives, in the editor and after a build.
2. Asset source over the project folder (`Resources.useSource`) so textures and models show in the
   editor scene.
3. Project window: Create (Folder, Scene, Material), F2, Ctrl+D, move, search, icon/list views,
   material and model thumbnails.
4. Material as a file (`.mat.json`, E5): material inspector; a renderer shows its material at the
   bottom of the inspector.
5. Drag and drop: model into scene, texture onto an object (creates a material), asset into a field.
6. Asset inspector: texture/model preview, audio playback.
**Done when**: a scene with a textured model and one material shared by two objects is assembled by
drag and drop and looks the same on the platform.

---

## B5 — Platform: run scenarios on their own origin *(virtual-lab; Opus design → Sonnet; ~1 week)*
Before any author key or login exists, a teacher's script must not run on the API's origin.
- Design (Opus, write it into `virtual-lab/docs/player-isolation.md` first): a player document at
  `/engine/<version>/player.html` served from a **separate origin** (e.g. `play.<domain>`; locally a
  second port), embedded by the viewer in an `<iframe>` with `sandbox="allow-scripts allow-same-origin
  allow-pointer-lock"` + `allow="fullscreen"`; its own import map and CSP (nonce, `script-src blob:`);
  the viewer passes the archive URL (or an `ArrayBuffer`, transferred) by `postMessage` with a strict
  origin check both ways; progress, errors, diagnostics flag and `BuildInfo` come back by message.
  Safari gives cross-origin frames ~1/10 of storage quota — the offline cache (E-growth) lives in the
  player origin, so measure it there.
- The same document is what per-scenario engine pinning needs later (an import map cannot be remapped
  once resolved): `player.html` per engine version.
- Tests: e2e — a scenario script that reads `document.cookie`, `localStorage` and calls `/api/admin/*`
  from inside the player gets nothing from the platform origin; every published scenario still runs.

## B6 — Platform: author publish keys and drafts *(virtual-lab; Sonnet + Opus security review; ~1 week + 3–4 days)*
Exactly as `unity-editor-plan.md` §7 specifies: migration `006` (`publish_keys` with `token_hash`
SHA-256, `label`, `created_at`, `last_used_at`, `revoked_at`; `scenarios.owner_key_id`;
`pending_archive_sha256` + author/time/size/engine version), the rights table (author key: create
hidden, edit own metadata, upload to own hidden, upload to own published **as a draft only**; admin:
everything), `/admin` "Ключі авторів" (issue — shown once —, list, revoke; owner shown per scenario),
draft preview `/play/<id>?draft=<sha256>`, accept/reject in one transaction, GC keeps archives a log
references. Rate limit and an audit line per key action. Tests: backend unit + integration for every
row of the rights table (including the "no" cells), e2e for issue → publish → draft → accept.
Review focus: timing-safe comparison, hash only in the DB, no key in logs, no route that lets an
author key touch another key's scenario.

## B7 — Stage 10: Build, Build And Run, Publish *(editor; ~2 weeks; Sonnet; needs B0, B4, B5, B6, A8)*
1. **TypeScript in the browser** (compile `scripts/*.ts` for the ZIP; no code editor yet).
2. **Packager**: project → ZIP in memory by the same rules as `ScenarioCreator/build-package.mjs`.
   **Every scene is written in expand mode** (`SceneSerializer.serializeScene` defaults; load the scene
   with its prefabs first) — decision Q1: archives carry version 1. Preflight: compute the maximum file
   version in the ZIP; refuse to build if any scene is above 1 or any prefab above what the target
   platform reads, with a message naming the file. `npm run e2e:build` compares the two builders'
   manifests.
3. **File → Build Settings**: scenes in the build, start scene → `entryScene`.
4. **Build** → ZIP file. **Build And Run** → the ZIP in a new tab on the platform's engine bundle
   (through B5's player). Until stage 13, Play does the same.
5. **Publish** (§7): checks (a camera, a light, every component type known, title and slug filled) →
   key → upload; the key kept for the tab, "remember on this computer" optional.
**Done when** (milestone 1): a teacher with their own key publishes from the editor; the scenario
appears hidden in `/admin`; their key cannot delete or publish anyone else's; a draft update of a
published scenario waits for the admin.

---

## Retire ScenarioCreator's role as the authoring path *(after B7)*
Once the editor builds and publishes, ScenarioCreator keeps only what the editor cannot do yet: KTX2
(`--ktx2`), LOD ladders and the streaming manifest. Record that in its `CLAUDE.md`; do not delete the
repo.
