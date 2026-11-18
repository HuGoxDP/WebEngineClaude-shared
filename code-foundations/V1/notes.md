# V1 — handedness, orbits, sprites and shadows, checked on rendered frames (Claude, 2026-11-14)

The owner delegated V1 ("делай сам", 2026-11-14). `PLAN.md` §1.1 left four things that "need eyes":
the B-DNA helix reads right-handed, the solar-system orbits are prograde, sprites/billboards, and
shadow direction. Each one is answered below twice: by a number read from what the engine actually
draws, and by a frame looked at.

**Setup.**
- Engine: `WebEngineTS/dist/WebEngineTS.standalone.js`, `BuildInfo.builtAt`
  2026-11-10T11:10:13Z (master before C2/C6; nothing in those touches transforms, the camera or
  the content-root mirror).
- Scenarios: `ScenarioCreator/ReleaseScenarios/DNA.zip` and `solar-system-scenario.zip`.
- Browser: Edge headless through virtual-lab's Playwright. The DNA runs used SwiftShader; the
  solar-system and shadow runs used `--use-angle=d3d11` on this machine's GPU.
- Harness `run.mjs` and the probes are beside this file; the evidence frames are
  `dna-crossings.png` and `shadow-sprite.png`. Reproduce from any directory:

  ```
  node run.mjs <zip> <probe.js> [--gpu] [--shots <dir>] [--scale n]
  ```

**Coordinate fact the numbers rest on.** Three's world is right-handed and is the mirror of the
engine's (`Scene._contentRoot` scaled `(1, 1, -1)`, engine `CLAUDE.md` "Handedness (F7)"). The
probes read world positions out of the `Object3D`s, i.e. what is drawn. The same points read
through the engine API flip every sign, which is the expected mirror and doubles as a
consistency check.

## 1. DNA helix — right-handed ✅

- **Measured** (`dna.js`): the discrete torsion sign `((d1 × d2) · d3)` of each backbone ribbon's
  centre line, in three's right-handed world.
  - `Backbone (coding)`: 78 positive, 0 negative.
  - `Backbone (template)`: 78 positive, 0 negative.
  - Positive torsion in a right-handed frame is a right-handed helix.
  - The same points through `LineRenderer.getPosition` (engine space, left-handed) give 0 / 78:
    the mirror, as expected.
  - The authoring (`HelixBuilder.ts:317-323`, `(cos a, y, sin a)` with `a` rising with `y`) is
    right-handed only when read as Unity's left-handed space, so the scenario never compensated by
    hand.
- **By eye** (`dna-crossings.png`, 4× crop of the default view): at both strand crossings the
  strand rising to the right (`/`) passes in front and hides the bases behind it — a right-hand
  screw.

## 2. Solar-system orbits — prograde ✅

- **Measured** (`orbits.js`, two snapshots 2.54 s apart at `timeScale` 1): `L_y = (r × v)_y`
  about the Sun, in three's world with +Y as north.
  - Positive for every planet: Mercury 28.5, Venus 58.2, Earth 76.7, Mars 104, Jupiter 219,
    Saturn 303.
  - Positive `L_y` in a right-handed frame is counter-clockwise seen from the north: prograde.
  - The engine-space values are the exact negatives.
- **The Moon**: positive about the Sun (73.8) too. Its orbit about the Earth was not separated;
  the scenario's comments do not claim one.

## 3. Sprites / billboards — face the camera, not mirrored ✅

- **No production or test scenario uses `SpriteRenderer`, a billboard or a shadow** (`grep` over
  `ScenarioCreator/Scenarios` and `TestScenarios`, 2026-11-14). So this is an engine check, not a
  content one.
- **Measured** (`shadow-sprite.js`): a 64×64 `Texture2D` whose left half is red, right half blue,
  and rows 48–63 green, on a `SpriteRenderer` (default `FaceCamera`).
  - On screen red's centroid is left of blue's (x 333 vs 387, same y).
  - The green band is at the bottom.
  - That is correct for the engine's pixel convention: `Texture2D` stores rows top-down
    (`Texture2D.ts:441`, "the engine's first [row] is the top"). So rows 48–63 are the *bottom*
    rows.
- **Not mirrored, not flipped.**
- **Input for N6 / G4:** Unity's `Texture2D.SetPixel(0, 0)` is the bottom-left texel; the
  engine's is the top-left. `readPixels` documents its top-left origin (`Texture2D.ts:381`);
  `setPixel`/`getPixel`/`setPixels` do not say which way they count. A port of Unity code that
  writes pixels by row comes out upside down.

## 4. Shadow direction — away from the light ✅

- **Measured** (same probe): one `DirectionalLight` at `Quaternion.euler(30, 60, 0)` with
  `LightShadows.Hard`.
  - Its `transform.forward` is (0.75, −0.5, 0.433).
  - A 2-unit cube stands on a 30×30 floor.
  - Floor luminance 2.6 units from the cube along the light's horizontal direction: **45**.
  - The opposite side: 131. The two sides at 90°: 58 (the cube's own face hides that point from
    this camera) and 131.
- The shadow lies on the side the light travels towards.
- **By eye** (`shadow-sprite.png`): the shadow wedge extends to the right and back of the cube,
  the light's +X/+Z direction.

## Found on the way — engine defects (row M0.2h)

Pixel-tested in `setters.js` (UnlitMaterial magenta cubes, centre pixel read through
`Application.captureFrame`):

| Assignment | Drawn |
|---|---|
| `filter.sharedMesh = m`, then `addComponent(MeshRenderer).sharedMaterial = mat` | yes |
| `filter.sharedMesh = m`, then `.material = mat` | yes |
| `filter.mesh = m`, then the renderer | **no** |
| renderer added first, then `filter.sharedMesh = m` | **no** |

- **`MeshRenderer._syncGeometry`** (`MeshRenderer.ts:189`) reads only `sharedMesh`.
  - `MeshFilter.mesh = m` stores a clone in `_meshInstance` and nulls `_sharedMesh`
    (`MeshFilter.ts:68-77`), so the object is never drawn.
  - Edits through the `mesh` getter (Unity's per-object editable copy) never reach the screen
    either.
  - Unity's `MeshFilter.mesh` setter assigns the mesh; nothing is invisible.
- **The renderer reads its filter only in `onAwake` and in `updateMesh()`.**
  - `addComponent` wakes it at once on an active object, so a mesh assigned afterwards is never
    picked up.
  - The JSDoc admits the deviation (`MeshRenderer.ts:150`, "In Unity, MeshRenderer automatically
    picks up MeshFilter changes. In this engine, call `updateMesh()` explicitly").
  - Every scenario happens to assign before adding the renderer, so none is visible-broken today.
  - The editor's inspector and any ported Unity code are not that careful.
- **Not a defect.** A new `StandardMaterial` is drawn only once its shader has compiled (~1–6 s
  here, asynchronous). An object created at run time stays invisible until then. That is the
  engine's compile-without-hitch design and cost this check an hour of false leads.
