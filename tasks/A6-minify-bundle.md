# A6 — Minify the standalone bundle; a size budget in CI

| | |
|---|---|
| Repo / branch | WebEngineTS · `claude/scenario-platform-architecture-24f9fy` |
| Model | **Sonnet** |
| Size | ½ day |
| Depends on | — |
| Blocks | A9 |

## Why

`dist/WebEngineTS.standalone.js` is what every student downloads (the platform's import map points
at it). It is built **unminified, with every comment**: 3,980,105 bytes raw, **892,498 bytes gzip**.
A minified build of the same file measured 1,404,892 raw / **383,567 gzip** (esbuild default minify,
2026-10-13) — about 508 KB less per student. Nothing in the build minifies today
(`rollup.config.mjs`, `standaloneBuild`, ~line 155).

## Read first

- `rollup.config.mjs` — the three builds; `standaloneBuild` (~155–168), `buildPlugins()`.
- `src/engine/core/reflection/Decorators.ts:52` — `typeName = opts.typeName ?? target.name`. Every
  engine `@Serializable` passes `typeName` explicitly today (62 of 62), but **class names still
  matter**: user scenario code registers by class name, warnings and the editor print
  `constructor.name`, and the scenario entry is brand-checked. Minify with class and function names
  kept.
- `.github/workflows/ci.yml` — the Build step (~63).
- `README.md` "Releasing" and `.github/workflows/release.yml` — the release ships the standalone.

## Do

1. Add `@rollup/plugin-terser` as a devDependency (`npm install -D @rollup/plugin-terser`; keep the
   lockfile change). Note: the engine's CI installs with `npm install`, not `npm ci`, because the
   committed lockfile was made on Windows (`@emnapi` peers); do not "fix" that here.
2. Apply it to **`standaloneBuild` only** (consumers bundling the ESM/CJS builds minify themselves and
   keep readable stack traces): `terser({ keep_classnames: true, keep_fnames: true, format: {
   comments: /@license|@preserve|^!/ } })`. The licence comments of three.js and jszip must survive
   (MIT notice) — check with `grep -c "@license" dist/WebEngineTS.standalone.js` before and after.
3. Source map: keep generating it, but `sourcemap: "hidden"` for the standalone so the bundle carries
   no `//# sourceMappingURL` pointing at a file the platform does not copy (Angular copies only
   `WebEngineTS.standalone.js`). Ship the `.map` in the release assets for debugging.
4. `scripts/check-bundle-size.mjs`: gzip-compress `dist/WebEngineTS.standalone.js` (Node `zlib`,
   level 9), print raw and gzip sizes, exit 1 if gzip > **450,000** bytes. Add `"size": "node
   scripts/check-bundle-size.mjs"` to `package.json` and a CI step after Build: `npm run size`.
5. Measure: write the before/after sizes into the CHANGELOG *Changed* entry ("the standalone bundle is
   minified: X → Y bytes gzip; class and function names are kept").

## Tests / checks

- A smoke test that the minified bundle works: `tests/StandaloneBundle.test.ts` that imports
  `dist/WebEngineTS.standalone.js` **only if it exists** (skip with a clear message otherwise — CI
  builds after testing, so add the test run to CI *after* the build step:
  `npx vitest run tests/StandaloneBundle.test.ts` as its own CI step) and checks: `BuildInfo` is
  present; `TypeRegistry` has the same sorted list of type names as the ESM build; a class keeps its
  name (`new GameObject("x").constructor.name === "GameObject"`).
- A browser check: if ScenarioCreator's `npm run manifest:verify-render` (headless browser, both
  load paths) can run in the session, run it against the minified bundle; otherwise say in the report
  that the browser check was not run, and the reviewer runs it.

## Acceptance

`npm run build` then `npm run size` prints gzip ≤ 450,000 and exits 0; licence comments present;
`npm test` green; the new smoke test passes after a build; CI has the two new steps.

## Out of scope

Brotli on the platform's nginx (card E-growth, platform lane). Code splitting.

## Commits

`build: minify the standalone bundle, keeping class names and licences`, `ci: fail when the
standalone bundle grows past its budget`.

## Report back

Raw/gzip sizes before and after, the budget, the smoke-test result.
