# A2 — E11 docs and API cleanup (conventions review of `e6a8500`)

| | |
|---|---|
| Repo / branch | WebEngineTS · `claude/scenario-platform-architecture-24f9fy` |
| Model | **Sonnet** |
| Size | ½ day |
| Depends on | A1 (it edits the same CHANGELOG bullets) |
| Blocks | A7, A9 |

## Why

An API/conventions reviewer read the E11 change set (`bde23fc..e6a8500`) against the code. The
behaviour is right; several consumer-facing statements are not, and one type leaks undocumented.
These are what a consumer reads in the release notes, so they must be true before `v0.2.0`.

## Read first

- `CHANGELOG.md` `[Unreleased]` (whole section).
- `src/engine/core/GameObject.ts` — `isPrefabInstance` / `prefabSource` JSDoc (~130–140).
- `src/engine/core/serialization/SceneSerializer.ts` — `SerializeOptions.prefabs` JSDoc (~130–145),
  `SerializedScene.version` JSDoc (~210–220), the `as any` at ~1584.
- `src/engine/core/serialization/ValueSerializer.ts` — `SerializeContext.componentIndex` JSDoc
  (~45–52), `RefScope` (~104), `pendingGORefs` / `pendingComponentRefs` (~130–150).
- `src/engine/core/serialization/PrefabOverride.ts` — class JSDoc of `PrefabDiff` (~296).
- `src/engine/index.ts` — the `export type { … }` list.
- `design/prefab-instances-plan.md` — D-2 (~745), §5.4 (~350), §6.1 sketch (~388), §11 Bookkeeping
  (~1312), Status line at the top, D-11 (~754), §7.9.

## Do

1. **A prefab with no asset id loses its link on copy and save.** That is decided (plan §7.9) but
   never stated. Qualify, in the CHANGELOG *Added* bullet ("An instance keeps its link through undo,
   Play restore, copy and paste and `EngineObject.Instantiate`"), the `isPrefabInstance` /
   `prefabSource` JSDoc and the `SerializeOptions.prefabs` `"link"` JSDoc: the link survives a copy or
   a save only when the prefab has an asset id (saved, or loaded through `Resources` /
   `AssetDatabase`); otherwise the instance is written as a plain tree. Point D-11 at §7.9. **Add a
   test** in `tests/PrefabIdentity.test.ts`: `Prefab.fromGameObject(src).instantiate()` → `isPrefabInstance`
   true; `EngineObject.Instantiate` of it and a scene round trip → `isPrefabInstance` false.
2. **`componentIndex` returns -1 only for a component removed with `removeComponent`.** Fix the JSDoc
   ("removed or destroyed" is false for destroyed; that is D5, card A3). If A3 has landed first,
   keep "or destroyed" and check it is now true.
3. **`PrefabDiff` stays internal** (decision: option (b) of the review). Keep the class-level
   `@internal`. Change the `Prefab` JSDoc (createVariant ~144, getOverrides ~304) and the three
   CHANGELOG bullets that present `PrefabDiff.compareChanges` and its resolver so they point at
   `Prefab.getChanges` / `Prefab.getOverrides` / `Prefab.applyInstance` instead. Revisit at editor
   stage 16 (card D3), which may need diffs as public API.
4. **`SerializedScene.version` JSDoc**: replace "byte for byte as before" with "in the format before
   prefab links (the fixes for destroyed children, inline assets and references to removed
   components aside)".
5. **`RefScope`**: add it to `index.ts`'s `export type { … }` list (typedoc's one new warning
   disappears — check with `npx typedoc --emit none` if typedoc is configured, else by reading
   `index.ts`). Reword the CHANGELOG bullet to: "`SerializeContext` gains an optional `locate`;
   pending-reference entries gain `ref` (`RefScope`); `componentIndex` may return -1."
6. **CHANGELOG wording**: drop "and is no longer instantiated as an empty shell" (that shell existed
   only in unreleased work); mirror the D3 entry's measurement note under *Changed* (the file's
   header rule says anything that moves a measured number belongs there); remove the stray blank
   line inside the *Added* list.
7. **Plan statements**: D-2 and §5.4 — "scene files keep version 1 and their bytes; prefab files
   keep the `{ name, snapshot }` shape with `id` keys added". §11 Bookkeeping — E11 is tracked in the
   shared `PLAN.md` §1.5, remove the ENGINE-GAPS item. §6.1 — mark the `SceneCtx` block as the
   pre-Stage-6 sketch, or update it to the real fields (`locate` returns `Array<number|string>`;
   `prefabRoot`, `minted`, `mintLive`, `prefabIds`, `writtenAssets`). Status line — add D4, D5 (if
   A3 landed) and "two review passes, 2026-10-12/13".
8. **`as any`** at SceneSerializer ~1584: type it (`owner.constructor as new (...args: never[]) =>
   object` or the type `getAllFields` takes) or add a one-line reason, as at the four older sites.

## Acceptance

`npm run typecheck`, `npm test` (one new test), `npm run build` green. `grep -n "byte for byte"
src/engine/core/serialization/SceneSerializer.ts` shows no unqualified claim.
`grep -n "PrefabDiff.compareChanges" CHANGELOG.md src/engine/core/serialization/Prefab.ts` returns
nothing in consumer-facing text.

## Out of scope

Removing private JSDoc (95 new private members carry it — an owner decision about the CLAUDE.md
rule, `OWNER-DECISIONS.md` #6). Behaviour changes.

## Commits

`docs(serialization): …` for 1–7 (one or two commits), `refactor(serialization): type the constructor
passed to getAllFields` for 8, `test(serialization): …` folded into the first.

## Report back

The list 1–8 with done/not done and the commit for each.
