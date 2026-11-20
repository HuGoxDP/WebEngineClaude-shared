# M0.2hr5 — real Kepler-order case 5, honest coverage claims, comment truth: task report (W3, 2026-11-19)

Task: M0.2hr5 — Claude review finding on M0.2h (ROADMAP M1, ¼ h). The V1 pixel
probe's case 5 claimed to cover the Kepler SweptArea pattern but deactivated
the object *before* adding the components — a wake-time-read duplicate of case
3's mechanism, never "renderer awake with no mesh, mesh arrives later while
inactive". Plus a stale `MeshFilter.ts:18` field comment ("first write" — the
getter clones on first read since M0.2h).

Branch `M0.2hr5-verification-doc-fixes` in both repos.
Worktrees: `.workers/W3/WebEngineTS` (engine HEAD `c1846d1`),
`.workers/W3/.claude-shared` (docs).
Research `research.md`, plan `plan.md`, build log `notes.md`.

## Key finding — the prescribed mutation check was falsified (measured)

The card prescribed: delete `MeshRenderer.onEnable` re-sync → case 5 FAILS.
**False, measured** (8 research runs + 3 build runs): the push notify
(`set sharedMesh` `MeshFilter.ts:52` → `_notifyRenderer` `:128-130` →
`MeshRenderer.updateMesh` `:176-187`) has **no active-state gate**, so it syncs
geometry while inactive; `onEnable` re-sync is a redundant second safety net.
Deleting the `onEnable` re-sync alone leaves 5/5 DRAWN; deleting the notify
body alone fails case 4 (`rendererFirst+shared`) while case 5 stays DRAWN
(`onEnable` catches it) — 4/5. The discriminator for case 5 deletes **both**
(≈ pre-M0.2h wake-time-only reads): rewritten cases 4+5 fail, old case 5 still
passes. Deviation lead-visible in `plan.md`; review
re-executes the double mutation independently.

## What landed

- **Phase 1 — shared `526a6a6`**: `code-foundations/V1/setters-m02h.js` case 5
  rewritten to the real Kepler order (`SweptArea.ts:47-49`, `:91-92`):
  MeshFilter + MeshRenderer (magenta UnlitMaterial) added while active,
  `setActive(false)`, `filter.sharedMesh = Mesh.createCube(2)` (Kepler assigns
  **sharedMesh**, not `.mesh`), `setActive(true)`. Key `keplerOrder+reactivate`.
  Cases 1-4 and `setters.js` untouched. +6/−4.
- **Phase 1 — engine `c1846d1`**: `MeshFilter.ts:18` comment "made on the first
  write through {@link mesh}" → "made on the first read of {@link mesh}".
  Verified against code: getter clones at `:75`, setter stores the reference
  at `:93`. Comment-only, +1/−1, no behavior delta. Engine CHANGELOG entry
  skipped per precedent (hr1/hr2 entries describe consumer-visible behavior;
  this changes none) — the cross-project entry covers it.
- **Phase 2 — docs (this commit)**: stale "Kepler SweptArea pattern" claims
  annotated as wrong + corrected (historical honesty, repo correction style):
  `M0.2h/report.md:76-77`, `V1/notes.md:123-124` + `:132` table row, ROADMAP
  M0.2h cell tail; ROADMAP M0.2hr5 row ✅; cross-project CHANGELOG entry;
  this report + `notes.md`. Before/after raw lines in `notes.md`.

Shared commits (`git log --oneline origin/main..HEAD`):

```
(this commit)  docs(M0.2hr5): correct Kepler-pattern claims, report + ROADMAP done
526a6a6  test(M0.2hr5): rewrite V1 case 5 to real Kepler SweptArea order
1304001  docs(M0.2hr5): research + plan for verification and doc corrections
41fceff  Claim M0.2hr5 (W3)
```

Engine commit: `c1846d1 docs(M0.2hr5): correct mesh field comment — lazy copy
on first read` (1 file, +1/−1), pushed to
`origin/M0.2hr5-verification-doc-fixes`.

## Verification (P1, engine worktree HEAD `c1846d1`)

Harness: `node .claude-shared/code-foundations/V1/run.mjs
ScenarioCreator/ReleaseScenarios/solar-system-scenario.zip
.claude-shared/code-foundations/V1/setters-m02h.js --engine
.workers/W3/WebEngineTS/dist/WebEngineTS.standalone.js` from workspace root
(SwiftShader, Edge via Playwright 1.62.1 from `virtual-lab/e2e`; bundle
rebuilt from HEAD before each run). Raw logs
`C:/Users/HuGox/AppData/Local/Temp/opencode/w3/hr5-build/`:

- **Base** (`harness-base.txt`): **5/5 DRAWN** incl. `keplerOrder+reactivate`.
  No case changed status vs the M0.2h era (hr1+hr2 in HEAD, no drift).
- **Double mutation** (source-level: `this.updateMesh()` in
  `MeshRenderer.onEnable` `:100` + `MeshFilter._notifyRenderer` body `:129`
  commented out; rebuild `build-mutant.txt`; `harness-mutant.txt`):
  cases 4+5 `"not drawn rgb(0,0,0)"`, cases 1-3 DRAWN — and only those.
- **Restore** (both files byte-exact, `git diff` empty except the `:18`
  comment; rebuild `build-restore.txt`; `harness-restore.txt`): **5/5 DRAWN**.
- `npm run typecheck` — exit 0 (build, player, test configs).
- `npm test` — **Test Files 185 passed (185), Tests 3026 passed (3026)**,
  42.41s (comment-only, no test delta).
- `npm run build` — all 6 rollup bundles created, exit 0.

## Review

Full adversarial review **PASS** after one doc-accuracy fix (`f161241`):
R4 found a false "either alone" claim in the report, corrected; narrow
re-review D1–D6 all PASS. Post-merge verification V1–V6 PASS.

## Junk checks

- WebEngineTS: `git status --porcelain` empty; branch diff vs `origin/master`
  exactly `src/engine/core/rendering/MeshFilter.ts` (+1/−1).
- .claude-shared: docs commit touches exactly `ROADMAP.md`, `CHANGELOG.md`,
  `code-foundations/M0.2h/report.md`, `code-foundations/V1/notes.md`,
  `code-foundations/M0.2hr5/notes.md`, `code-foundations/M0.2hr5/report.md`.

## ROADMAP row (new text)

> ✅ 2026-11-19 W3 — case 5 rewritten to the real Kepler SweptArea order (`sharedMesh` assigned while inactive, components added active; key `keplerOrder+reactivate`), harness 5/5 DRAWN on the HEAD bundle; coverage proof via double mutation (notify body + onEnable re-sync deleted ≈ pre-M0.2h): cases 4+5 `not drawn rgb(0,0,0)`, 1-3 DRAWN, restore 5/5 — onEnable-only deletion stays DRAWN (push notify is load-bearing, onEnable re-sync redundant, measured); `MeshFilter.ts:18` comment corrected to first-read; stale "Kepler pattern" claims amended in M0.2h report, V1 notes, ROADMAP; gates 3026/3026 (185 files), typecheck + build clean. Report code-foundations/M0.2hr5/report.md

## Open items

None blocking. `release:local` stays open with A10b/M1.2 (M0.2h report's open
item, unchanged). M0.2hr4 (effective-mesh serializer semantics) untouched.

Merge into master?
