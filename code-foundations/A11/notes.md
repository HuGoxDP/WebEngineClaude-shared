# A11 — ScenarioCreator on the release, `.meta` guids, decorators (notes)

Worker **W3**, 2026-11-11. Branch `A11-sc-release-guid-decorators` in ScenarioCreator + .claude-shared.
Row: **A11** (M1). Card: `tasks/A11-scenariocreator-on-release.md`. Plan:
`code-foundations/A11/plan.md`. Four commits, 13 files.

## What landed

### 1. The engine from the release (`fbe2c5c`)

`package.json` depends on
`https://github.com/HuGoxDP/WebEngineTS/releases/download/v0.2.0/WebEngineTS-0.2.0.tgz`
(verified 302 → CDN), the lockfile records that tarball's integrity, the committed
`WebEngineTS-0.1.0.tgz` is deleted, and `CLAUDE.md`/`ci.yml`'s "committed tarball" wording is
fixed. **Archive diff vs a master baseline build: `engineVersion` `0.1.0-local.1794342651370`
→ `0.2.0` in every manifest, file lists identical for all ten production archives** — the exact
outcome the card asks for.

### 2. The guid from `<file>.meta` (`0a321cb`)

`scenario-meta.mjs` gains `assetGuidFor(scenarioDir, scenarioId, assetPath)`: the sidecar's guid
when the file parses and states exactly 32 hex (case-insensitive, lowercased), else the derived
guid with a printed warning. Both builders take it (the ZIP manifest and the streaming manifest
share the module, so they cannot disagree), and `isAssetMetaFile` excludes `.meta` from the
assets copy — so neither artifact carries the editor's bookkeeping. Fixture
`TestScenarios/GuidFromMeta`: stated guid `a1b2c3d4…` and derived `cf60d73f…` appear in **both**
manifests, no `.meta` in the ZIP or the objects store. All ten production archives and streaming
manifests **byte-identical** to the previous build.

### 3. Legacy decorators (`229480d`)

Recorded first, without the flag: the fixture's three decorator lines fail with **TS1240
("Unable to resolve signature of property decorator … Argument of type 'undefined'")** and the
build exits 2. `--experimentalDecorators` is added to the `tsc` args; `--emitDecoratorMetadata`
is deliberately **not** (the engine reads no design: type metadata — grep of
`WebEngineTS/src`; the editor's tsconfig carries the one flag alone). Fixture
`TestScenarios/DecoratorScenario` (a `@Serializable` Spinner with `@SerializedField`/`@Range`)
builds. Production archives and streaming manifests again byte-identical.

### 4. Docs (`4368cd3`)

`CLAUDE.md` states both contracts (the `.meta` rule with its malformed-file behaviour, the
decorators flag and why no metadata flag).

**Card item 4 (`entryScene`, §4.9) needed no work**: engine E1 landed with B0, and the builder
already reads `meta.entryScene`, validates it against `assets/`, and carries it into the manifest.

## Checks (the repo's own sequence, on this machine — Windows, bsdtar present)

`npm ci` · `build:all` · `build -- --all --tests` · `manifest:all -- --tests` ·
`manifest:verify` (112 files, 0 problems) · `manifest:verify-fetch` (every manifest through the
engine's own StreamingAssetSource) · `manifest:verify-render` (both paths agree) — all green.

## Deviations

- None against the card. The `.meta` acceptance rule (32 hex, warn + derive on anything else) is
  the plan's decision 1, recorded in `plan.md`.

## Follow-ups

- B4 (editor stage 9) is unblocked by the `.meta` contract; A11 also unblocked nothing else
  directly (M1.1 depends on A11, B4 depends on A11).
