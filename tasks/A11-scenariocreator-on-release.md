# A11 — ScenarioCreator on the release; guids from `.meta`; the decorators flag

| | |
|---|---|
| Repo / branch | ScenarioCreator · `claude/scenario-platform-architecture-24f9fy` (head `fbdc7c3`) |
| Model | **Sonnet** |
| Size | 1–2 days |
| Depends on | A9 |
| Blocks | B4 (editor stage 9 needs `.meta` guids), B5 (editor packager compares manifests with this builder) |

## Why

Three items from the shared `PLAN.md` §4 that the editor's milestone 1 needs, plus moving off the
local pack. `engineVersion` in every manifest is stamped from the installed engine, so after this the
platform's `/admin` shows `0.2.0` instead of an unfetchable `-local` stamp.

## Read first

`CLAUDE.md` (all of it — the builder's rules), `build-package.mjs`, `scenario-meta.mjs` (identity:
`sha256(id + NUL + path)` guids, shared with the manifest emitter), `build-manifest.mjs`,
`.github/workflows/ci.yml` (Windows, no npm cache on purpose).

## Do

1. **Engine from the release.** `package.json`: `"WebEngineTS":
   "https://github.com/HuGoxDP/WebEngineTS/releases/download/v0.2.0/WebEngineTS-0.2.0.tgz"`; update
   the lockfile; delete the committed `WebEngineTS-0.1.0.tgz`; fix `CLAUDE.md`/`README.md` where they
   say the engine is a committed tarball. Rebuild all: `--all`, then `--all --tests`; the four
   verifiers. Compare each archive's file list with the previous build (only `manifest.json`'s
   `engineVersion` should differ); if a scenario's scripts no longer compile against the new engine,
   fix the scenario (content lives here) and say what changed.
2. **Guid from `<file>.meta` when one exists** (`PLAN.md` §4.7, blocks editor stage 9). In
   `scenario-meta.mjs`: if `assets/<path>.meta` exists and holds `{ "guid": "<32 hex>" }` (match the
   format the editor will write — read `WebEngineTSEditor/docs/unity-editor-plan.md` §3.3; if it is
   not specified there, use `{ "guid": "…" }` and record the choice in that doc), use that guid;
   otherwise derive as today. `.meta` files are **not** copied into the archive (the manifest carries
   the guid). Both the ZIP manifest and the streaming manifest take the same guid (they share
   `scenario-meta.mjs`). Test: a fixture scenario under `TestScenarios/` with one `.meta` — its guid
   appears in both manifests; the ten production scenarios' manifests are byte-identical to before.
3. **`--experimentalDecorators`** (`PLAN.md` §4.8): `build-package.mjs` runs `tsc --ignoreConfig`
   without it, and the engine's decorators are the legacy kind. Add a test scenario under
   `TestScenarios/` with a script using `@SerializedField` and `@Serializable`; build it without the
   flag (record the error), add `--experimentalDecorators` (and `--emitDecoratorMetadata` only if the
   engine needs `reflect-metadata` types — check `WebEngineTS/src/engine/core/reflection`), build
   again. Production archives must stay byte-identical except where a script used decorators (none
   do today).
4. **`entryScene`** (§4.9) waits for engine E1 (card B, `B-milestone-1.md` §E1); skip here.

## Acceptance

CI green on Windows; production manifests unchanged except `engineVersion`; the `.meta` and decorator
test scenarios build and pass the verifiers; `CLAUDE.md` describes the guid rule.

## Commits

`build: build scenarios against the released engine v0.2.0`, `feat: take an asset's guid from its
.meta file`, `fix: compile scenario scripts with legacy decorators`, `docs: …`.

## Report back

The archive diff summary, the `.meta` format chosen, the decorator before/after.
