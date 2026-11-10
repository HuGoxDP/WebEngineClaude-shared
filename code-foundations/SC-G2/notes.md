# SC-G2 — solar-system's redundant fallback textures ship Lazy

Card: ROADMAP `SC-G2` — *"Stop shipping redundant fallback textures / mark them `Lazy`"*, source
`PLAN.md` §4.2, the content half of G2 (diagnosis confirmed by `P7`). Branch
`SC-G2-lazy-fallbacks` in `ScenarioCreator` (+ `.claude-shared` for the row).

## What is redundant, and why the code proves it

`Scenario.ts` builds each body as `model ? <glb> : <textured sphere>`:

```ts
const model = def.model ? await Resources.tryLoad(GameObject, `models/${def.model}`) : null;
if (model) { /* use the glb, no texture is requested */ }
else { /* albedo / normal / emissive from the loose files */ }
```

Six bodies ship a `.glb` that **does** load (Mercury, Venus, Mars, Jupiter, Saturn, Moon), so their
loose albedo is never requested at run time — it is the fallback for a model that fails to load.
Earth has no `.glb`, so `earth.jpg` / `earth_normal.jpg` / `earth_night.jpg` are used and stay on
the default ladder, as does `sun.jpg` (the Sun is built in code) and `skybox/**` (critical).
`textures/saturn_ring.png` is referenced by **no** code path at all — dead weight.

## What the streamed path did with them

The manifest ladder (`build-manifest.mjs`, `DEFAULT_PRIORITIES`) marks `skybox/**` critical,
`*.glb` high and everything else low — nothing lazy. The engine's streaming prefetch decodes every
non-`Lazy` manifest asset, so the path decoded all six fallbacks (and the ring) into live
`Texture` objects the ZIP path never creates (its `Resources.tryLoad` is lazy and the code never
asks for them). Measured (P7, engine `0.1.0-local.1794342651370`): 96.8 MB (ZIP) against
273.8 MB (manifest) with the same 20 uploaded textures and 27 draw calls.

## The fix

`Scenarios/solar-system-scenario/scenario.meta.json` gains a `streaming.priorities` block marking
the seven assets `lazy` (object glob → priority, first match wins, prepended to the default
ladder). Lazy keeps them **shipped** — a glb that ever fails to load still falls back to the loose
texture, so no pixel can change — while the prefetch skips them.

Rebuilt with `build-manifest.mjs --scenario solar-system-scenario` (18 assets: 1 critical, 6 high,
4 low, **7 lazy**).

## Verification (streaming e2e, 7/7 green, both runs after the change)

| | textures (uploads) | draw calls | estimatedTextureVramBytes |
|---|---|---|---|
| ZIP | 20 | 27 | 96.8 MB |
| manifest, before | 20 | 27 | 273.8 MB (2.83×) |
| manifest, after | 20 | 27 | **224.8 MB** (2.32×) |

## What remains — one engine-side Texture, filed as E-G2a

The remaining 128 MB is a **single** live texture: a diagnostic dump of
`EngineObject.FindObjectsOfType(Texture)` per path shows the manifest path holding
`Texture from ArrayBuffer 8192x4096 128.0MB` that the ZIP path does not. `stars_panorama.jpg` is
the only 8192×4096 asset, and the scenario consumes it via
`Resources.getUrl` + `Cubemap.fromEquirectangular`. On the ZIP path that never materializes an
engine `Texture` (the URL is fetched straight into the cubemap conversion); on the manifest path
the eager prefetch decodes the skybox as a `Texture2D` and the resource cache keeps it. So the
content half of G2 is closed and the engine half is one precisely-scoped follow-up (release the raw
texture after conversion, or keep `getUrl` from materializing a `Texture2D` for a prefetched
asset) — E-G2a.

## Checks

- `npm run build:all` / `npm run build -- --all --tests` / `npm run manifest:all -- --tests` / `npm run manifest:verify` — all green (108 referenced files, 0 problems).
- Streaming e2e against the lab stack — 7/7 (above).
