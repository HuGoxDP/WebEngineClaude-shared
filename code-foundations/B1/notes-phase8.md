# B1 Phase 8 — docs and roadmap (W2, shared branch)

Date: 2026-11-21 · Slot: W2 · Branch `B1-component-gizmos` (`.claude-shared` worktree).
Gate: Minimal — code-only/docs-only, **no test runs** (RAM gate closed; the verify run of
`dcf5926` is the verifier's queue).

## What phase 8 changed

- `ROADMAP.md` — B1 → `✅ 2026-11-21 W2` with what landed (stage 6 complete, B1r–B1r5 folded,
  e2e via the localStorage-gated probe, 📐 plan reference kept) **plus** the honesty note
  "(e2e re-verify of `dcf5926` pending build window — phase-6 gate 380/380)"; B1r5 →
  `✅ 2026-11-21 W2 (folded into B1)` with the six-finding evidence and the same pending note;
  B1r–B1r4 left byte-identical (verified intact after the `a2e62cb` merge).
- `CHANGELOG.md` — editor section, new `### 2026-11-21` B1 entry (branch, five commits, fold,
  380/380 gate, pending-verify note, deviations pointer).
- `tasks/B-milestone-1.md` — B1 card got the `**Done 2026-11-21**` line in the file's existing
  style (B0's pattern).
- `code-foundations/B1/notes-phase7.md` — new "## Code landing (2026-11-21)" section: the five
  commits, the B1r5 fold, deviations, the `icon.component.ts` scope extension and the
  engine-bundle version note already recorded there; Results entries stay
  "(pending verify window — RAM gate)" except the 380 baseline.
- `code-foundations/B1/notes-phase8.md` — this file.

## Verify state — PASS #1 recorded (2026-11-21)

The five phase-8-era editor commits (`ef8f4a4`, `29184a2`, `c492918`, `21eefbb`, `dcf5926`) plus
two verifier fixes (`b770b44` gizmo pool growth rounded to whole vertices; `37f2a7f`
platform-pixels outer window → true 640×480 buffer) are verified at editor tip
`37f2a7f3ed3d53e0ac942714c4a2bae180ac2ca5`: ng build exit 0 (`--base-href /editor/`, budget
warning only); full e2e **433 PASS / 0 FAIL / 29 scenarios** (baseline 380); `e2e:build`
**4 fixtures, 0 failed** — wizard-project / pixels-lit (luminance 0.4980 > 0.3) / pixels-dark
(0.0000 < 0.05) / catalog (8 objects), ZIP sha256 lines in `notes-phase7.md` § Results. No test
weakened; full suite re-run after each fix. Authoritative PASS file:
`.workers/logs/B1-verify-37f2a7f3ed3d53e0ac942714c4a2bae180ac2ca5.md`; run history and fix
citations: `notes-phase7.md` § "Verify (2026-11-21)". A merged-tip re-run follows before merge.
Earlier evidence: `.workers/logs/B1-editor-code-report.md` §6, `.workers/reports/B1-tasklead-report.md`.

## DW-8.1 — parity rows (editor repo part landing in the same pass)

The stage-6 parity rows live in `WebEngineTSEditor/docs/unity-editor-plan.md` §5 (+ README) —
the **editor repo, which this shared-repo task must not touch**. That part of DW-8.1 is being
landed in the same pass by the editor worker on the editor branch; its commit SHA is not
referenced here (not visible from this worktree). Recorded deviations
(verbatim from the plan's DW-8.1, matching the editor code report §5):

- **Plane/Quad without collider** — the engine has no MeshCollider.
- **One outline colour** — no blue child outline (Unity's child-selection colour).
- **Lighting toggle on by default for every scene** (D-7), not only when a light exists.
- **No platform upload in CI** — upload is the owner's step.
- Plus the B1r5-era deviations: per-axis scale boxes still drawn in combined Global (effect is
  uniform); B1r5 #5 lifecycle fix has a static proof only.

## DW-8.2 — roadmap row + build notes

- ROADMAP B1 row: done above (✅ + what landed + verified-2026-11-21 note replacing the pending one).
- Probe API: documented in `code-foundations/B1/notes-phase6.md` § "Probe API additions"
  (`gizmoInfo`, `iconCounts`, `transformOf` with `lossyScale` + local TRS, `setComponentEnabled`,
  `gizmoBufferStats`); the probe itself is localStorage-gated
  (`localStorage['wets:debug:probe']==='1'`).
- Screenshots (existing, W2 slot dir, referenced — not copied into the repo):
  `.workers/W2/b1-gizmos-on.png` / `.workers/W2/b1-gizmos-off.png` (DW-6.3).
- Build notes: `code-foundations/B1/notes-phase6.md` (phase 6 + fold-in), `notes-phase7.md`
  (phase 7 + code landing), this file (phase 8).

## Verify state — PASS #2 recorded; merge sequence proceeding (2026-11-21)

Merged-tip re-run complete at editor tip `c8982ebd8d5b105a9dcf9070b664f9cd455fbc3b`
(branch merged C4 master `d404658` via `d5d1655`; harness fix `c8982eb`: 3 Chrome launch
switches in `platform-pixels.mjs`, root cause field-trial/GCM services hanging raw headless
spawn — see `notes-phase7.md` § "Verify PASS #2"). Merged suite e2e **616 PASS / 0 FAIL /
51 scenarios**; `e2e:build` **4 fixtures / 0 failed**. PASS file:
`.workers/logs/B1-verify-c8982ebd8d5b105a9dcf9070b664f9cd455fbc3b.md`. Merge sequence
(merge.lock → editor merge-push → shared merge-push → primaries ff-only) proceeding.
