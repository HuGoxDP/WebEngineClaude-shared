# Phase C — editor milestone 2: a scenario with behaviour; Play as in Unity

Specification: `WebEngineTSEditor/docs/unity-editor-plan.md` §3.1 (Play inside the editor), §3.2
(scripts), §3.4 (windows), §6 stages 11–13. ~7.5 editor weeks + ~2 engine (E2, E4) + optionally
2–3 (E8). Same rules as Phase B (built bundle, e2e per task, a catalog scenario per stage).

**Order**: C1 (stage 11) can start right after milestone 1. C2 and C3 (engine) before C4/C5.

---

## C1 — Stage 11: windows, tabs, layouts *(editor; ~1.5 weeks; Sonnet)*
Four areas (left, centre, right, bottom); tabs drag between them, close/open from the Window menu;
`Shift+Space` maximises; preset layouts (Default, 2 by 3, Tall, Wide); the user's layout persists. Style
from `design/` (colours, density, icons), structure from Unity. No floating windows (plan §2).
**Done when**: Console drags next to Inspector, Scene maximises with `Shift+Space`, the layout survives a
reload. Do it before Game and Code tabs exist so they arrive as tabs.

## C2 — Engine E2: edit mode *(engine; Opus design + Sonnet; 3–5 days)*
In the editor, `awake/start/update` of user scripts must not run on an object just because it was added
(`GameObject.ts` ~269 calls `_systemAwake()` immediately). Unity: scripts run only in Play, except
`[ExecuteInEditMode]` / `[ExecuteAlways]`.
- An application-level mode (`Application.isPlaying` false in edit mode) that the lifecycle dispatcher
  consults; built-in components that must work in edit mode (rendering, transforms, UI layout, LOD)
  keep working; user `Behaviour`s do not get lifecycle calls unless decorated `@ExecuteInEditMode`.
- Design note first (Opus): which built-ins are edit-mode by nature, and what `OnEnable`/`OnDisable`
  mean in edit mode (Unity calls them for `ExecuteInEditMode` only). Then implement with tests: a
  Behaviour added in edit mode gets no `awake`; switching to play runs `awake → onEnable → start`;
  `@ExecuteInEditMode` gets them in edit mode.

## C3 — Engine E4: the type registry accepts a replacement class *(engine; Sonnet; 1–2 days)*
Script reload registers a new constructor under the same `typeName`; `TypeRegistry.register` refuses a
different constructor today (it guards against accidental collisions). Add an explicit
`TypeRegistry.replace(typeName, ctor)` (or a flag) that swaps the class, keeps the collision error for
accidental duplicates, and lets the editor re-instantiate live components of the old class from their
serialized fields. Tests: replace, then deserialize a scene → instances of the new class; accidental
duplicate still throws.

## C4 — Stage 12: scripts *(editor; ~3.5 weeks; Sonnet; needs C2, C3; E6 is done)*
Monaco; Create → Script (template with one `ScenarioBehaviour` or a component); compile and link modules
in the browser (the same pre-linking rules the engine uses for ZIPs: relative specifiers → blob URLs,
`"WebEngineTS"` left to the import map); edit mode (C2); reload on save (C3); errors in Console with
jump-to-line; "Missing script" shown for a component whose class fails to compile (E6 `MissingComponent`
keeps its data); a library of ten ready behaviours (Rotator, Mover, Clickable, Toggle visibility, Show
text on click, Quiz question, Timer, Follow path, Look at camera, Play animation — confirm the list
with the owner in the report); watch for outside edits.
**Done when**: a teacher adds Rotator from the library, changes its speed in the inspector, opens its
code, edits, saves — the object rotates the new way on the platform. A script with an error breaks
nothing in the scene and loses none of its data.

## C5 — Stage 13: Play and Game *(editor; ~2.5 weeks; Sonnet; spike first)*
Game tab with aspect and scale; Play/Pause/Step with `Ctrl+P`, `Ctrl+Shift+P`, `Ctrl+Alt+P`; tinted UI in
play; live Hierarchy and Inspector during play; Maximize On Play; Stats; Clear on Play and Error Pause in
Console; autosave silent in play (already). Delete the hand-copied reduced loop: Play runs the engine's
own `Application` loop. Spike first (1–2 days): run the engine loop inside the editor page alongside the
viewport; write the result into the editor plan.
**Done when**: Play shows what Build And Run shows; a value changed in the inspector during play
applies at once and is gone after Stop; the edit-mode scene is byte-identical after Stop.

## C6 — Engine E8: render a camera into a target (`RenderTexture`) *(engine; Opus design + Sonnet; 2–3 weeks; optional for milestone 2)*
Unlocks drawing the editor's Scene view through the engine (so lines, particles, UI, LOD and
post-processing appear in Scene), camera previews, asset thumbnails. Public API in Unity's shape
(`RenderTexture`, `Camera.targetTexture`), engine types only (no `THREE` in signatures); the Three.js
render target stays internal. Respect the render-adapter plan's rule: do not half-abstract resources —
read `WebEngineTS/design/render-adapter-plan.md` first and make this fit stage 1 rather than add a
second path.
