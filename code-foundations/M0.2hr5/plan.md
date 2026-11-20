# M0.2hr5 plan — real Kepler-order case 5, honest coverage claims, comment truth

Branch `M0.2hr5-verification-doc-fixes` (WebEngineTS + .claude-shared). Research: `research.md` (read first — it contains measured evidence that changes the prescribed mutation check).

## Deviation from the task card (measured, lead-visible)

The card prescribes: comment out `MeshRenderer.onEnable` re-sync → case 5 must FAIL. **Measured false**: the push notify (`set sharedMesh` → `_notifyRenderer` → `updateMesh`, no active-state gate) syncs geometry while inactive, so onEnable re-sync is a redundant safety net. Both old and rewritten case 5 stay DRAWN with it deleted (research §1 table, raw logs in `Temp/opencode/w3/hr5-research/`). The discriminating mutation deletes **both** mechanisms (notify body + onEnable re-sync ≈ pre-M0.2h wake-time-only reads): rewritten case 5 then FAILS (`not drawn rgb(0,0,0)`), old case 5 still passes. P1 uses the double mutation; docs describe the two mechanisms honestly.

## Phase 1 — probe rewrite + engine comment + verification (engine worktree)

File scope: `.claude-shared/code-foundations/V1/setters-m02h.js` (case 5 + header comment), `WebEngineTS/src/engine/core/rendering/MeshFilter.ts:18` (one comment line).

1. Rewrite case 5 in real Kepler SweptArea order (SweptArea.ts:47-49, :91-92): add MeshFilter + MeshRenderer (with magenta UnlitMaterial) while ACTIVE, `setActive(false)`, `filter.sharedMesh = Mesh.createCube(2)` (Kepler uses **sharedMesh**, not `.mesh`), `setActive(true)`. Rename key to `keplerOrder+reactivate`. Update file header comment. Cases 1-4 untouched.
2. Fix `MeshFilter.ts:18`: "made on the first write through {@link mesh}" → "made on the first read of {@link mesh}" (verified: getter clones at :75, setter stores reference at :93).
3. Rebuild: `npm run build` in the engine worktree (dist is git-ignored; current bundle is hr2-era, rebuild pins it to HEAD).
4. Run harness: `node .claude-shared/code-foundations/V1/run.mjs ScenarioCreator/ReleaseScenarios/solar-system-scenario.zip .claude-shared/code-foundations/V1/setters-m02h.js --engine .workers/W3/WebEngineTS/dist/WebEngineTS.standalone.js` from workspace root (run.mjs resolves Playwright via `virtual-lab/e2e` — verified present, 1.62.1; Edge channel verified installed). Expect **5/5 DRAWN**. Save raw output to `Temp/opencode/w3/hr5-*.txt`. Report any case whose status differs from the M0.2h-era result (hr1+hr2 are in this bundle).
5. Mutation check (source-level, engine worktree): comment out `this.updateMesh()` in `MeshRenderer.onEnable` (:100) **and** the body of `MeshFilter._notifyRenderer` (:129); rebuild; re-run harness → case 4 AND case 5 must be `not drawn`, cases 1-3 DRAWN. Restore both files **exactly** (`git diff` empty on them except the :18 comment), rebuild, re-run → 5/5 DRAWN again.
6. Engine gates: `npm run typecheck` 0 errors (3 configs), full `npm test` **3026/3026 (185 files)** — comment-only change, no test delta; `npm run build` ok.

Gate: Debug (typecheck + full test + build + harness + mutation). DW: rewritten probe 5/5 DRAWN on HEAD bundle; double-mutant fails cases 4+5 and only those; restore verified byte-exact; comment states getter-clones truth; gates green.

## Phase 2 — doc corrections + hr5 docs + ROADMAP (shared worktree)

File scope: `code-foundations/M0.2h/report.md`, `code-foundations/V1/notes.md`, `ROADMAP.md`, `code-foundations/M0.2hr5/{notes,report}.md`.

- `M0.2h/report.md:76-77`: replace "(the Kepler SweptArea pattern)" claim with an honest correction note: original case 5 deactivated before adding components (wake-time read, duplicate of case 3's mechanism); M0.2hr5 (2026-11-19) rewrote it in the real SweptArea order and re-verified 5/5 DRAWN; note the two sync mechanisms (push notify load-bearing; onEnable re-sync defense-in-depth — neither single deletion fails case 5, `keplerOrder+reactivate`; notify-only deletion DOES fail case 4, measured later by the review).
- `V1/notes.md:123-124` + table row :132: same correction — describe what case 5 NOW covers (components added active, deactivate, `sharedMesh` assign, reactivate); keep the historical rows, annotate "order corrected by M0.2hr5". :110 pattern description stays (it is accurate).
- `ROADMAP.md:66` M0.2h cell tail: "pixel re-check 5/5 DRAWN incl. the Kepler SweptArea pattern" → corrected wording pointing at hr5 (e.g. "pixel re-check 5/5 DRAWN — case-5 order corrected + re-verified by M0.2hr5").
- `ROADMAP.md:70` M0.2hr5 row → ✅ 2026-11-19 W3 + one-line summary (real-order case 5, double-mutation coverage proof, comment fix, docs corrected).
- New `M0.2hr5/notes.md` (build log: harness outputs, mutation results, gate numbers) + `report.md` (what changed, the falsified single-mutation premise with measurements, verification).

Gate: Minimal. DW: no remaining "incl. the Kepler SweptArea pattern"-style claim that predates the fix without annotation; junk check both repos; explicit-path commits, push both branches.

## Review + merge

Adversarial review (review agent): **independently re-execute the double mutation** (fresh rebuild, not trusting P1 logs), verify onEnable-only deletion stays DRAWN while notify-only deletion fails case 4 only (documents the redundancy honestly), comment truth vs getter/setter code, doc claims match actual harness JSON outputs, case-5 order matches SweptArea.ts:47-49/:91-92. Full Debug gate on synced branch.
Merge engine first (WebEngineTS), then .claude-shared via `wk.sh merge-push` under `merge.lock`; post-merge full gates + graph check in primary repos; delete task branches + `claims/M0.2hr5`; `wk.sh done W3`.

## Risks

- Browser: verified present (Edge x86 install + Playwright 1.62.1 via virtual-lab/e2e; four live runs at research time). If it breaks in build phase: report blocker, never install globally.
- Bundle drift: hr1+hr2 fixes are in HEAD; a case changing status vs M0.2h era must be reported, not silently accepted (research-time base runs: all 5 DRAWN, so no drift expected).
- Mutation restore: source files must return byte-exact (only the :18 comment differs from HEAD); reviewer re-checks `git diff`.
- SwiftShader timing: probe waits 4 s after creation (UnlitMaterial, no shader-compile delay); harness `--wait` default 3 s. Flaky pixel → re-run once, then investigate, don't loop.
- Do NOT touch `setters.js`, engine behavior, ScenarioCreator, or run `release:local` (open item stays with A10b/M1.2).
