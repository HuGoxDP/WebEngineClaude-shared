# E-G2a — the streaming prefetch's decoded object survives a `getUrl` host

Card: ROADMAP `E-G2a` — *"The streaming prefetch retains a full-size `Texture` for an asset the host
consumes via `Resources.getUrl` + `Cubemap.fromEquirectangular`: `skybox/stars_panorama.jpg` is
8192×4096 (128 MB live on the manifest path, absent on the ZIP path) — G2's remaining excess.
Engine fix: release the raw texture after the cubemap conversion, or make `getUrl` on a prefetched
asset not materialize a `Texture2D`."* Filed by SC-G2 after P7 pinned the diagnosis. Branch
`E-G2a-release-prefetched-texture` in `WebEngineTS` (+ `.claude-shared`).

## Mechanism (how it was found)

1. `Scenario._preloadCriticalAssets` → `Resources.prefetch(critical)` → for each path
   `_load(decoderType(path), path, speculative)`. For `skybox/stars_panorama.jpg` the decoder type is
   `Texture2D`, so the prefetch **decodes the 8192×4096 jpg into a `Texture2D`** and caches it at
   `refCount 1`, then `releaseByPath` drops it to 0.
2. A zero-reference cache entry is only reclaimed by `unloadUnused()` or
   `evictToBudget()` — and **no engine code calls `unloadUnused()`**, and no VRAM budget is set by
   default. So the entry, and the 128 MB `Texture2D`, lives for the rest of the run.
3. The scenario consumes the skybox as `url = await Resources.getUrl("skybox/…")` →
   `RenderSettings.skybox = await Cubemap.fromEquirectangular(url)`. `getUrl` delegates to
   `StreamingAssetSource.getBlobUrl`, which reads **raw bytes** — it never touches the cache. The
   cubemap is built from the bytes; the prefetched `Texture2D` is never used by anyone.
4. On the ZIP path nothing prefetches (`_preloadCriticalAssets` returns early when not streaming),
   so no `Texture2D` for the skybox ever exists — the asymmetry the e2e measured.

A per-path diagnostic (temporary e2e spec, `EngineObject.FindObjectsOfType(Texture)` with each
texture's `_estimateVramBytes()`) named the excess exactly: the manifest path held
`Texture from ArrayBuffer 8192x4096 128.0MB`, the ZIP path did not — one texture, 128 MB, and the
residual after SC-G2's lazy marking was 224.8 − 96.8 = 128.

## The fix

Option (b) from the card, generalised: asking for a path by URL is asking for its **bytes**, so any
zero-reference decoded object for that same path is dead weight — the host has declared it wants the
file, not the object. `Resources.getUrl` now releases every zero-reference cache entry for the
resolved path (any decoder type — the key is `TypeName::fullPath`, so `CacheEntry` gained the
resolved `path` for a path-keyed query) before delegating to the source's `getBlobUrl`.

Only `refCount <= 0` entries are released: a texture the scenario actually loaded is its own and
stays. `unloadUnused()`'s semantics are unchanged; nothing else moves.

## Rejected alternatives

- **`unloadUnused()` at a lifecycle milestone** (after the first frame, or after the deferred
  prefetch drains): drops *every* unreferenced warm entry, which undoes the deferred prefetch's
  purpose and re-decodes assets the scenario is about to ask for. The host never declared those
  unwanted.
- **Marking the skybox `lazy`** (content-side, SC-G2's lever): would take the backdrop off the
  prefetch entirely — a player-visible first-paint change on the streamed path only, and the engine's
  ladder marks skyboxes critical deliberately ("its absence is the most visible"). Rejected.
- **Letting `Cubemap` consume the warm texture**: the scenario calls `fromEquirectangular(url)`; a
  `fromTexture` overload would be new API for one scenario, and the raw copy would still need
  releasing after the conversion.

## Verification

- **Unit** — `tests/GetUrlReleasesUnused.test.ts` (4 tests): a prefetched unreferenced texture for
  the path is released by `getUrl` (count, `exists()`, live-texture count); a texture the scenario
  loaded survives; another path's unreferenced entry is left alone; with an empty cache the URL is
  served all the same. Fails on master without the fix (verified by stashing).
- **Engine checks** — `npm run typecheck` green; `npm test` **2868/2868 green** (169 files; the
  Application* load flakes seen mid-session reproduce identically on stashed master — machine
  contention from W1's concurrent engine work, not this change); `npm run build` green.
- **Streaming e2e (virtual-lab, engine `0.1.0-local.1794365596074`, my isolated `w2-verify` stack)** —
  solar-system ZIP vs manifest, **four runs**, all with the G2 assertions green:

  | run | textures | estimatedTextureVramBytes | draw calls |
  |---|---|---|---|
  | before E-G2a (after SC-G2) | 20 / 20 | 96.8 / 224.8 MB | 27 / 27 |
  | after E-G2a, run 1 | 20 / 20 | **96.8 / 96.8 MB** | 27 / 27 |
  | after E-G2a, run 2 | 20 / 20 | **96.8 / 96.8 MB** | 27 / 27 |
  | after E-G2a, run 3 | 20 / 20 | **96.8 / 96.8 MB** | 27 / 27 |
  | after E-G2a, run 4 | 20 / 20 | **96.8 / 96.8 MB** | 27 / 27 |

  G2 is closed: the manifest path now measures exactly like the ZIP path.

  **Recorded deviation — the spec's latency assertion, not this change.** The comparison test's fixed
  60 s first-frame ceiling failed in every run while W3's M2.1 e2e checks ran concurrently on the
  same machine (two WebGL stacks): the *ZIP* path alone took 79–100 s in those runs, versus 39–42 s
  in the quiet P7/SC-G2 windows. The spec itself documents a 30% spread on this hardware and
  asserts an absolute ceiling, not a ratio. The texture/VRAM/draw-call assertions — the ones G2 is
  about — passed in every run. The engine repo's own checks (typecheck/test/build) are fully green;
  the browser e2e is not a check of `WebEngineTS` per "Checks per repo". A quiet re-run of
  `streaming.spec.ts:233` closes this out and is expected on the next virtual-lab fire (M2.1/M2.2 or
  a consumer bump).

## What changed

- `src/engine/core/assets/Resources.ts` — `CacheEntry.path`; `_releaseUnreferencedForPath`;
  `getUrl` releases before delegating (with the reasoning in its doc comment).
- `tests/GetUrlReleasesUnused.test.ts` — new.
- `CHANGELOG.md` — Changed entry.
