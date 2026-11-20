# M0.2hr5 — real Kepler-order case 5, honest coverage claims: build notes (W3, 2026-11-19)

Branch `M0.2hr5-verification-doc-fixes` in both repos. Engine worktree
`.workers/W3/WebEngineTS`, shared worktree `.workers/W3/.claude-shared`.
Research `research.md`, plan `plan.md`, report `report.md`.
Logs: `C:/Users/HuGox/AppData/Local/Temp/opencode/w3/hr5-build/`
(build phase), `…/w3/hr5-research/` (research phase, 8 runs).

## Key finding — the prescribed single mutation is falsified (measured)

The task card prescribed: delete `MeshRenderer.onEnable` re-sync → case 5 must
FAIL. **Measured false**, old AND rewritten case 5 stay DRAWN. The push notify
path syncs geometry while inactive:

- `set sharedMesh` (`MeshFilter.ts:52`) → `_notifyRenderer()` (`:128-130`) →
  `MeshRenderer.updateMesh()` (`:176-187`) — **no active-state gate**, only
  `_threeMesh === null` (nulled in `onDestroy` only, `:112`).
- `Renderer.onDisable` (`Renderer.ts:511-513`) is visibility-only.

So `onEnable` re-sync (`MeshRenderer.ts:98-101`, `super.onEnable();
this.updateMesh();`) is a **redundant second safety net** for this pattern.
Research-time mutation table (scratch minified-bundle edits, source untouched;
raw logs `hr5-research/{base-run,mutant-run,base-5case,mutant-5case,
mutant-notify-5case,mutant-both-5case,base-old-probe,mutant-old-probe}.txt`):

| Bundle mutation | old probe | new probe (Kepler order) |
|---|---|---|
| none (base) | 5/5 DRAWN | 5/5 DRAWN |
| onEnable re-sync deleted | 5/5 DRAWN | **5/5 DRAWN** |
| notify body deleted | — | case 4 not drawn, case 5 DRAWN (onEnable catches it) |
| **both** deleted (≈ pre-M0.2h) | — | cases 4 **and 5** not drawn |

The discriminating mutation is the **double** one. Lead-visible deviation in
`plan.md` § Deviation; P1 executed it at source level.

## Phase 1 — probe rewrite + comment + verification

Commits: shared `526a6a6` (probe), engine `c1846d1` (comment). Research + plan
landed earlier as shared `1304001`.

- `code-foundations/V1/setters-m02h.js` case 5 rewritten to the real Kepler
  SweptArea order (`SweptArea.ts:47-49`, `:91-92`): MeshFilter + MeshRenderer
  (magenta UnlitMaterial) added while ACTIVE, `setActive(false)`,
  `filter.sharedMesh = Mesh.createCube(2)` (Kepler uses **sharedMesh**, not
  `.mesh`), `setActive(true)`. Key renamed `inactiveAssign+reactivate` →
  `keplerOrder+reactivate`. Header comment updated. Cases 1-4 untouched;
  `setters.js` (original 4-case probe) untouched. Diff +6/−4.
- `MeshFilter.ts:18` comment: "made on the first write through {@link mesh}" →
  "made on the first read of {@link mesh}". Truth verified against code: getter
  clones `_sharedMesh` into `_meshInstance` on first **read** (`:75`, notifies
  `:77`); setter stores the reference (`:93`, its own comment `:91-92` already
  says instancing happens on first read). Engine diff exactly 1 file, +1/−1.
- Engine CHANGELOG entry **skipped**: the change is comment-only, no consumer-
  visible behavior delta. Precedent: hr1/hr2 engine entries describe behavior
  changes; the engine CHANGELOG's own rule is "say what a consumer can now do,
  or what behaves differently". The cross-project CHANGELOG entry covers it.

### Harness invocation (from workspace root, all three runs)

```
node .claude-shared/code-foundations/V1/run.mjs \
  ScenarioCreator/ReleaseScenarios/solar-system-scenario.zip \
  .claude-shared/code-foundations/V1/setters-m02h.js \
  --engine .workers/W3/WebEngineTS/dist/WebEngineTS.standalone.js
```

SwiftShader (default), Edge channel via Playwright 1.62.1 resolved from
`virtual-lab/e2e`. Bundle rebuilt from HEAD before each run (`npm run build`
in the engine worktree; dist git-ignored). "DRAWN" is the probe's own pixel
verdict (magenta centre-pixel test `r>200 && b>200 && g<80` via
`app.captureFrame`), not a harness keyword.

### Base run — HEAD bundle (`c1846d1`), `harness-base.txt`

```json
{
 "shared+sharedMat": "DRAWN",
 "shared+material": "DRAWN",
 "mesh+sharedMat": "DRAWN",
 "rendererFirst+shared": "DRAWN",
 "keplerOrder+reactivate": "DRAWN"
}
```

5/5 DRAWN — no case changed status vs the M0.2h-era result (hr1+hr2 fixes in
HEAD, no drift).

### Double mutation — source level, `harness-mutant.txt`

Recipe: comment out `this.updateMesh()` in `MeshRenderer.onEnable` (`:100`)
**and** the body of `MeshFilter._notifyRenderer` (`:129`); `npm run build`
(`build-mutant.txt`, all 6 bundles created); re-run harness:

```json
{
 "shared+sharedMat": "DRAWN",
 "shared+material": "DRAWN",
 "mesh+sharedMat": "DRAWN",
 "rendererFirst+shared": "not drawn rgb(0,0,0)",
 "keplerOrder+reactivate": "not drawn rgb(0,0,0)"
}
```

Cases 4+5 fail and **only** those — the pre-M0.2h wake-time-only world. Cases
1-3 assign before the renderer wakes, so wake-time reads still cover them.

### Restore — byte-exact, `harness-restore.txt`

Both files restored exactly (`git diff` on them empty except the `:18`
comment); rebuild (`build-restore.txt`); re-run:

```json
{
 "shared+sharedMat": "DRAWN",
 "shared+material": "DRAWN",
 "mesh+sharedMat": "DRAWN",
 "rendererFirst+shared": "DRAWN",
 "keplerOrder+reactivate": "DRAWN"
}
```

5/5 DRAWN again. Engine worktree clean afterwards (`git status --porcelain`
empty; HEAD `c1846d1`, pushed).

## Gates (engine worktree, HEAD `c1846d1`)

- `npm run typecheck` — exit 0, 3 configs (build, player, test);
  `typecheck.txt` (tsc silent on success).
- `npm test` — **Test Files 185 passed (185), Tests 3026 passed (3026)**,
  duration 42.41s, start 22:23:02 (`test.txt`). Comment-only change, no test
  delta vs hr2's 3026.
- `npm run build` — all 6 rollup bundles created (`build-base.txt`:
  esm/cjs 8.6s, standalone 13.7s, engine d.ts 3.1s, player-host js 4.8s,
  player js 5.1s, player-host d.ts 917ms).

## Phase 2 — doc corrections (this commit)

Historical honesty: original claims annotated as wrong + corrected by hr5,
not silently rewritten. Before → after:

- `M0.2h/report.md:76-77` — before: "**5/5 DRAWN** — the 4 original V1 cases +
  inactiveAssign+reactivate (the Kepler SweptArea pattern)". After: original
  lines kept verbatim + a "(Correction 2026-11-19, M0.2hr5: …)" block naming
  the wrong order, the rewrite, the two sync mechanisms and the double-mutation
  proof. Matches the repo's correction style (`V1/notes.md:110`).
- `V1/notes.md:123-124` — before: "case 5 — the SweptArea pattern, `mesh`
  assigned while `setActive(false)` then reactivated — also DRAWN". After:
  original kept + correction block describing what case 5 NOW covers.
- `V1/notes.md:132` table row — before: "inactive: `filter.mesh = m` +
  renderer, then `setActive(true)` | (broken in Kepler) | DRAWN". After: row
  annotated "(probe order — not the real Kepler order; corrected by M0.2hr5,
  next row)" + new row for the real order, both DRAWN. `:110` pattern
  description untouched (accurate).
- `ROADMAP.md:66` M0.2h cell tail — before: "pixel re-check 5/5 DRAWN incl.
  the Kepler SweptArea pattern (`V1/notes.md` corrected — it WAS broken)".
  After: "pixel re-check 5/5 DRAWN — case-5 order corrected + re-verified by
  M0.2hr5 (the original case 5 duplicated case 3, not the Kepler pattern;
  `V1/notes.md` corrected — it WAS broken)".
- `ROADMAP.md:70` M0.2hr5 row — 🟡 → ✅ 2026-11-19 W3 with summary + report
  pointer (M0.2hr2 row format). Only these two ROADMAP lines changed.
- `CHANGELOG.md` — cross-project entry under `### 2026-11-19` (M0.2hr2 entry
  format), above the hr2 entry.
- New `M0.2hr5/notes.md` (this file) + `report.md`.

Junk check .claude-shared: `git status --porcelain` empty after the docs
commit; changed files exactly `ROADMAP.md`, `CHANGELOG.md`,
`code-foundations/M0.2h/report.md`, `code-foundations/V1/notes.md`,
`code-foundations/M0.2hr5/notes.md`, `code-foundations/M0.2hr5/report.md`.
