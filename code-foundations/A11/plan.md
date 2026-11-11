# A11 — ScenarioCreator on the release, `.meta` guids, decorators (plan)

Standard gate (Sonnet-sized, content + build tooling). Source: `tasks/A11-scenariocreator-on-release.md`,
`PLAN.md` §4 items 4.6–4.8, editor plan `WebEngineTSEditor/docs/unity-editor-plan.md` §3.3.
Branch `A11-sc-release-guid-decorators` in ScenarioCreator (+ .claude-shared for claim/report).

## Decisions taken during research (with evidence)

1. **The `.meta` shape is specified**: editor plan §3.3 — *"Редактор пишет рядом с каждым
   ассетом `<файл>.meta` (JSON: `guid`, позже — настройки импорта)"* and
   *"ScenarioCreator берёт `guid` из `.meta`, если он есть, иначе считает как раньше"*.
   Current guids are `sha256(id + NUL + path)` hex **sliced to 32** (`scenario-meta.mjs`),
   so `<32 hex>` in the card and the editor's format agree — no format decision to record.
   Acceptance: a `.meta` guid is used only when it is exactly 32 hex (case-insensitive,
   normalized to lowercase); anything else is a warning and the derived guid, because a
   malformed id silently mis-addressing an asset is worse than a derived one.
2. **`.meta` files must not enter the archive.** `assets/` is copied verbatim today, so the
   build must exclude `*.meta` from the ZIP's assets copy AND from the streaming store's
   object enumeration — the manifest carries the guid, the file stays in the source tree.
   (The editor owns those files; the platform never needs them.)
3. **`--emitDecoratorMetadata` is NOT needed**: the engine has no `reflect-metadata` import
   and no `design:type` reader (grep of `WebEngineTS/src`), and the editor's own tsconfig
   carries `experimentalDecorators` alone. Only `--experimentalDecorators` is added.
4. **No scenario uses decorators today** (grep of `Scenarios/` + `TestScenarios/`), so the
   only archive change expected from item 3 is in the new test scenarios.

## Phase 1 — the engine from the release (build)
- `File scope`: `package.json`, `package-lock.json`, delete `WebEngineTS-0.1.0.tgz`,
  `README.md`, `CLAUDE.md`
- `package.json` takes `"WebEngineTS":
  "https://github.com/HuGoxDP/WebEngineTS/releases/download/v0.2.0/WebEngineTS-0.2.0.tgz"`
  (verified: the URL answers 302 → CDN); `npm install` refreshes the lockfile; the committed
  tarball is deleted; the two docs' "committed tarball / file: dependency" lines are fixed.
- Baseline first: on `master`, a full `--all` + `--all --tests` build + `manifest:all` into
  `ReleaseScenarios/`, copied to a scratch dir, so the after-build diff is real.
- Rebuild on the branch; diff every archive's file list with the baseline: only
  `manifest.json`'s `engineVersion` may differ.

## Phase 2 — the guid from `<file>.meta` (feat)
- `File scope`: `scenario-meta.mjs`, `build-package.mjs`, `build-manifest.mjs`,
  `TestScenarios/GuidFromMeta/**`
- `scenario-meta.mjs`: a new `assetGuidFor(scenarioDir, scenarioId, assetPath)` that reads
  `<scenarioDir>/<assetPath>.meta` (JSON), validates `{guid: <32 hex>}` and returns it, else
  the derived guid; both call sites switch to it; the ZIP's assets copy and the streaming
  store's enumeration skip `*.meta`.
- Fixture `TestScenarios/GuidFromMeta/` (name unique across roots — the builder refuses
  duplicates): one asset with a `.meta` (a chosen 32-hex guid) and one without; assert the
  manifest carries the chosen guid for the first and the derived for the second, and that no
  `.meta` file is in the ZIP or the objects store.

## Phase 3 — legacy decorators compile (fix)
- `File scope`: `build-package.mjs`, `TestScenarios/DecoratorScenario/**`
- Depends on: Phase 2 (both touch `build-package.mjs`).
- Record the failure first: a scenario using `@Serializable` / `@SerializedField` fails to
  compile without the flag (TS 6: "Experimental support of decorators is a feature that is
  subject to change…"), then add `--experimentalDecorators` to the `tsc` args and build it
  again. No `--emitDecoratorMetadata` (decision 3).
- Production archives stay byte-identical (decision 4).

## Phase 4 — report (docs, Minimal, last)
- `File scope`: `.claude-shared/**` (ROADMAP row → ✅, `code-foundations/A11/notes.md`,
  CHANGELOG)
- Depends on: Phases 1–3. Merge: ScenarioCreator first, `.claude-shared` last.

## Checks (the repo's own, per `.claude-shared/tasks/README.md`)

`npm ci` · `npm run build:all` · `npm run build -- --all --tests` · `npm run manifest:all --
--tests` · `npm run manifest:verify` · `manifest:verify-fetch` · `manifest:verify-render`
— CI is `windows-latest` and needs Windows `tar.exe`, which this machine has; the whole
sequence runs here before any push.
