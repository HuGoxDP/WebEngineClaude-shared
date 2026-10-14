# A4 — Readers state what they read: public version API, strict gates, manifest major

| | |
|---|---|
| Repo / branch | WebEngineTS · `claude/scenario-platform-architecture-24f9fy` |
| Model | **Sonnet** |
| Size | 1 day |
| Depends on | A1 (same files; avoid conflicts) |
| Blocks | A5, A8, A9 |

## Why

The rollout decided for format version 2 is **readers first**: every reader states what it reads and
refuses the rest before any writer produces version 2. The platform already does
(`virtual-lab/backend/player-formats.js`). The engine only has the internal
`SceneSerializer._refuseUnknownVersion`, which also accepts `"3"`, `0` and `null` (review #19), is not
applied to a lone GameObject or before a prefab's references are loaded, and nothing checks
`manifestVersion`. The editor hard-codes `data.version !== 1` because it cannot ask the engine.

## Read first

- `src/engine/core/serialization/SceneSerializer.ts` — `_refuseUnknownVersion` (~535), its callers
  (`deserializeScene` ~268), `deserializeGameObject`, `_needsLinkReader` (~515).
- `src/engine/core/serialization/Prefab.ts` — `fromJSON` (~269 calls the gate), `toJSON`.
- `src/engine/core/serialization/AssetFiles.ts` — `decodePrefab`, `loadReferences`, the material and
  physic-material readers (`.mat.json`, `.physicmat.json`; they carry no `version` today).
- `src/engine/core/scenario/Scenario.ts` — `_validateManifest` (~1048).
- `src/engine/core/assets/StreamingManifest.ts` — `SCENARIO_MANIFEST_VERSION` (~161), its own
  `schema` check.
- `src/engine/core/BuildInfo.ts` (or wherever `BuildInfo` lives: `grep -rn "class BuildInfo\|BuildInfo =" src`).
- `virtual-lab/backend/player-formats.js` — the platform's rules and messages, to stay consistent.

## Do

1. **Public API** on `SceneSerializer` (names in the style of the surrounding public API; JSDoc on
   each):
   - `readonly readableVersions: readonly number[]` — frozen `[1, 2]`.
   - `versionOf(json: unknown): number | null` — absent `version` → `1`; an integer → it; anything
     else (`"2"`, `0`, `null`, `1.5`, `-1`) → `null` (unreadable).
   - `canRead(json: unknown): boolean` — `versionOf` is in `readableVersions`.
   - An exported error class, e.g. `UnsupportedFormatError extends Error` with `readonly version:
     unknown`, `readonly readable: readonly number[]`, `readonly what: "scene" | "prefab" | "gameObject"
     | "material" | "physicMaterial"`. Every refusal throws it, so an editor can localize the message
     without parsing a string.
2. **One rule, every reader.** `_refuseUnknownVersion` becomes a thin wrapper over `canRead` that
   throws `UnsupportedFormatError`. Apply it in `deserializeScene`, `deserializeGameObject`,
   `Prefab.fromJSON`, and in `decodePrefab` **before** `loadReferences` (a version-3 prefab must not
   trigger loads of its references first). Material and physic-material readers: absent means 1;
   refuse anything else the same way. Writers of those two files keep writing no `version` (byte for
   byte); say so in the reader's JSDoc.
3. **Manifest major.** `Scenario._validateManifest` refuses a `manifestVersion` whose major is not 1
   (accepts `"1"`, `"1.0"`, `"1.2"`, `"1.0.0"`, and the number `1`; refuses `"2.0"`, `"v1"`, `"1.0abc"`,
   `""`). Same for the manifest produced from a streaming manifest. Error text: "…requires a newer
   engine (manifestVersion 2.0; this build reads 1.x). Update the engine." Match the platform's rule
   exactly (`/^(\d+)(?:\.\d+)*$/`, major in `[1]`).
4. **`engineVersion`** in the manifest: never refuse. If it parses as semver and its major.minor is
   newer than `BuildInfo.version`'s (ignore pre-release stamps such as `-local.<ts>`; skip entirely when
   `BuildInfo.isBuild` is false), `console.warn` once naming both versions.
5. **Exports**: add the new error class and any new type to `src/engine/index.ts` (named export and
   the default namespace object — follow how other classes are exported there).

## Tests (`tests/FormatVersions.test.ts`, new)

`readableVersions` is frozen and `[1, 2]`; `versionOf` for each input above; each entry point
(scene, GameObject, prefab via `fromJSON` and via `decodePrefab` — assert no reference load was
attempted for a version-3 prefab, e.g. with a spy on the loader), material and physic material:
version 3 → `UnsupportedFormatError` with `.version === 3`, `.what` right; absent/1/2 accepted (1 for
materials). Manifest majors: the accepted and refused lists above. `engineVersion` warning: newer
major.minor warns once, `-local` stamps and dev builds do not.

## Acceptance

`npm run typecheck`, `npm test`, `npm run build` green. `dist/WebEngineTS.d.ts` diff against
`e6a8500` (build both; `diff`) shows only the intended new public symbols, no `THREE` types.
CHANGELOG *Added*: the API; *Changed*: "a scene, prefab, GameObject, material or physic material
file whose `version` is not an integer this build reads is refused with `UnsupportedFormatError`
(before: `"3"`, `0` and `null` were accepted, and a lone GameObject was not checked)"; "a manifest
whose `manifestVersion` major is not 1 is refused". `design/prefab-instances-plan.md`: the gate
section and §11 (#19 closed).

## Out of scope

The editor using the API (A8). Changing what any writer writes.

## Commits

`feat(serialization): the engine says which file versions it reads` (API + gate + tests),
`feat(scenario): refuse an unknown manifestVersion major` , `docs: …`.

## Report back

The public API as it landed (signatures), the d.ts diff summary, test counts.
