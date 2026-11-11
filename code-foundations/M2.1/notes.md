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

## Final result (2026-11-11, the same stack, catalog verified in place)

The "23 failures" were **my own environment mistake**: the `down -v` cleanup between the
two runs wiped the published catalog, so every catalog-dependent spec failed against an
empty store (the first failure — `manifestUrl: null` for molecules — was exactly that).

With the stack up and `/api/catalog` re-checked first (10 rows, `manifestUrl` present),
the heavy specs re-run clean: **45 passed / 1 failed** (streaming, viewer-player, viewer,
student-golden-path — 30.8 min). The streaming spec alone: 6/7, the seventh is the
performance budget below. Combined with the full-suite run (91 passed / 2 skipped), the
editor changes nothing: **the whole suite passes except one hardware-bound budget**.

- **The one failure** — `streaming.spec.ts:233`, *"an asset-heavy scenario renders the
  same scene from a manifest as from its ZIP"*: the streamed first frame took ~100.7 s
  against the spec's 60 s budget (ZIP ~49 s, manifest ~127 s on software WebGL). The
  correctness half passes; the manifest path's speed on real hardware is the streaming
  lane's (E-G2a / R8), and the ~2.8x texture VRAM the same test records is the known G2.
  **No test was weakened** to get green — the budget stands and the finding is recorded.

## What landed

`virtual-lab/docs/e2e-with-editor.md` — the run procedure in a worker (editor context
override, the publish/import commands, chromium, the empty-catalog trap and the check
that tells it apart from a real breakage).
## Checks so far

Backend unit 288/288 and the Docker DB suite 1487/1487 are unaffected by this task (no backend
code changes); the browser suite is the deliverable here.
