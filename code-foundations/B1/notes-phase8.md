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

## Pending-verify state

The last five editor commits (`ef8f4a4`, `29184a2`, `c492918`, `21eefbb`, `dcf5926`) have **not**
been through `npm run build` / `npm run e2e` — no builds or tests were run in this phase.
Phase-6 gate (verified green earlier): full e2e **380 PASS / 0 FAIL**; `e2e:build` wizard
fixture 6 PASS, catalog zip sha256
`3e63625856db77cc02cd67705169afd2783cacd8135acd03a2f26d64a0376999`; pixels-lit/dark/catalog
then SKIPped (phase-7 exports not yet authored). The lead updates the ✅ notes after the green
run. Evidence: `.workers/logs/B1-editor-code-report.md` §6 (verifier queue),
`.workers/reports/B1-tasklead-report.md`.

## DW-8.1 — parity rows (editor repo part DEFERRED)

The stage-6 parity rows live in `WebEngineTSEditor/docs/unity-editor-plan.md` — the **editor
repo, which this task must not touch** (verify window pending on the editor branch). That part
of DW-8.1 is deferred to the post-verify docs pass on the editor branch. Recorded deviations
(verbatim from the plan's DW-8.1, matching the editor code report §5):

- **Plane/Quad without collider** — the engine has no MeshCollider.
- **One outline colour** — no blue child outline (Unity's child-selection colour).
- **Lighting toggle on by default for every scene** (D-7), not only when a light exists.
- **No platform upload in CI** — upload is the owner's step.
- Plus the B1r5-era deviations: per-axis scale boxes still drawn in combined Global (effect is
  uniform); B1r5 #5 lifecycle fix has a static proof only.

## DW-8.2 — roadmap row + build notes

- ROADMAP B1 row: done above (✅ + what landed + pending-verify note).
- Probe API: documented in `code-foundations/B1/notes-phase6.md` § "Probe API additions"
  (`gizmoInfo`, `iconCounts`, `transformOf` with `lossyScale` + local TRS, `setComponentEnabled`,
  `gizmoBufferStats`); the probe itself is localStorage-gated
  (`localStorage['wets:debug:probe']==='1'`).
- Screenshots (existing, W2 slot dir, referenced — not copied into the repo):
  `.workers/W2/b1-gizmos-on.png` / `.workers/W2/b1-gizmos-off.png` (DW-6.3).
- Build notes: `code-foundations/B1/notes-phase6.md` (phase 6 + fold-in), `notes-phase7.md`
  (phase 7 + code landing), this file (phase 8).
