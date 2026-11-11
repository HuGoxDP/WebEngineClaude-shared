# A5a — triage of the five failing `tasks/probes/e11` probes

Card: ROADMAP `A5a` — *"Triage the five `tasks/probes/e11` probes that fail on master before and
after A5 (`zz_probe_missing`, `zz_probe_overrides` "getOverrides on objects without node ids",
`zz_probe_shadow`, `zz_probe_untouched`, `zz_probe_v2`): each is a real defect (→ fix with a
test) or an outdated probe (→ update it, reason in the commit)"*. Source: Claude's review of A5
(2026-11-11). Branch `A5a-triage-e11-probes` in `.claude-shared`.

## How the probes run

The probes are pure diagnostics: they compute behavior, write JSON to `OUT`, and carry **no
assertions** — a "failure" is a throw, and the signal lives in the written artifact. They run
inside an engine tree (their imports are `../../src/engine/…`, which resolves from
`<engine>/tests/zzprobe/`, one level below the root). The committed home is
`.claude-shared/tasks/probes/e11/zzprobe/`; a run copies them into `<engine>/tests/zzprobe/`.

## What the "5 failures" were

Two couplings, both in the probes themselves, neither touching engine behavior:

1. **`OUT` was one Claude-cloud session's scratchpad** (`compatFixtures.ts`:
   `/tmp/claude-0/-home-user/18df…/scratchpad/myout`). Every probe writes its artifact there,
   so in any other tree — including the A5 builder's cloud session, which recorded "5
   pre-existing failures" in `code-foundations/A5/plan.md` DW-5.4 — all five threw ENOENT on
   the write. Now: `OUT = process.env.VL_PROBE_OUT ?? "./out"`, created on load.
2. **`new URL(rel, import.meta.url).pathname` doubles the drive letter on Windows** (resolves to
   `C:\C:\…`), so the three probes that read `PrefabOverride.ts` to tag their artifact
   (`head`/`old`) threw there. Now: the URL object is passed to `fs.readFileSync` directly.

Both are fixed in the committed probe tree. The engine worktree copies (`tests/zzprobe/`,
`out/`) are run-time scratch and are removed after the run — nothing of the probes lands in the
engine repo.

## The triage verdict per probe (all on master `b24c2b0`, after the fixes)

**All five are outdated probes, not engine defects.** Each observation is correct on master; each
probe now pins what it observes so the behavior cannot silently rot:

- **`zz_probe_v2`** — everything is written as format version 2 (a version-1 prefab resaves as 2,
  a scene holding a prefab instance saves as 2, a prefab made now is 2), and an unknown
  component's `GameObjectRef` survives inside the scene. Pinned all three version fields and the
  `Ghost.Pointer` data. Correct by design (the format-version policy of A5's lane).
- **`zz_probe_missing`** — a linked scene saves as v2; a missing prefab is kept as a placeholder
  that re-saves **verbatim** (`placeholderLinkVerbatim`), with a warning that says so; the
  instance's override (weight 7) survives the round trip; versions 3, 2.5, "3", 0, null and 99
  are refused with a whole-number/supported-version message. A scene with **no** version field is
  accepted (it predates the field and reads as version 1) — pinned as accepted, the rest as
  refused. Correct by design.
- **`zz_probe_untouched`** — an unchanged object yields **no** overrides; a plain deserialized
  copy (its `_prefabInfo` stripped, as an old saved scene would have) yields exactly two
  node-addressed overrides (the tweaked weight, the material asset reference). Correct.
- **`zz_probe_shadow`** — the scene's own asset table shadows the prefab's later edit: the scene
  copy stays green `[0,1,0]`, an instance made from the edited file is red `[1,0,0]`, and the two
  materials are distinct objects. That is the scenario's intent. Correct.
- **`zz_probe_overrides`** — its dump read pre-A5 fields: it printed `path` (which the modern
  `PrefabOverride` writes only where `node` is absent) and `component` (null for a
  GameObject-level field), so node-addressed overrides displayed as "undefined null.name=…".
  The behavior is correct: overrides carry `node` ids, `path` is absent, a variant built from
  them applies both overrides and resolves its references, and `PrefabDiff.compare` does not
  mutate its input. The dump now shows `node`; the contract is pinned.

## Two observations recorded, not asserted (for the serializer review)

- `zz_probe_overrides`: `treeVsInstanceSnapshot = 1` — `PrefabDiff.compare` between a prefab
  file's internal tree and a plain snapshot of an instance-shaped object reports **one**
  difference where identity might be expected. Recorded in the artifact; not pinned, because
  whether that one difference is correct is a serializer-semantics question.
- `zz_probe_missing`: `afterPrefabReturns.target = null` — the watcher's reference *into the
  instance* does not re-resolve once the prefab returns and the file is reopened (the
  instance-root references and the override do survive). Recorded; not pinned. Both belong to
  Claude's serializer review, not to a worker's guess.

## Verification

The full e11 set (nine files, 31 tests: `zz_f3b`, `zz_findings`, `zz_pass1`, `zz_probe_parallel`
plus the five) passes in an engine worktree at `origin/master` (`b24c2b0`): **9 files, 31 tests,
all green**. Nothing in the engine repo changed — this task touches `.claude-shared` only.
