# Report — M0.2hr4: mesh alias, identity Instantiate, last-use free (W3)

- **Task:** M0.2hr4 — effective-mesh follow-up to M0.2hr1/hr2 (Claude review 2026-11-19).
- **Branch:** `M0.2hr4-mesh-alias-instantiate` in `WebEngineTS` and `.claude-shared`.
- **Workspace:** `E:/Projects/WebstormProjects/WebEngine/.workers/W3/` (worktrees `WebEngineTS`, `.claude-shared`).
- **Plan:** `code-foundations/M0.2hr4/plan.md` (📐 Claude plan, binding decisions D-1…D-7), built as written.

## What was done, per phase

1. **Phase 1 — Mesh recipe staleness + filter use count** (`a921920`): `_recipeStale` set by every
   geometry writer through `_markDirty` (14 writers); bounds paths notify-only; `primitive` reads
   `null` once edited; `clone()` copies recipe + staleness; `@internal` `_filterUses` / `_autoDestroy` /
   `_retainByFilter` / `_releaseByFilter` with release-at-0 clamp + one `console.error`.
2. **Phase 2 — sharedMesh alias + lifetime** (`15788f5`): one slot `_sharedMesh` + `_ownsShared`;
   first `mesh` read clones and stores the clone AS the shared mesh (Unity alias, D-1); `_store`
   retains-new-before-release-old, frees the old only at last use (D-2); disown clears the auto flag
   (M0.2hr1 contract); `onDestroy` releases. MeshRenderer / StaticBatchingUtility untouched (D-5) —
   the alias flows through them.
3. **Phase 3 — identity codec + honest save** (`8034e67`, pin fix `e494ea1`): `LiveMesh` in-memory
   identity table threaded only through `SceneSerializer._cloneGameObject` (`@internal`), never into
   scene/prefab files; deserialize outside a table → null + once-per-process warn; an edited/stale
   mesh with geometry saves null + one warn per mesh object (exact D-4 text); no public signature
   changed.
4. **Phase 4 — adversarial review** (`review-phase4-adversarial.md`, pinned e494ea1): **PASS**,
   attacks A1–A8 all PASS, DW-3.2 deviation ruled FAITHFUL (A7), 6 non-blocking notes N1–N6, no
   blocking issues, no fixes required.
5. **Phase 5 — docs** (`607ec2d`): CHANGELOG Fixed + Changed entries naming every behaviour change;
   `Types.ts` `FieldType.Mesh` doc gains "a mesh edited after its factory built it has no recipe any
   more" and "Instantiate passes meshes by identity" — **comment-only** (diff proof: 0 changed
   non-comment lines); notes + this report; plan DW-3.2 wording corrected per N5/A7.

## Commits

Engine `WebEngineTS` (base `c4a0119` == origin/master at cut):

```
607ec2d docs(M0.2hr4): changelog mesh alias/identity/lifetime entries and FieldType.Mesh doc
e494ea1 Pin the shared instance's release in the Instantiate lifetime test
8034e67 Pass meshes by identity through Instantiate and warn when a mesh cannot be saved
15788f5 Alias sharedMesh to the mesh instance and free it on its last filter use
a921920 Stale a mesh recipe on any geometry write and count MeshFilter uses
```

Engine diff vs base: 12 files (5 src: GameObject, Mesh, MeshFilter, SceneSerializer, ValueSerializer;
5 tests; + CHANGELOG.md, Types.ts docs), code delta 782 insertions / 62 deletions + docs 34/1.

Shared `.claude-shared`: `fbc0463` build notes → `de9c3d0` merge origin/main (27 behind, clean) →
phase-5 docs commit (notes, report, adversarial review, N5 plan-wording fix) → ROADMAP commit.

## Gates — evidence

Full gate **PASS pinned `e494ea1de8deb9999387b086cae3009cf4d3d4ed`**
(`.workers/logs/M0.2hr4-verify-e494ea1.md`, FINAL section):

- `npm run typecheck` — exit 0.
- `npm test` (full vitest) — **186 files / 3070 tests, 0 failed**, exit 0. Baseline c4a0119: 3026;
  **+44** new test cases.
- `npm run build` — exit 0.
- Targeted per-file counts: MeshRecipeStale **30**, MeshFilterMesh **31** (27→31), StaticBatching
  **7** (6→7), InstantiateGameObject **17** (11→17), Serialization **158** (155→158) = **243**.
- RED-proof (DW-2.5, DW-3.1) by construction against c4a0119 sources (base getter left the original
  in `sharedMesh` → combined bounds x=0.5 vs asserted 5; base `_clone` rebuilt the recipe → fresh
  cube ≠ instance, x=−0.5 vs asserted 5).
- Adversarial review **PASS** (A1–A8), pinned same SHA; test integrity byte-level: zero removed or
  weakened assertions, Serialization `:1976-2074` pins byte-identical.
- Phase-5 delta on top of the pin is docs-only (CHANGELOG.md + Types.ts comment-only proof, 0
  non-comment changed lines) — no re-verification required per dispatch precedent (P5c/C4).
- Junk: `git status --porcelain` empty after every commit; diff lists only scope files.

## DW coverage

- DW-1.1…1.5: `tests/MeshRecipeStale.test.ts` 30 cases (14 writers, 6 factories, 2 bounds, 4 clone,
  4 use-count). DW-1.6: untouched Serialization pins green in the 158.
- DW-2.0 scan recorded; DW-2.1…2.4 in MeshFilterMesh (+4, existing lines unchanged); DW-2.5 in
  StaticBatching (RED on base); DW-2.6: all 27 pre-existing traced + run green.
- DW-3.1 (RED on base), 3.2 (survivor + release pin per D-2, A7 FAITHFUL), 3.3, 3.4, 3.5, 3.6, 3.7
  in InstantiateGameObject (+6) and Serialization (+3). DW-3.8 = the full gate above.
- DW-4.1: `review-phase4-adversarial.md` — every attack traced with verdict, no confirmed defect.
- DW-5.1: CHANGELOG names all four Changed behaviours + the Fixed batching/Instantiate/prefab fix;
  typecheck green at the pin, docs delta comment-only. DW-5.2: this report.

## Deviations / notes

- One recorded deviation: DW-3.2 plan wording ("the original instance is untouched") contradicts
  binding D-2; resolved per D-2 with both halves pinned; ruled FAITHFUL by A7; plan text corrected
  at Report (N5). No STOPs, no scope cuts.
- Non-blocking notes N1–N6 (see review): per-realm warn-once; `subMeshCount` pre-existing
  non-writer (future row candidate); in-place array mutation contract (M0.2hr2 pin); user-destroy
  of a still-shared mesh is a Unity-parity hazard; plan wording (fixed); release-at-0 error per
  call. None blocks this task.
- ENGINE-GAPS: no entry to close; the research follow-up (Behaviour.enabled) is already ROADMAP SER1.

## ROADMAP row (new text, status cell)

`✅ 2026-11-21 W3 — Unity-parity alias: sharedMesh returns the instance after mesh is read;
Instantiate shares meshes by identity (in-memory LiveMesh table, never in files); an edited
primitive saves empty with one warning; a shared instance is freed only at its last MeshFilter use.
Full gate 3070/3070 (+44, typecheck/build green) + adversarial A1–A8 PASS @e494ea1.
Notes/report: code-foundations/M0.2hr4/notes.md, report.md`

Merge into master? — pre-authorized (WebEngine autonomy + owner PASS-pin dispatch); merge follows
per RULES §9 in `.workers/logs/M0.2hr4-merge-report.md`.