# Roadmap — the whole WebEngineTS ecosystem

**A milestone view of [`PLAN.md`](PLAN.md) and [`tasks/`](tasks/README.md), not a second plan.**
The reasons, the evidence and the how live there; this file says *in which order* and *what "done"
means* for each milestone. When an item closes, update its card / `PLAN.md` / `CHANGELOG.md` first,
then tick it here. Written 2026-11-06 against: WebEngineTS `03b640f`, `.claude-shared` `83750d5`.

Sizes are one person at the card's model. **Status:** ✅ done · 🟡 started / waiting on review ·
⬜ open · 🧠 Claude writes the research + plan first (workers skip it) · 📐 plan ready in `code-foundations/<ID>/` (workers build it as written) · 🔒 waits on an owner decision ([`tasks/OWNER-DECISIONS.md`](tasks/OWNER-DECISIONS.md)).
Repos: **E** WebEngineTS · **P** virtual-lab · **Ed** WebEngineTSEditor · **SC** ScenarioCreator ·
**S** .claude-shared · **B** Benchmarks.

```
M0 Foundation ──► M1 v0.2.0 release ──┬─► M3 Editor milestone 1 ──► M4 Editor milestone 2 ──► M5 Editor milestone 3 ──► M7 Unity windows
   (now, days)    (~2–3 weeks)        │   (~11–12 weeks)              (~10–12 weeks)             (~6 weeks)                 (per decision)
                                      └─► M2 Platform for real teachers (parallel, ~2 weeks spread)
                                          M6 Growth lanes (parallel, pulled in when a lesson needs them)
```

Critical path to "a teacher builds and publishes a scenario without code": **M0 → M1 → M3**
(≈ 4 months). Everything in M2 and M6 runs beside it and must not block it.

---

## M0 — Foundation *(now; a few days)*

**Done when:** nothing merged is unreviewed, the tooling the sessions rely on actually runs, and the
owner's pending pushes and decisions for M1 are made.

| ID | Task | Repo | Size | Source | Status |
|---|---|---|---|---|---|
| M0.1 | Code graph (graphify) for the engine, wired into root sessions | E, S | — | research/plan 2026-11-04 | ✅ 2026-11-06 |
| M0.2 | Opus review of **A12** (RectTransform restore) | E | ½ d | `tasks/A12` | ✅ 2026-11-07: lifecycle order unchanged (2809 pairs); fix `a60e548`, a prefab file with a doubled rect reads as one; A5 notes, owner question (which doubled copy wins) and follow-ups M0.2a–c in `code-foundations/M0.2/review.md` |
| M0.3 | Opus review of **A13** (lifecycle robustness); decide the open `Scene` root-loop skip | E | ½ d | `tasks/A13` | ✅ 2026-11-07 — A13 holds; root-loop skip was a real defect, fixed (`0b080ad`); deferred-destroy / onDisable errors no longer lost (`3eefb27`); review `code-foundations/M0.3/review.md` |
| M0.3a | Hierarchy update walk: an object that already ran this frame and reparents under a later-walked parent runs again (child and root level) — per-pass "already ran" stamp | E | ½ d | M0.3 review | ✅ 2026-11-07 — per-walk stamp: each GameObject records the walk its components last ran in, `Scene` numbers one walk per pass/order; no allocation, cost within noise (`b05b3a2`, `tests/UpdateWalkOnce.test.ts`, 19 of 23 failed before); converse case (moved before its turn under an already-walked parent misses the frame) noted as follow-up; notes `code-foundations/M0.3a/notes.md` |
| M0.3b | Check: zero-delay `Destroy()` runs on a microtask after LateUpdate and render; Unity destroys before rendering — probe with a running `Application`, then decide | E | ½ d | M0.3 review | ✅ 2026-11-10 W2 — probe on a running `Application` confirmed it: `["destroyer:update","victim:lateUpdate","loop:render","victim:onDestroy"]`; a zero delay now enters the same end-of-frame sweep a timed destroy uses (`remaining = 0`, after LateUpdate, before the render and the UI canvas), with the microtask kept only as the no-loop fallback. `tests/DestroyBeforeRender.test.ts`; notes `code-foundations/M0.3b/notes.md` |
| M0.3c | Debug hard stop: with `isolateCallbackErrors = false`, rethrow the first component error after a GameObject is fully destroyed | E | ½ d | owner decision #15 | ✅ first error rethrown after full destruction on every path; `tests/DestroyHardStop.test.ts` |
| M0.3d | Update walk, reverse case: an object moved before its turn under an already-walked parent misses this frame (`B` moves `C` under `A` → `["A","B"]`; Unity runs `C`) — needs a catch-up call | E | ½ d | M0.3a notes | ✅ 2026-11-07 — `setParent` records objects moved during a scene walk that have not run; after the roots each one still unrun, alive and active runs once with its subtree under the same walk number (M0.3a rule kept); objects created during the pass still start next frame; no allocation without reparenting, cost within noise (`fb32cd8`, `tests/UpdateWalkCatchUp.test.ts`, 27 of 39 failed before); notes `code-foundations/M0.3d/notes.md` |
| M0.3e | `ScriptableBehaviour._guard` allocates a closure per callback (~2.8 MB garbage / 4500 frames with scripts) — breaks the zero-allocation rule | E | ½ d | M0.3a notes | ✅ 2026-11-07 — `_guard` removed: the three `_system*Update` entry points run `_runX()` in their own try/catch (`_onCallbackError` shared); behaviour identical. Measured without JIT (hot code hides the closure): 224 → 128 B per callback; ~2.8 MB figure not reproducible. `tests/ScriptableBehaviourAllocation.test.ts`; notes `code-foundations/M0.3e/notes.md` |
| M0.3f | Doc fix from Claude's review of M0.3b: `EngineObject.Destroy` says a zero-delay destroy "no longer happens at all while the loop is stopped", but the microtask fallback does destroy it with no loop (pinned by `DestroyBeforeRender.test.ts` "still destroys its object when no loop is running"); make the comment say what the code and test do | E | ½ h | Claude review 2026-11-10 | ✅ 2026-11-10 W2 — the review was right and found two wrong clauses: with no loop the microtask still destroys it (pinned by `DestroyBeforeRender.test.ts`), and a paused game is not a stopped loop either (`0 - 0` is due). The doc and the inline comment now say both; a new test pins the paused reading. `code-foundations/M0.3f/notes.md` |
| M0.4 | Confirm and fix: engine typecheck hooks never run in root sessions | E / root | ½ d + 1 h | `PLAN.md` §1.6 | ✅ 2026-11-07 — hooks find the engine checkout from the edited file (`10e1757`), registered in the root `settings.local.json`; owner's new-session check remains (`code-foundations/M0.4/notes.md`) |
| M0.5 | Push the unpushed engine commits (`6ac58e5` capture, `03b640f` graphify); delete stale remote branches | E | owner | decision #1 | ✅ pushed; engine has no stale remote branches left |
| M0.6 | Back up `WebEngineTS/design/Article` locally | E | owner | decision #3 | 🔒 |
| M0.7 | Commit or drop the stray `workspace/clone-all.sh` change | S | owner | — | ⬜ owner |
| M0.8 | Guard review: is the graphify PreToolUse nudge useful? (≈ 2026-11-11) | root | 10 min | research 2026-11-04 | ✅ 2026-11-10 W1 — nudge measured search-precise and advisory-only (fires on the Grep tool and `grep`/`rg` Bash commands inside the engine, silent on every other shape and outside the graph's coverage, pre-seeds the graph's hits, never blocks, instant); graph fresh (rebuilt 2026-11-10); verdict: keep unchanged, no settings change; notes `code-foundations/M0.8/notes.md` |

## M1 — Release `v0.2.0`: every consumer on one tagged engine *(~2–3 weeks)*

**Why first:** no consumer has any engine work since 2026-09-10; a v2 scene loads hollow on the
platform today. **Done when:** `v0.2.0` is a GitHub Release; platform, editor and ScenarioCreator
depend on its URL; the platform serves the engine from a versioned, cacheable path; the ten
production scenarios are re-published and pass the e2e.

| ID | Task | Repo | Size | Depends | Source | Status |
|---|---|---|---|---|---|---|
| A1–A4, A6 | E11 regressions, docs/API, format-version API, minified bundle | E | — | — | `tasks/A1…A6` | ✅ 2026-10-14 |
| A5 | Component ids (Q2), scoped like node ids — before the format freezes | E | 3–5 d (Opus) | M0.2 | `tasks/A5` | ✅ 2026-11-10 W1 — components of a node that has an id carry their own (`SerializedComponent.id`, `ComponentRef.cid`, `PrefabOverride`/`PrefabRemovedComponent.componentId`, always beside the readable fields); readers resolve by id with the readable fallback, a plain scene saves byte for byte as before, an id never makes a file version 2, and legacy `~c:` ids are minted once when written. The card's verified misbehaviour pinned by `tests/PrefabComponentIds.test.ts`; format `code-foundations/A5/format.md` |
| A5a | Triage the five `tasks/probes/e11` probes that fail on master before and after A5 (`zz_probe_missing`, `zz_probe_overrides` "getOverrides on objects without node ids", `zz_probe_shadow`, `zz_probe_untouched`, `zz_probe_v2`): each is a real defect (→ fix with a test) or an outdated probe (→ update it, reason in the commit) | E | ½ d | A5 | Claude review of A5, 2026-11-11 | ⬜ |
| M0.2a | Restore writes saved fields before any sibling wakes (Unity order). Needs an audit of every built-in setter that writes to an object its `onAwake` creates | E | 1–2 d (Opus) | — | `code-foundations/M0.2/review.md` | ✅ 2026-11-07 with M0.2d: `6bd9f4c`, `17c408a` — a load (scene, `Prefab.instantiate`, `Instantiate`, prefab links, prefab revert) builds every object, component, field, parent link and reference before any script wakes; then `awake`/`onEnable` parents first, list order. A write into any sibling's field stays. Built-ins keep `onAwake` before their own fields (audit of 51 types: only `DirectionalLight.shadowDistance`/`shadowFrustumSize` need it). **Changes observable lifecycle order** (engine CHANGELOG *Changed*). `tests/LoadBeforeWake.test.ts`; audit and changed expectations in `code-foundations/M0.2a/notes.md` |
| M0.2b | One-per-object enforced at `addComponent` (Unity `[DisallowMultipleComponent]`). Today only a load reads `_allowMultiple`, so a second RectTransform added by code is folded away on the next load. Best before A5 | E | ½ d | owner | `code-foundations/M0.2/review.md` | ✅ 2026-11-10: `addComponent` of a one-per-object type (`RectTransform`, now also `Transform`) returns the held component with a `console.warn` instead of adding a second; a subclass beside a held base throws. Unity returns null — the engine keeps the non-null type (all callers dereference it). `tests/OnePerObject.test.ts`; A5 card noted; `code-foundations/M0.2b/notes.md` |
| M0.2c | A load stops building an object's children once an earlier `awake` destroyed the object (pre-existing) | E | ½ d | — | `code-foundations/M0.2/review.md` | ✅ 2026-11-07: `4a1e922` — an object `destroyImmediate`d during its own load builds no children (scene load, `Prefab.instantiate`, `Instantiate`, prefab links); a self-destroyed child is not attached and saved paths keep its slot; `destroy()` (deferred) unchanged. `tests/DestroyedDuringLoad.test.ts`; notes and a new finding (children wake as roots, before they are parented) in `code-foundations/M0.2c/notes.md` |
| M0.2d | Load order: a child wakes as a scene root before it is attached (`P (inactive) > C` → `C.awake parent=none`, `onEnable`, no `onDisable`); Unity wakes it under its parent and not at all under an inactive one. Changes nested-load lifecycle order — do with M0.2a | E | ½–1 d (Opus) | M0.2c notes | ✅ 2026-11-07 with M0.2a (`17c408a`): each child is created under its parent before its contents are built; a child's `awake` sees its parent, and a script under an inactive parent wakes only on activation. `code-foundations/M0.2a/notes.md` |
| M0.2e | Re-parenting does not re-evaluate active state: `setParent` under an inactive parent fires no `onDisable`; out from under one fires no `awake`/`onEnable` (Unity fires both). Runtime only — loads parent before waking since M0.2a | E | ½ d | — | `code-foundations/M0.2a/notes.md` | ✅ 2026-11-10: `f9acc91` — `setParent` (parent setter, `detachChildren`) re-evaluates `activeInHierarchy` and, when it flips, runs the `setActive` path on the moved subtree: `onDisable`, or `awake` for never-woken scripts then `onEnable`, parents first, after the move is complete; UI graphics/Canvas register and unregister accordingly. Update walk: a move-activated object starts next pass if the walk already left its new parent, same as `setActive(true)` (catch-up only for objects active when moved). `tests/ReparentActivation.test.ts` (26 of 29 failed before). Follow-ups (Prefab.revert under an inactive parent wakes as a root; Unity mid-pass timing) in `code-foundations/M0.2e/notes.md` |
| M0.2f | `Prefab.revert` of an instance under an inactive holder wakes the fresh instance as a scene root before reparenting (`onDestroy, awake, onEnable, onDisable`); build it under the holder before the wake pass, as M0.2a does for loads (pre-existing) | E | ½ d | M0.2e notes | ✅ 2026-11-10 — `20e6603` — `Prefab.revert` builds the fresh instance directly under the holder at the saved index before the wake pass (`SceneSerializer._instantiatePrefabUnderParent`), so under an inactive holder it never wakes and waits for activation (awake then sees the parent), and under an active one its awake sees the holder; a true scene-root instance unchanged. **Changes observable lifecycle order** (engine CHANGELOG *Fixed*). `tests/PrefabRevertUnderHolder.test.ts` (4 cases); notes `code-foundations/M0.2f/notes.md` |
| M0.2g | Public read of one-per-object (`_allowMultiple`) so the editor's Add Component can hide or grey out `RectTransform`/`Transform` when the object already has one | E, Ed | ½ d | M0.2b notes | ✅ 2026-11-10 W2 — `Component.allowsMultiple` (static, inherited) and `GameObject.hasComponent(type)`, which also knows the Transform that is never in the component list; they read the same held-copy lookup `addComponent` refuses on. The editor's Add Component greys out a held one-per-object type and refuses the click (no history step). `tests/OnePerObjectRead.test.ts`; notes `code-foundations/M0.2g/notes.md` |
| A7 | Backfill engine `CHANGELOG.md` (E3/E5/E6/E7/E10/E13, 2026-09-10) | E | ½ d | A5 | `tasks/A7` | ✅ 2026-11-11 W1 — eight bullets in `[Unreleased]`, one per commit: the six dropped components and curves/gradients/bursts, E3 ids inside a model, E5 asset files, E6 unknown components/values, E7 order, E10 renderSettings, E13 Cinemachine/post-processing |
| B0 | Engine E1: the loader reads `entryScene` (+ SC writes it, `PLAN.md` §4.9) | E, SC | ½ d | — | `tasks/B-milestone-1` | ✅ `Scenario.run()` builds `entryScene` after `awake()` (ZIP + streaming), references preloaded; SC writes it from `scenario.meta.json`. Branch `B0-entry-scene`. The editor template must drop its manual load when B7 writes `entryScene`. |
| A8 | Editor takes the new engine; opens files through the version check | Ed | 1 d | A4 | `tasks/A8` | ✅ 2026-11-10 — the editor takes engine `0.1.0-local.1794329867` (packed from engine master by hand, editor-only; tarball + lockfile committed) and opens scenes through the engine's version API (A4): a file this build cannot read gets the new `scene.tooNew` message (en/uk), a malformed one keeps `scene.invalid`, and a refusal leaves selection/history/scene untouched. All outside reads funnel through `_loadSceneText`. Writing unchanged (v1, expand). `grep 'version !== 1' app/src` empty; `ng build` exit 0; e2e 159 checks all green (142 pre-existing passed unchanged on the new engine + 17 new reader checks). Notes `code-foundations/A8/notes.md` |
| A9 | Cut `v0.2.0` | E | ½ d | A5, A6, A7, A8 | `tasks/A9` | ⬜ decision #2 delegated: yes, tag after A5–A8 are ✅ |
| A10 | Platform on the release: URL dependency, `/engine/<version>/…` immutable, prefab v2 accepted | P | 1–2 d | A9 | `tasks/A10`, `PLAN.md` §2.8 | ⬜ |
| A11 | ScenarioCreator on the release; `.meta` guids; `--experimentalDecorators` | SC | 1–2 d | A9 | `tasks/A11` | ⬜ |
| M1.1 | Take the profiler out of `solar-system`; re-publish | SC | ½ h | A11 | `PLAN.md` §4.10 | ⬜ |
| M1.2 | Deploy to production + e2e against the deployed site | P | owner | A10 | decision #11 | 🔒 |

## M2 — Platform ready for real teachers *(parallel with M1/M3; ~2 weeks spread)*

**Done when:** production has HTTPS and tested backups, Moodle at KSU-online launches and grades a
scenario, the catalog shows real covers, and the G2 diagnosis is confirmed and fixed in content.

| ID | Task | Repo | Size | Depends | Source | Status |
|---|---|---|---|---|---|---|
| P1 | LTI 1.3 for Moodle (Dynamic Registration, Deep Linking, AGS grades) | P, E | — | — | `tasks/E-growth` P1 | ✅ 2026-10-28 (local) |
| P1b | Deploy LTI to KSU-online (confirm its Moodle version) | P | 1–2 d | P5b | `PLAN.md` §2.10(b) | ⬜ |
| P5a | Backups and HTTPS, repo side: a backup container (nightly `pg_dump` + archives copy), a restore script with a restore actually tried on the local stack, and the HTTPS nginx/compose config — all tested locally | P | 1–2 d | — | `PLAN.md` §2.12 | ✅ 2026-11-11 — the `backup` service (nightly `pg_dump` + read-only copies of the four content volumes + prune), `restore.mjs` (dry-run default, `--yes` to run), and the written procedure in `docs/backup-restore.md`, **actually run on a scratch stack**: seeded row + object survived `down -v` and came back (psql count 1, object sha256 unchanged, nginx serves the restored bytes). Retention pinned by 8 unit tests. TLS on the stack (443, self-signed, `docker-compose.https.yml`) with HSTS on https answers only — verified. Backend suite 1487/1487 against the test DB inside vl-db.lock; unit 288/288. Notes `code-foundations/P5a/notes.md` |
| P5b | Deploy P5a to production, enable HTTPS, try one restore there | P | owner | P5a | `PLAN.md` §2.12 | ⬜ owner |
| P6 | Catalog covers (`image_url` for the ten scenarios) | P | ½ d | — | `PLAN.md` §2.4 | ⬜ |
| P7 | Confirm G2 (`liveTextures` vs `textures` in the streaming e2e) | P | ½ d | — | `PLAN.md` §2.1 | ✅ 2026-11-10 W2 — confirmed on the platform (streaming e2e, engine `0.1.0-local.1794342651370`): textures 20/20 (GPU uploads), estimatedTextureVramBytes 96.8 MB (ZIP) vs 273.8 MB (manifest) = 2.83× (live `Texture` objects), draw calls 27/27 — the diagnosis holds, redundant prefetch not a leak; SC-G2 unblocked. Engine bumped in virtual-lab/frontend (was 6 days stale); the frontend lock had to be re-pinned or the Docker build EINTEGRITYs onto a 2-week-old image with no sandboxed player. notes `code-foundations/P7/notes.md` |
| SC-G2 | Stop shipping redundant fallback textures / mark them `Lazy` | SC | ½ d | P7 | `PLAN.md` §4.2 | ✅ 2026-11-10 W2 — the six planets whose `.glb` loads (Mercury, Venus, Mars, Jupiter, Saturn, Moon) plus the unreferenced `saturn_ring.png` ship `Lazy` in solar-system's `streaming.priorities`; the ZIP path is untouched, so pixels are unchanged (streaming e2e: textures 20/20, draw calls 27/27) while the manifest path dropped 273.8 → 224.8 MB. The remaining 128 MB is ONE engine-side `Texture` (the retained skybox pano) — filed as E-G2a, not a content problem. notes `code-foundations/SC-G2/notes.md` |
| E-G2a | The streaming prefetch retains a full-size `Texture` for an asset the host consumes via `Resources.getUrl` + `Cubemap.fromEquirectangular`: `skybox/stars_panorama.jpg` is 8192×4096 (128 MB live on the manifest path, absent on the ZIP path) — G2's remaining excess. Engine fix: release the raw texture after the cubemap conversion, or make `getUrl` on a prefetched asset not materialize a `Texture2D` | E | ½ d | SC-G2 | — | ⬜ |
| M2.1 | Run the eleven browser e2e specs with the editor override (`npx playwright install`) | P | ½ d | — | `PLAN.md` §2.7 | ⬜ |
| M2.2 | Full virtual-lab checks on the engine tarball P7 committed (`frontend/WebEngineTS-0.1.0.tgz`, eb7f314): backend unit + Postgres suite (in `vl-db.lock`), `ng test`, the browser e2e — the platform's next deploy ships it, ahead of A10. Red → fix forward or restore the previous tarball, ATTENTION | P | ½ d | — | Claude review 2026-11-10 | ⬜ |
| P3 | Brotli pre-compression of `.js`/`.wasm`/`.json` | P | ½ d | — | `tasks/E-growth` P3 | ⬜ |
| R3 | Redeploy the editor container; hand-check the native folder picker | Ed | owner | — | `tasks/E-growth` R3 | ⬜ owner |

## M3 — Editor milestone 1: a scenario without code, "Create project" → catalog *(~11–12 weeks)*

**Done when:** a teacher, in the editor on the site, creates a project, builds a lit scene from
primitives and imported models, sets components in the Inspector, and publishes it with their own
key into a draft an admin accepts — no ScenarioCreator involved.

| ID | Task | Repo | Size | Depends | Source | Status |
|---|---|---|---|---|---|---|
| B1 | Stage 6 — scene and objects: 3D Object menu, Unity navigation, orientation cube, tools, selection outline, gizmos, scene lighting | Ed | ~2 w | A8 | `tasks/B` B1 | 📐 plan ready (Claude, 2026-11-10): `code-foundations/B1/plan.md` — editor-side only, 8 serial phases, e2e via a localStorage-gated probe; navigation feel stays a manual DW; owner question #20 assumed |
| B2 | Stage 7 — Hierarchy (E7 sibling/component order) | Ed | ~1 w | B1 | `tasks/B` B2 | ⬜ |
| B3 | Stage 8 — Inspector (four sessions) | Ed | ~2.5 w | B2 | `tasks/B` B3 | ⬜ |
| B4 | Stage 9 — Project window and assets (E3, E5, `.meta` guids) | Ed, SC | ~3 w | A11, B3 | `tasks/B` B4 | ⬜ |
| B5 | Scenarios on their own origin | P | — | — | `tasks/B` B5 | ✅ superseded by the sandboxed player (`PLAN.md` §2.9, 2026-10-27) — close the card |
| B6 | Author publish keys + drafts an admin accepts (+ Opus security review) | P | ~1.5 w | P5a (HTTPS config) | `tasks/B` B6, `PLAN.md` §2.6 | 📐 plan ready (Claude, 2026-11-10): most of B6 already shipped in virtual-lab release 2 (93608dd); the plan hardens it — HTTPS guard, rotation/transfer, approve bound to version, BOLA sweep — `code-foundations/B6/plan.md`; owner questions #16–19 assumed at their recommendation |
| B7 | Stage 10 — Build, Build And Run, Publish | Ed | ~2 w | B0, B4, B6, A8 | `tasks/B` B7 | ⬜ |
| R1 | Project store outside Chromium (OPFS first) — decide before the first real authors | Ed | ~1–2 w | — | `tasks/E-growth` R1, decision #10 | ⬜ decision #10 delegated: OPFS first |
| M3.1 | Retire ScenarioCreator as the authoring path (keeps KTX2, LOD, manifests) | SC | ½ d | B7 | `tasks/B` | ⬜ |

## M4 — Editor milestone 2: behaviour and Play, as in Unity *(~10–12 weeks)*

**Done when:** a teacher adds scripts (written in the editor or from the behaviour library), presses
Play inside the editor, and the published scenario behaves the same on the platform.

| ID | Task | Repo | Size | Depends | Source | Status |
|---|---|---|---|---|---|---|
| C1 | Stage 11 — dockable windows, tabs, layouts | Ed | ~1.5 w | M3 | `tasks/C` C1 | ⬜ |
| C2 | Engine E2 — edit mode (`@ExecuteInEditMode`) | E | 3–5 d (Opus design) | — | `tasks/C` C2 | 📐 plan ready (Claude, 2026-11-10): `code-foundations/C2/plan.md` — process-wide mode flag, `@ExecuteAlways`/`@ExecuteInEditMode`, `Application.enterEditMode/enterPlayMode/updateEditMode`; note for C5: Play must reload the scene |
| C3 | Engine E4 — type registry accepts a replacement class | E | 1–2 d | — | `tasks/C` C3 | ⬜ |
| C4 | Stage 12 — scripts + the starter library of ten behaviours | Ed | ~3.5 w | C2, C3 | `tasks/C` C4 | ⬜ decision #7 delegated: the list in the C4 card |
| C5 | Stage 13 — Play and Game view (spike first) | Ed | ~2.5 w | C4 | `tasks/C` C5 | ⬜ |
| C6 | Engine E8 — `RenderTexture` (camera into a target); optional for M4 | E | 2–3 w (Opus design) | — | `tasks/C` C6, `PLAN.md` §1.3 | 📐 plan ready (Claude, 2026-11-10): `code-foundations/C6/plan.md` — RenderTexture extends Texture over a WebGLRenderTarget, engine-typed backend calls only (no second GPU path), target cameras by depth before the screen camera; shares Application.ts with C2 (second to merge syncs first) |

## M5 — Editor milestone 3: prefabs, settings, undo *(~6 weeks)*

**Done when:** prefabs with links work in project files (expanded at Build), project/render settings
have their windows, and undo/redo behaves like Unity's across every edit.

| ID | Task | Repo | Size | Depends | Source | Status |
|---|---|---|---|---|---|---|
| D1 | Stage 14 — prefabs (link-mode switch: Opus) | Ed, E | ~3 w | M4 | `tasks/D` D1 | 🧠 needs a Claude plan first — |
| D2 | Stage 15 — settings windows (E10) | Ed | ~1.5 w | — | `tasks/D` D2 | ⬜ |
| D3 | Stage 16 — Unity-style undo (by diffs; revisit `PrefabDiff` export) | Ed, E | ~1.5 w (Opus) | D1 | `tasks/D` D3, decision #12 | 🧠 needs a Claude plan first — |

## M6 — Growth lanes *(parallel; each pulled in when a lesson or a measurement needs it)*

| ID | Task | Repo | Size | Trigger / depends | Source | Status |
|---|---|---|---|---|---|---|
| P2 | Offline lessons (Service Worker, "prepare this lesson", `storage.persist()`) | P | ~1 w | after A10 | `tasks/E-growth` P2 | ⬜ |
| P4 | Per-scenario engine pinning | P | ~1 w | after A10 | `tasks/E-growth` P4 | ⬜ |
| R9 | Performance telemetry — decide before building | P | 1–2 d | owner | `PLAN.md` §2.5 | 🔒 |
| R8 | Streaming end to end (manifests from SC; where hashed objects live) | SC, P | 1–2 w | SC manifests, storage decision | `PLAN.md` §2.2, §4.1, §4.4 | ⬜ |
| R2rt | KTX2 transcode actually called at runtime | P | 1–2 d | — | `PLAN.md` §2.3 | ⬜ |
| N1 | KTX2 without `'unsafe-eval'` (own transcoder build) | E | 2–3 d | — | `tasks/E-growth` N1 | ⬜ |
| N2 | meshopt + KTX2 inside glTF | E | 1–2 d | N1 | `tasks/E-growth` N2 | ⬜ |
| N3 | Rapier behind the physics API | E | 3 d spike + ~2 w | — | `tasks/E-growth` N3 | 🧠 Opus-level design: Claude plans first — |
| N4 | Render adapter stage 1 → WebGPU | E | weeks (Opus) | — | `tasks/E-growth` N4, `PLAN.md` §1.4 | 🧠 Opus-level design: Claude plans first — |
| N5 | Accessibility: hidden DOM twin of the Canvas UI | E | ~2 w | — | `tasks/E-growth` N5 | 🧠 Opus-level design: Claude plans first — |
| N6 | UV convention C3 / gap G4 | E | Opus | a visual harness first | `tasks/E-growth` N6 | 🧠 Opus-level design: Claude plans first — |
| N7 | Canvas UI stage 1 | E | — | when the editor's UI tools are scheduled | `tasks/E-growth` N7 | ⬜ |
| R2 | Editor Angular 19 → 21, zoneless | Ed | 2–3 d | — | `tasks/E-growth` R2 | ⬜ |
| R4 | Realtime co-editing | Ed, P | later (Opus) | R1, D3 | `tasks/E-growth` R4 | ⬜ |
| G5 | Engine: a caller for `Time._reset()` so `timeScale` does not leak | E | ½ d | — | `ENGINE-GAPS.md` G5 | ⬜ |
| V1 | DNA right-handedness, orbit direction, sprites/shadows — by eye | SC | owner | — | `PLAN.md` §1.1 | ⬜ owner |
| V2 | `LineRenderer.useWorldSpace` default | E | owner | — | `PLAN.md` §0 | 🔒 |
| V3 | AtomStructure: ~36 of 118 elements — scope | SC | owner | — | `ISSUES.md` | 🔒 |
| V4 | LOD texture variants' VRAM saving, measured on real GPUs | SC, B | owner hw | decision #4 | `PLAN.md` §4.3 | 🔒 |
| M6.1 | Code graph for virtual-lab (most-edited repo) | P | ½ d | if work there continues | research 2026-11-04 | ⬜ |

## M7 — After milestone 3: the remaining Unity windows *(stages 17–27, one decision each)*

UI tools (needs N7), Animation + Animator (needs E12 animator assets), Profiler (engine diagnostics
exist), and the rest — a card per window when a scenario needs it (`tasks/D-milestone-3.md`, editor
plan §6, §6a, §10).

---

## Owner decisions that gate the roadmap

| # | Decision | Gates |
|---|---|---|
| 2 | Cut `v0.2.0` | M1 (A9) |
| 3 | Back up `design/Article` | M0 |
| 4 | Student hardware to budget for | M6 (V4, N4 budgets) |
| 7 | The editor's starter behaviour library | M4 (C4) |
| 10 | OPFS vs server project store | M3 (R1) |
| 11 | Who deploys production, and when | M1 (M1.2) |
| — | `LineRenderer.useWorldSpace` default; AtomStructure scope; R9 telemetry | M6 |
