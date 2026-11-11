# M2.1 — the browser e2e with the editor override (notes, in progress)

Worker **W3**, 2026-11-11. Branch `M2.1-e2e-with-editor` in virtual-lab + .claude-shared.
Row: **M2.1** (M2). Source: `PLAN.md` §2 item 7 — *"Run the browser e2e against the stack with
the editor override applied. The override was checked by hand and by the header tests; the
Playwright browser was not installed, so the eleven browser specs did not run
(`npx playwright install` in `e2e/`)."*

## Environment built (all local, gitignored / not committed)

- `npx playwright install chromium` in `e2e/` — done.
- `ReleaseScenarios` junctioned into the worktree
  (`cmd /c mklink /J W3\ScenarioCreator\ReleaseScenarios <primary>\ScenarioCreator\ReleaseScenarios`),
  like W2's P7 setup.
- The editor override's build context `../../WebEngineTSEditor` is the OWNER's layout
  (virtual-lab under `testv/`); in a worker worktree the editor sibling is one directory up, so the
  run uses a **temporary** `docker-compose.editor.local.yml` (context `../WebEngineTSEditor`).
- The shared `virtual_lab_*` volumes belong to other stacks with different DB passwords, so the run
  takes a **temporary** `docker-compose.m2-1.local.yml` that renames all five volumes
  (`w3e2e_*`). The stack then starts clean and the `.env` password matches.
- Catalog: `node scripts/publish-release.mjs --release <W3>/ScenarioCreator/ReleaseScenarios`
  (10 rows; 5 "problem" notes for the bench scenes — no `catalog-metadata.mjs` subject — the same
  as W2's run) and `node scripts/import-release-assets.mjs --release <same>` (17 manifests).

## First full run (21 spec files, the whole suite, `E2E_BASE_URL=http://127.0.0.1:8044`)

**91 passed · 2 skipped · 14 did not run — 29.2 min, exit 0.** The editor served at /editor/ (200).

## Targeted re-run of the 14 (streaming, viewer-player, viewer, student-golden-path)

**23 failed · 8 did not run · 15 passed — 35.4 min, exit 1.** So the "did not run" of the full
suite are, run directly, mostly **real failures** (or very slow — one streaming case took 9.1 min).

Representative failure (`streaming.spec.ts:151`): *"the catalog advertises the manifest"* —
`/api/catalog/molecules` answered `manifestUrl: null` while `/a/molecules.json` served 200.
**Re-checked after the run: the same endpoint now answers `manifestUrl: "/a/molecules.json"`** —
the stack was recreated between the publish/import and the test moments (see the env notes), so
this looks time- or state-dependent rather than a code defect. To settle before fixing anything.

## Next (for the following fire)

1. Bring the stack up on the same volumes (the images and content are already built/published),
   re-check `/api/catalog/molecules` **before** starting the suite, then re-run the 14 once.
2. Separate the slow-from-crashing: if a spec only times out on this hardware, that is a
   capacity finding for the notes (SwiftShader WebGL), not a product bug.
3. Only what still fails after (1) is a defect to fix.

## Checks so far

Backend unit 288/288 and the Docker DB suite 1487/1487 are unaffected by this task (no backend
code changes); the browser suite is the deliverable here.
