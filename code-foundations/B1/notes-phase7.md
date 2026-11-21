# B1 Phase 7 — implementation notes (W2)

Built on the uncommitted phase-7 WIP (5 modified files: debug-probe.ts, scene-view-renderer.ts,
settings.service.ts, settings-dialog.component.ts, viewport.service.ts) on top of HEAD 9c366f9.
Nothing reset/stashed. Skill: cc-defensive-programming (loaded).

## Design gaps found, and the decisions (with evidence)

1. **`pixelStats` has no luminance** — its counters are orange/green/white hue buckets
   (`scene-view-renderer.ts` pixelStats, `counts.orange/green/white` only). DW-7.1/7.3 need
   luminance, so e2e uses `probe.pixel(x,y)` RGBA and computes
   `lum = (0.2126r + 0.7152g + 0.0722b) / 255` itself (probe.pixel exists, debug-probe.ts:55,
   takes client coords, draws+reads in one task).
2. **Grid colours hit no pixelStats counter** — GridHelper colours are 0x555555/0x333333
   (viewport.service `_rebuildGrid`), grey, counted by none of the three hue buckets. DW-7.4
   therefore compares `probe.pixel` samples with grid on vs off in an empty area, plus
   `probe.gridStep()` read-back after setting Preferences gridSize to 0.5.
3. **No AxesHelper anywhere** — renderer comment (scene-view-renderer.ts:24) says it is already
   gone; grep finds no axis-line code. D-8's red-X/blue-Z lines are a NEW addition to the grid
   overlay layer (`addOverlayLayer('grid', …)`), built from directions via `space.ts`
   `engineDirToThree` (z negated, so engine +Z points to three −Z).
4. **`_rebuildGrid` early-returns when divisions unchanged** — recentring must not rely on it.
   D-8 recentre runs in `_tick` (per frame): grid position XZ = pivot XZ snapped to 10×step,
   via `enginePointToThree` (pivot is engine space; GridHelper lives in three space).
5. **Build typecheck currently FAILS** — settings-dialog WIP template references
   `prefs.gridSize` / `prefs.gridSizeHint`; both keys absent from en.ts AND uk.ts. First fix.
6. **New icons** — PATHS in icon.component.ts has 'shaded' but no 'wireframe'/'grid'. Adding two
   entries is a file-scope extension (plan's file scope does not list icon.component.ts); noted
   here, minimal 2-line diff.
7. **Engine version mismatch** — editor tarball `WebEngineTS-0.1.0-local.tgz` (package.json),
   ScenarioCreator node_modules ships 0.2.0, W2 engine source is 0.3.0. Per D-14 the platform
   pixel check renders on SC's bundle (0.2.0) — that IS the platform artifact today; recorded,
   not "fixed" (no engine changes allowed).
8. **Fixture centre-pixel coverage** — platform-pixels.mjs samples buffer (320,240) of a
   640×480 canvas (harness comment lines 131–132, 140). A default 1-unit cube seen from z=−10
   at fov≈60 is too small to reliably cover the centre; fixture cube scaled to 2 via the
   Inspector. UI-created Camera lands at the pivot (0,0,0) — moved to (0,1,−10) via the
   Inspector (same pose as the wizard's `_buildLightAndCamera`, commands.service.ts:352).
9. **Camera need not be tagged** — SC bundle `Camera.main`: `tag==="MainCamera"` first, else
   first active camera (bundle grep: `for(const e of …_activeCameras)if(e.isActiveAndEnabled)return e`).
   UI-created cameras are untagged; the fallback covers them. The wizard's camera IS tagged
   (commands.service.ts:350) — wizard-project fixture unchanged.
10. **Unlit cube expected black** — RenderSettings.ambientColor (0.2 grey) has no renderer
    consumer in either bundle: `_syncToThree` handles skybox/env/fog only, ambientColor appears
    just in RenderSettings + SceneSerializer (grep evidence above in session). No AmbientLight
    instantiated by the engine renderer. So lighting-on + no light → MeshStandard cube reads
    ~0 luminance (DW-7.1 < 0.05); verified empirically in e2e, not assumed.
11. **Lighting-off headlight** — WIP renderer already scopes hide/restore in try/finally with
    pooled lights; DW-7.2 proof = `probe.threeInfo()` before/after (children count + every
    light's `visible` over the whole graph). Headlight is a camera-directional + dim hemisphere,
    removed before draw() returns, so threeInfo never sees it.
12. **Wireframe background sample** — no `setClearColor` in the renderer for the main frame;
    the engine scene background (Camera clear SolidColor black on the platform, null in edit
    mode → renderer default clear) is sampled empirically from an empty corner pixel in e2e,
    not hard-coded.
13. **Grid axis lines & existing green-count check** — selection scenario compares
    `on.green - bare.green` (both frames have the same grid), so adding coloured axis lines to
    the grid layer cannot break it as long as they exist in both frames. Red X (0xff4444-ish)
    and blue Z don't hit the green bucket (g>150, r<130, b<140) anyway.

## e2e additions (planned)

- Scenario "lighting and view (B1.7)" — DW-7.1…7.4: luminance via probe.pixel at the cube's
  screen-rect centre; hint visible/gone; lighting state not saved (readDisk unchanged) and not
  undoable (Control+z after toggle does not restore/alter it; undo still undoes the create);
  threeInfo before/after lighting-off; wireframe interior ≈ background, edges lit, saved JSON
  identical across mode toggles (sceneText + Control+s pattern from gizmos scenario); grid
  pixels on/off in an empty area; gridSize 0.5 via Preferences → probe.gridStep() === 0.5.
- Fixture exports in the same scenario flow (before the run loop): wizard lightCamera →
  pixels-lit (add cube scale 2), wizard empty → pixels-dark (cube scale 2 + camera at (0,1,−10)),
  catalog = primitives (cube/sphere/capsule/cylinder/plane/quad) + light + camera, stage-6
  features only. `exportFolder` to `resolve(SHOTS, key)` exactly like wizard-project.
- Object counts come from each fixture's own scene JSON (scenariocreator-check sceneObjectCount,
  children included) — verify-render must print `objects=N` twice (zip + manifest).

## Code landing (2026-11-21)

Branch `B1-component-gizmos` (editor repo), landed on top of the phase-7 design notes above:

| Commit | What |
|---|---|
| `ef8f4a4` | phase-7 view state — lighting, wireframe, grid step (DW-7.1…7.4, DW-7.7) |
| `29184a2` | phase-7 e2e — "lighting and view" scenario + the platform fixture exports (DW-7.5/7.6) |
| `c492918` | B1r5 #1 uniform Global scale in the combined/Y tool + exclusive scale-zone enabler; #2 Centre scale offsets through the seated axes |
| `21eefbb` | B1r5 #3 measured circle normals (u×v); #4 capsule silhouette (6 circles + 4 side lines); #5 lifecycle clears/dispose + the 8784-vertex buffer read-back probe |
| `dcf5926` | B1r5 #6 — synthetic Error-severity GL lines pin the `noErrors` filter |

Full per-block evidence, failing-first reasoning and file:line citations:
`.workers/logs/B1-editor-code-report.md`.

**B1r5 fold (six findings, all fixed):** uniform Global scale in combined/Y + exclusive
scale-zone enabler (`c492918`); Centre offsets carried through the seated axes with a
k-parametric child test (`c492918`); circle normals measured u×v + Sph/Sun discriminators
(`21eefbb`); capsule 6 circles + 4 side lines, `CapTall` half = (0.5, 2, 0.5) (`21eefbb`);
gizmo lifecycle clears/dispose with a static proof (`21eefbb`); `noErrors` synthetic GL lines
(`dcf5926`) + 8784-vertex buffer read-back probe (`21eefbb`).

**Deviations (from the editor code report §5):**
1. B1r5 #1 — three's per-axis scale boxes are still drawn in combined Global; only the *effect*
   is uniform (hiding three's pickers would fork `TransformControls`).
2. B1r5 #1 claim enabler (`setSize(2.0)`) is an editor-side reachability change, not a Unity
   constant (three's scale pickers are unreachable at equal size under the claim order).
3. B1r5 #5 has no dynamic test — static evidence only (the harness cannot observe GC).

**Scope extension recorded:** `app/src/app/shell/icon.component.ts` gained 'wireframe' and 'grid'
paths (a 2-line file-scope extension; the plan's file scope did not list it).

**Engine-bundle version note:** the editor tarball is `0.1.0-local`, ScenarioCreator ships
`0.2.0`, W2 engine source is `0.3.0`; per D-14 the platform pixel check renders on SC's bundle
(`0.2.0`) — that IS the platform artifact today; recorded, not "fixed" (no engine changes).

## Results (filled after the green run)

- tsc / ng build: (pending verify window — RAM gate)
- e2e PASS before: 380 (baseline, phase-6 commit). After: (pending verify window — RAM gate)
- e2e:build fixtures + ZIP sha256 lines: (pending verify window — RAM gate; last known:
  wizard fixture 6 PASS, zip sha256 `3e63625856db77cc02cd67705169afd2783cacd8135acd03a2f26d64a0376999`;
  pixels-lit / pixels-dark / catalog were SKIPPED before the phase-7 exports existed)
- Deviations: per-axis scale boxes still drawn (effect uniform); B1r5 #5 static-only; the three
  items above.
- **Tests NOT run** — the code landing above is static-review only; the green run is the
  verifier's queue.
