# Plan: N3 — Rapier behind the physics API
**Created:** 2026-11-11 (Claude, architect lane)
**Status:** ready
**Complexity:** complex
**Review cadence:** 1
**Check-ins:** quiet
---
## Context
cannon-es has had no release since 2022-08. N3 first **measures** cannon-es against Rapier
(`@dimforge/rapier3d*-compat`) on physics-heavy scenes — correctness, CPU ms per step, shipped size,
CSP — and only if Rapier wins puts both behind one engine-typed backend seam under `Rigidbody`,
`Collider`, `Joint`, `PhysicMaterial` and `Physics`, with the same public API, then switches the
default when the criteria hold through the engine. Card: `tasks/E-growth.md` § N3. Research and
every decision with its evidence: `code-foundations/N3/research.md` — **read it first; its Decisions
D-1…D-16 are binding.** Base: WebEngineTS `master` `a020db6`.

**Success criteria (card + research):**
1. A written, re-runnable spike (`scripts/physics-bench/`) with numbers for S1/S2/S3, both backends,
   Node and Chromium, sizes and CSP results, and a go/no-go against D-9 (`code-foundations/N3/spike.md`).
2. If go: no file outside `src/engine/physics/backend/` imports `cannon-es` or Rapier; the public
   physics API (`index.ts` exports, members, serialized fields) is unchanged — `dist/WebEngineTS.d.ts`
   public surface diff limited to the additions named in this plan.
3. Every existing test file passes **unchanged** on the cannon backend; every behavioural physics
   test file passes **unchanged** on the Rapier backend (D-10).
4. `dist/WebEngineTS.standalone.js` stays within its 450,000 B budget; Rapier ships as a separate
   `dist/WebEngineTS.rapier.js` with its own budget; raycast-only content never downloads it.
5. Rapier initialises inside the player frame under the shipped policy and under `'wasm-unsafe-eval'`
   alone (player-smoke probe).
6. The default switches to Rapier only when D-9's switch-over criteria are met and recorded.
7. `npm run typecheck`, `npm test`, `npm run build`, `npm run size` green.

## Constraints
- Engine only (`WebEngineTS`) plus this task's `.claude-shared` notes, ROADMAP row and follow-up rows.
  Consumer changes (editor CSP, ScenarioCreator manifests, virtual-lab headers, benchmarks) are
  follow-up rows, never edited here.
- No serialized field, type name or file-format change (D-14). No change to raycast/overlap queries
  (D-6). No change to the fixed-step order in `Application._loop` (`Application.ts:759-766`).
- Nothing in `src/engine/core/**` imports a backend; nothing outside `src/engine/physics/backend/**`
  imports `cannon-es` or `@dimforge/*` (checked by a test that greps the source tree).
- Zero allocation per step in the backends' hot paths (pose sync, contact drain) — reuse scratch.
- Pin Rapier to an exact version (no `^`). Never inline Rapier into the standalone bundle.
- Never weaken, skip or edit an existing test to pass (D-10's `cannonOnly` list is the only exclusion
  mechanism, each entry reviewed). Anything this plan does not answer is a question: park the task
  (ATTENTION), do not guess.
- **If Phase 3 says no-go, skip Phases 4–12 and run Phase 13 only** (record the result).

---
## Implementation Phases

### Phase 1: Spike harness — raw cannon vs raw Rapier in Node, correctness and speed
**Skills:** code-foundations:performance-optimization, code-foundations:cc-quality-practices
**Model:** sonnet
**Gate:** Standard
**Depends on:** none
**File scope:** scripts/physics-bench/** (new), package.json (devDependencies: exact `@dimforge/rapier3d-compat`, `@dimforge/rapier3d-deterministic-compat` versions; one `"physics-bench"` script), package-lock.json

**Goal:** one script runs S1/S2/S3 (research D-2) and the D-3 checks against cannon-es and Rapier,
calling the libraries directly (no engine code), and prints a table + writes CSV.

**Scope:**
- IN: a scene description as plain data (bodies, shapes, materials, joints, triggers), one builder per
  library; fixed dt 1/50, 6 solver iterations on both; 60 warmup + 600 measured steps; per step: step
  ms, pose-sync ms (read every dynamic pose into one reused `Float32Array`), contacts/events drained;
  median, p95, max; D-3 checks as pass/fail with the measured value; Rapier versions 0.19.3 and 0.21.0
  (plain-compat and deterministic-compat) selectable by flag (install the second version under an npm
  alias, e.g. `rapier-0213`); `--json` output for Phase 2.
- OUT: browser runs (Phase 2), engine integration (Phase 4+).

**Edge cases:** Rapier needs `await init()` before building; free every Rapier world after a run
(`world.free()`); Rapier forces persist — the harness calls `resetForces` after each step and a D-3
check proves the persistence exists without it; cannon `Spring` is applied before each step, Rapier
spring is a joint.

**Produces:** `npm run physics-bench -- --backend <cannon|rapier> --version <v> [--det] --scene <S1|S2|S3> [--json]`.

**Done when:**
- [ ] DW-1.1: `npm run physics-bench -- --all` prints one row per (backend, version, flavour, scene) with step/sync median+p95 and every D-3 check's value and verdict; recorded output pasted into `scripts/physics-bench/RESULTS-node.md`.
- [ ] DW-1.2: two runs of the deterministic Rapier flavour on S2 produce byte-identical final pose arrays (hash printed).
- [ ] DW-1.3: the "forces persist without `resetForces`" check passes on Rapier (proves the D-16 adapter rule is needed) and the "forces cleared" check passes with it.
- [ ] DW-1.4: `npm run typecheck`, `npm test` green (the harness is outside `tests/`, not part of `npm test`).

### Phase 2: Spike — Chromium runs, shipped size, CSP in the player frame
**Skills:** code-foundations:performance-optimization, code-foundations:cc-defensive-programming
**Model:** sonnet
**Gate:** Standard
**Depends on:** Phase 1
**File scope:** scripts/physics-bench/** , scripts/player-smoke/fixtures.mjs, scripts/player-smoke/run.mjs, scripts/player-smoke/policy.mjs (one extra policy variant only)

**Goal:** the same scenes measured in headless Chromium, the real shipped size of each Rapier option,
and proof that Rapier initialises under the frame's policy.

**Scope:**
- IN: a Chromium runner using the playwright already located by `scripts/player-smoke/locate-playwright.mjs`
  (no new dependency), loading the Phase 1 harness as an ES module page; sizes: gzip-9 and brotli of
  each candidate as it would ship (the `-compat` `rapier.mjs` bundled + minified with the would-be
  adapter stub, via a throwaway rollup call into `scripts/physics-bench/out/`, git-ignored);
  player-smoke: a `rapier` probe in the fixture scenario (`await RAPIER.init()` from a module served
  next to the engine bundle, with the engine bundle's ACAO), a policy variant `script-src` with
  `'wasm-unsafe-eval'` instead of `'unsafe-eval'`, and the existing ablation `-script-src:'unsafe-eval'`.
- OUT: changing `player.nginx.conf` or any shipped file.

**Edge cases:** Firefox/WebKit runs if `player-smoke --browsers` has them locally (record which ran);
first-init latency (download excluded, compile + init included) measured separately from steady state.

**Done when:**
- [ ] DW-2.1: `scripts/physics-bench/RESULTS-chromium.md` holds the Chromium table for every Phase 1 row, with the machine and browser version.
- [ ] DW-2.2: the size table (raw / gzip-9 / brotli per candidate) is in the results file, produced by the script, not by hand.
- [ ] DW-2.3: `npm run player-smoke -- --only rapier` (or the runner's equivalent filter): `rapier` passes with the shipped policy and with `'wasm-unsafe-eval'` alone, and fails (named `CompileError`/CSP violation) with neither; output pasted.
- [ ] DW-2.4: `npm run typecheck`, `npm test` green; `npm run player-smoke` results for pre-existing probes unchanged.

### Phase 3: Spike report and go/no-go
**Skills:** code-foundations:cc-quality-practices
**Model:** sonnet
**Gate:** Full
**Depends on:** Phase 2
**File scope:** .claude-shared/code-foundations/N3/spike.md (new)

**Goal:** a decision on evidence: go (and which version/flavour) or no-go, against D-9.

**Scope:**
- IN: one table per criterion of D-9 (correctness, S1/S2 speed ratio in Chromium, size, CSP), the
  chosen version and flavour by D-4's rule, every D-3 check where the backends differ (with Unity's
  expected behaviour), first-init latency.
- OUT: anything that tunes cannon to look better or worse; changes to criteria (a criterion that
  seems wrong is an ATTENTION question, not an edit).

**Done when:**
- [ ] DW-3.1: `spike.md` states GO or NO-GO in its first line, each D-9 criterion with its measured value and verdict, and the chosen exact version + flavour.
- [ ] DW-3.2: the reviewer re-runs `npm run physics-bench -- --scene S1` for cannon and the chosen Rapier and gets medians within 15% of the report.
- [ ] DW-3.3: NO-GO → the worker skips to Phase 13 (Phase 4–12 boxes marked "not built: no-go").

### Phase 4: The seam — `PhysicsBackend` interface and `CannonBackend`
**Skills:** code-foundations:aposd-designing-deep-modules, code-foundations:cc-defensive-programming
**Model:** sonnet
**Gate:** Full
**Depends on:** Phase 3 (GO)
**File scope:** src/engine/physics/backend/PhysicsBackend.ts (new), src/engine/physics/backend/CannonBackend.ts (new), src/engine/physics/cannon-augments.d.ts (move under backend/ if needed), tests/PhysicsBackendCannon.test.ts (new)

**Goal:** the interface of D-5 and a cannon implementation of it, with nothing calling it yet.

**Scope:**
- IN: `PhysicsBackend` (world create/free/step/gravity/iterations/defaults; body; collider; material
  values on colliders; joints fixed/hinge/spring; `drainContacts(visit)`; `kind: "cannon"|"rapier"`),
  opaque handle types (branded numbers or objects with no library members), pose read/write through
  caller-owned arrays; `CannonBackend` reproducing today's behaviour exactly (pairwise
  `ContactMaterial`s and `defaultContactMaterial`, counter-force gravity, `Spring` forces before step,
  per-body layer filter "last wins", cylinder capsule, HingeConstraint pivot/axis derivation from
  `Joint.ts:213-230`) — code moved, not redesigned. Inspection hooks for D-10
  (`_cannonWorld`, body/shape/constraint/material lookups by handle).
- OUT: switching components to it (Phase 5–6).

**Edge cases:** contact grouping per collider pair with canonical orientation (`Physics.ts:151-200`
logic moves into `drainContacts`, keyed by collider ids the engine assigns); removing a shape from a
body that was never added; a hinge whose `other` is the world body.

**Produces:** the interface contract every later phase relies on — document every method's units
(engine world space, metres, radians, seconds) and ownership in TSDoc.

**Done when:**
- [ ] DW-4.1: `PhysicsBackend.ts` imports nothing from `cannon-es`, `@dimforge/*` or `three`; a test greps it.
- [ ] DW-4.2: unit tests drive `CannonBackend` alone: a ball dropped on a floor reports one pair with ≥1 contact point and the canonical orientation; a material pair gets the averaged friction; gravity scale 0 hovers; a hinge built at a rotated body keeps both bodies on one axis (same numbers as `HingeJointGeometry.test.ts`).
- [ ] DW-4.3: `npm run typecheck`, `npm test` green, no existing test changed.

### Phase 5: Components onto the seam — bodies, colliders, materials, dispatch (cannon only)
**Skills:** code-foundations:cc-refactoring-guidance, code-foundations:cc-defensive-programming
**Model:** sonnet
**Gate:** Full
**Depends on:** Phase 4
**File scope:** src/engine/physics/PhysicsWorld.ts, src/engine/physics/Physics.ts, src/engine/physics/Rigidbody.ts, src/engine/physics/Collider.ts, src/engine/physics/BoxCollider.ts, src/engine/physics/SphereCollider.ts, src/engine/physics/CapsuleCollider.ts, src/engine/physics/PhysicMaterial.ts, src/engine/physics/backend/CannonBackend.ts (fixes only), tests/PhysicsSeam.test.ts (new)

**Goal:** every physics component holds engine state and a backend handle; cannon stays the only
backend and every existing test passes unchanged.

**Scope:**
- IN: D-5 "engine state is the source of truth" in `Rigidbody` (mass, drag, angularDrag, isKinematic,
  useGravity, constraints, material, velocity reads through the backend), `Collider` and subclasses
  (shape params, center, trigger, material, layer), `PhysicMaterial` (values only; the pairing moves
  into `CannonBackend`); `PhysicsWorld` becomes the owner of the active backend; `Physics._step` and
  `_processCollisions` call the backend (dispatch, Enter/Stay/Exit, `_dispatch` stay engine-side);
  D-10 inspection accessors kept with their current names and types (`PhysicsWorld.instance.world`,
  `Rigidbody._body`, `Collider._getBody()`, `PhysicMaterial._cannonMaterial`) — `@internal`, valid only
  on cannon, throwing `"[Physics] <name> is cannon-only (active backend: <kind>)"` otherwise.
- OUT: joints, `useBackend`, pending attach (Phase 6); raycast/overlap code (untouched).

**Edge cases:** `Rigidbody._body` must exist right after construction on cannon (RestoreOrder reads it
before enable); `_onEnabled` re-attach order (`Collider.ts:314-321`); a collider whose `center` changes
while attached (`_syncShapeOffset` semantics); `isTrigger` toggled while attached; material assigned
before the collider attaches; profiler hooks (`Physics.ts:458-460`) keep their numbers.

**Done when:**
- [ ] DW-5.1: `grep -rn "cannon-es" src` lists only files under `src/engine/physics/backend/` (test asserts).
- [ ] DW-5.2: every existing test file passes unchanged (`git diff a020db6 -- tests/` shows only new files).
- [ ] DW-5.3: new seam tests: changing `mass`, `drag`, `constraints`, `isTrigger`, `center`, `sharedMaterial.friction` on a live component reaches the backend (asserted through a recording fake backend, not cannon).
- [ ] DW-5.4: `npm run typecheck`, `npm test`, `npm run build`, `npm run size` green; standalone gzip within ±2% of `a020db6`'s 393,125 B.

### Phase 6: Joints, backend selection API, pending attach, world lifecycle (cannon only)
**Skills:** code-foundations:cc-defensive-programming, code-foundations:aposd-verifying-correctness
**Model:** sonnet
**Gate:** Full
**Depends on:** Phase 5
**File scope:** src/engine/physics/Joint.ts, src/engine/physics/Physics.ts, src/engine/physics/PhysicsWorld.ts, src/engine/physics/Rigidbody.ts, src/engine/physics/Collider.ts, src/engine/core/Application.ts (`dispose` → `Physics._reset()` only), src/engine/core/EngineSettings.ts (`Physics.BACKEND`), src/engine/index.ts (exports `PhysicsBackendKind` type only), tests/PhysicsSeam.test.ts, tests/PhysicsBackendSelection.test.ts (new)

**Goal:** joints through the backend; `Physics.backend` / `await Physics.useBackend(kind)`; components
that can wait for an asynchronous backend; `Application.dispose` frees the world.

**Scope:**
- IN: `FixedJoint`/`HingeJoint`/`SpringJoint` call backend joint add/remove (`Joint._constraint` kept as
  the cannon inspection accessor; `SpringJoint._applyAll`'s role moves into `CannonBackend.step`);
  `Physics.backend: PhysicsBackendKind` (read-only), `Physics.useBackend(kind): Promise<void>`
  (idempotent; throws a named error if called with a different kind after any body exists in the
  world); a backend *factory registry* (`"cannon"` built in; `"rapier"` resolved by Phase 9) so this
  phase has no Rapier code; **pending attach** (D-8): when the active backend is not ready, components
  keep state and queue; attach in enable order when ready; `_step` simulates nothing until then and
  warns once; `Application.dispose()` → `Physics._reset()` (D-15).
- OUT: Rapier itself (Phase 7–8), loading the file (Phase 9).

**Edge cases (each one a test with a fake async backend):** Rigidbody enabled then disabled before
ready → never attached; destroyed before ready → never attached, no leak in the queue; collider added
to a pending body; joint whose `connectedBody` is pending; `_reset` while a load is in flight → the late
resolution is ignored; `useBackend("cannon")` twice is a no-op; `dispose()` then a new `Application` →
fresh world, gravity back to `EngineSettings.Physics.GRAVITY`.

**Done when:**
- [ ] DW-6.1: every existing test file passes unchanged, including `HingeJointGeometry`, `SpringJoint`, `Physics` (joint section).
- [ ] DW-6.2: the seven edge cases above pass against a fake backend whose `ready` resolves on demand.
- [ ] DW-6.3: `Physics.gravity` set in one Application is back to default after `dispose()` + new Application (test).
- [ ] DW-6.4: `npm run typecheck`, `npm test`, `npm run build`, `npm run size` green.

### Phase 7: `RapierBackend` — world, bodies, colliders, materials, layers, contacts
**Skills:** code-foundations:cc-defensive-programming, code-foundations:performance-optimization
**Model:** sonnet
**Gate:** Full
**Depends on:** Phase 6
**File scope:** src/engine/physics/backend/RapierBackend.ts (new), src/engine/physics/backend/RapierLayers.ts (new), package.json (dependency: the exact version/flavour chosen in `spike.md`), package-lock.json, tests/PhysicsBackendRapier.test.ts (new)

**Goal:** a Rapier implementation of everything Phase 5 routes through the seam.

**Scope:**
- IN: `createBackend()` awaiting `init()`; world with gravity, `timestep`, `numSolverIterations` from
  `EngineSettings`; dynamic/kinematic/fixed bodies; box/sphere/**true capsule** colliders with offset;
  sensors for triggers (sensor `activeCollisionTypes` include `KINEMATIC_FIXED` and
  `KINEMATIC_KINEMATIC`, research table "Unity semantics"); per-collider friction/restitution with
  `Average` combine and the world default for material-less colliders (D-11); mass distribution (D-13);
  layers (D-12: 16-slot compaction, hooks beyond 16); `ActiveEvents.COLLISION_EVENTS` on every
  collider; `drainContacts` = start/stop events maintained into a pair set + contact points per
  touching non-sensor pair from the narrow phase, same visit contract as `CannonBackend`; pose
  read/write via reused scratch; `free()`.
- OUT: forces, kinematic motion, gravity scale, sleep, joints (Phase 8).

**Edge cases:** a collider moved to a different body (Rigidbody added later) — Rapier cannot re-parent
a collider: remove and re-create with the same engine id; layer change while attached; a 17th distinct
layer appears (hooks path) and disappears again (back to bits); every handle removed before
`world.free()`; `drainContacts` after a pair's collider was removed mid-step reports Exit once.

**Done when:**
- [ ] DW-7.1: `RapierBackend` unit tests mirror DW-4.2 (ball on floor pair + contacts, averaged friction, trigger enter/exit counts) and pass.
- [ ] DW-7.2: layer test with 18 distinct layers: every ignored pair never contacts, every allowed pair does.
- [ ] DW-7.3: a 500-body pose sync allocates nothing per step (heap-delta test or allocation counter, same method as existing zero-allocation tests if any; else `--expose-gc` heap compare documented).
- [ ] DW-7.4: `npm run typecheck`, `npm test`, `npm run build`, `npm run size` green; `src/engine/index.ts` does not import `RapierBackend` (standalone unchanged).

### Phase 8: `RapierBackend` — forces, kinematic motion, gravity, sleep, axis locks, joints
**Skills:** code-foundations:cc-defensive-programming
**Model:** sonnet
**Gate:** Full
**Depends on:** Phase 7
**File scope:** src/engine/physics/backend/RapierBackend.ts, tests/PhysicsBackendRapier.test.ts

**Goal:** the rest of the seam on Rapier, with Unity's step semantics (D-16).

**Scope:**
- IN: `ForceMode` Force/Acceleration/Impulse/VelocityChange, torque, force at position;
  `resetForces`/`resetTorques` on every dynamic body after each step; kinematic via
  `setNextKinematicTranslation/Rotation` from the engine transform before the step; gravity scale
  0/1 for `useGravity`; `setEnabledTranslations/Rotations` for `RigidbodyConstraints`; damping; sleep,
  wake, `isSleeping`; joints: fixed (`JointData.fixed` with frames from current poses), hinge
  (`revolute`, anchor/axis in body A space, B's derived like `Joint.ts:226-227`), spring
  (`JointData.spring(distance, stiffness, damping, anchors)`), world-anchored joints against one fixed
  world body owned by the backend.
- OUT: anything not in the seam.

**Edge cases:** `isKinematic` toggled while moving; `mass` changed on a sleeping body (wakes);
`constraints = FreezeAll` then `None`; joint rebuilt while the connected body is pending (Phase 6
contract); spring with `distance 0`.

**Done when:**
- [ ] DW-8.1: tests: an `addForce` applied once moves the body for exactly one step (no persistence); `Impulse` and `VelocityChange` give the same Δv as on cannon for the same input (±1e-6).
- [ ] DW-8.2: a kinematic paddle moving at 2 m/s pushes a resting box (box gains ≥1.5 m/s); on cannon the same scene is recorded (expected weaker; difference listed for D-11).
- [ ] DW-8.3: pendulum and spring periods match D-3 tolerances through the backend.
- [ ] DW-8.4: `npm run typecheck`, `npm test` green.

### Phase 9: Packaging and loading — `WebEngineTS.rapier.js`, budget, player probe
**Skills:** code-foundations:cc-defensive-programming, code-foundations:aposd-verifying-correctness
**Model:** sonnet
**Gate:** Full
**Depends on:** Phase 8
**File scope:** rollup.config.mjs (one new entry), src/engine/physics/backend/rapier-entry.ts (new), src/engine/physics/Physics.ts (`rapierModuleUrl`, `"rapier"` factory registration), package.json (`exports["./rapier"]`, `files` if listed), scripts/lib/bundle-checks.mjs (new budget), scripts/check-bundle-size.mjs (new target), scripts/release-local.mjs (copy the file wherever the standalone is copied), scripts/player-smoke/fixtures.mjs (probe now loads the real file), tests/BundleChecks*.test.ts (if budgets are unit-tested), tests/PhysicsRapierLoading.test.ts (new)

**Goal:** Rapier ships as one engine-free file loaded on demand, and nothing else grows.

**Scope:**
- IN: rollup entry `src/engine/physics/backend/rapier-entry.ts` → `dist/WebEngineTS.rapier.js` (ES,
  minified, `-compat` Rapier + `RapierBackend` + its imports only — it must not contain engine
  components, research D-7); `Physics.rapierModuleUrl` (default
  `new URL("./WebEngineTS.rapier.js", import.meta.url).href`, settable before `useBackend`); the
  `"rapier"` factory = dynamic `import(url)` → `createBackend()`; the ESM/CJS builds reference the
  file through the package export so bundlers code-split it; budget = measured gzip-9 + 5%, recorded
  with the date in `bundle-checks.mjs` (Q-N3-1); the forbidden-marker check proves the file has no
  `GameObject`/`Rigidbody`/`WebGLRenderer`; `release:local` copies it next to every copied standalone.
- OUT: virtual-lab nginx headers, benchmarks repo copies (follow-up rows).

**Edge cases:** module URL unreachable → `useBackend` rejects with a named error and the active backend
stays unchanged; CSP blocks WASM → named error mentioning `'wasm-unsafe-eval'`; two `useBackend("rapier")`
calls in flight share one load.

**Done when:**
- [ ] DW-9.1: `npm run build && npm run size`: standalone within its budget and within ±2% of Phase 6's size; `WebEngineTS.rapier.js` within its new budget and free of engine markers.
- [ ] DW-9.2: player-smoke `rapier` probe passes against the **built** file with the shipped policy and with `'wasm-unsafe-eval'` alone.
- [ ] DW-9.3: tests: unreachable URL and blocked-WASM paths reject with the named errors and leave cannon active; concurrent loads resolve once.
- [ ] DW-9.4: `npm run typecheck`, `npm test` green.

### Phase 10: Selection per scenario and host
**Skills:** code-foundations:cc-defensive-programming
**Model:** sonnet
**Gate:** Full
**Depends on:** Phase 9
**File scope:** src/engine/core/scenario/ScenarioTypes.ts (`IScenarioManifest.physics?`), src/engine/core/scenario/Scenario.ts (await `Physics.useBackend` before the scenario is adopted/run), src/engine/core/assets/StreamingManifest.ts (same field), src/engine/core/scenario/ManifestVersions.ts (only if the field needs a version note), src/engine/core/Application.ts (`loadScenarioFrom*` option `physicsBackend`), src/player/protocol.ts, src/player/player/*.ts, src/player/host/PlayerHost.ts (optional `physicsBackend` passed through), tests/PhysicsBackendSelection.test.ts, tests/PlayerProtocol*.test.ts (new cases only)

**Goal:** D-8 precedence — host option > manifest > `EngineSettings` — and preloading for content that
declares dynamics; the lazy path for content that does not.

**Scope:**
- IN: manifest field `physics?: { backend?: "cannon" | "rapier" }` (optional, additive; an unknown
  value is a validation error naming the field); the loader awaits `useBackend` before the scenario's
  scripts run; the host option validated like `transcoderPath` in `protocol.ts`; the lazy trigger (first
  `Rigidbody`/`Joint` enable in play mode) for scenarios that did not preload; C2 edit-mode guard if
  `_PlayMode.ts` exists on the base (else: omit + follow-up row, research "Risks").
- OUT: ScenarioCreator manifests (follow-up row).

**Edge cases:** a manifest without the field (all of today's) behaves exactly as before; a scenario
with only colliders on Rapier never downloads the file (test with a fake loader counting calls);
host says cannon, manifest says rapier → cannon; protocol message from an old host without the field.

**Done when:**
- [ ] DW-10.1: every existing scenario/player test passes unchanged; the ten ScenarioCreator production manifests (read-only from the worker's own `ScenarioCreator` worktree) validate unchanged.
- [ ] DW-10.2: tests for each precedence case and for "colliders only → no load".
- [ ] DW-10.3: `npm run typecheck`, `npm test`, `npm run build`, `npm run size` green.

### Phase 11: Parity — unchanged tests on Rapier, parity scenes through the engine
**Skills:** code-foundations:cc-quality-practices
**Model:** sonnet
**Gate:** Full
**Depends on:** Phase 10
**File scope:** vitest.config.ts (projects: `cannon` = today's config, `rapier` = behavioural physics files + setup), tests/setup/rapier-backend.ts (new), tests/rapier-projects.ts (new: include list and reviewed `cannonOnly` list with reasons), tests/PhysicsParity.test.ts (new), tests/PhysicsSourceBoundary.test.ts (new), src/engine/physics/backend/RapierBackend.ts (parity fixes only)

**Goal:** D-10 made executable, and D-3's checks run through the engine API on both backends.

**Scope:**
- IN: `npm test` runs both projects; the Rapier project's include list = `CollisionCallbacks`,
  `OverlapSphere`, `RaycastTruth`, `RigidbodyGravity`, `SpringJoint`, `ColliderCenter` (if it reads
  only public behaviour — otherwise white-box list), `Serialization`/`FormatVersions`/`AssetFiles`/
  `MissingComponent`/`PrefabComponentIds`/`ModuleHookInstallation` (physics components round-trip);
  white-box files listed as excluded with reason; parity test = S3 + the D-3 checks built from
  engine components, run on both backends with the D-3 tolerances; the source-boundary test
  (Constraints: who may import `cannon-es`/`@dimforge`).
- OUT: editing any existing test (a failure is fixed in the adapter, or — only if the test encodes a
  cannon artefact contradicting Unity — listed in `cannonOnly` with the Unity citation).

**Done when:**
- [ ] DW-11.1: `npm test` runs both projects green; `git diff a020db6 -- tests/` shows no modified pre-existing file.
- [ ] DW-11.2: `cannonOnly` has a reason + Unity reference per entry; the Full-gate reviewer re-derives each and rejects any that is a Rapier bug.
- [ ] DW-11.3: parity test passes on both backends (or records the cannon failure for the capsule/kinematic checks as expected, per D-11).

### Phase 12: Switch-over — measure through the engine, flip the default, document differences
**Skills:** code-foundations:performance-optimization, code-foundations:code-clarity-and-docs
**Model:** sonnet
**Gate:** Full
**Depends on:** Phase 11
**File scope:** scripts/physics-bench/** (engine-driven mode), src/engine/core/EngineSettings.ts (`Physics.BACKEND` default), design/physics-backends.md (new), .claude-shared/code-foundations/N3/switch-over.md (new)

**Goal:** D-9's switch-over criteria measured through engine components, and the default flipped only
if they hold.

**Scope:**
- IN: `physics-bench --engine` builds S1/S2 from `GameObject`s + components and times
  `Physics._step` (Node and Chromium); first-step latency after `useBackend("rapier")`; result table in
  `switch-over.md`; if all hold → `EngineSettings.Physics.BACKEND = "rapier"`; if not → stays
  `"cannon"`, `switch-over.md` says which criterion failed, and a follow-up row is proposed;
  `design/physics-backends.md`: the seam, how to select, packaging/CSP, and the behaviour-differences
  table (research D-11) with the parity results.
- OUT: removing cannon (follow-up row after one release).

**Done when:**
- [ ] DW-12.1: `switch-over.md` lists each criterion with value and verdict; the reviewer re-runs S1 through the engine on both backends and reproduces the ratio within 15%.
- [ ] DW-12.2: the default equals what the criteria dictate; with the default flipped, the cannon project still runs every existing test unchanged (it selects cannon explicitly in its setup).
- [ ] DW-12.3: full checks green: `npm run typecheck`, `npm test` (both projects), `npm run build`, `npm run size`, `npm run player-smoke` (pre-existing probes unchanged + `rapier`).

### Phase 13: Docs, roadmap, follow-ups
**Skills:** code-foundations:code-clarity-and-docs
**Model:** sonnet
**Gate:** Minimal
**Depends on:** Phase 12 (or Phase 3 on NO-GO)
**File scope:** CHANGELOG.md (engine), .claude-shared/ROADMAP.md (N3 row + follow-up rows), .claude-shared/tasks/E-growth.md (N3 status line), .claude-shared/tasks/OWNER-DECISIONS.md (Q-N3-1…3 as delegated), .claude-shared/ENGINE-GAPS.md (only if a gap was found), .claude-shared/code-foundations/N3/*

**Goal:** the result is recorded where the owner and the next tasks look.

**Done when:**
- [ ] DW-13.1: engine CHANGELOG — GO: *Added* (`Physics.backend`, `Physics.useBackend`, `Physics.rapierModuleUrl`, manifest `physics.backend`, host option `physicsBackend`, `dist/WebEngineTS.rapier.js` + its budget) and *Changed* (`Application.dispose` resets physics; the default backend if flipped, with the measured S1/S2 numbers, because it moves measured numbers; the behaviour-differences summary). NO-GO: nothing in the engine CHANGELOG except the bench script under *Added* if it was merged.
- [ ] DW-13.2: ROADMAP N3 → `✅ <date> W<n>` + one-line result (GO/NO-GO, version, ratio); follow-up rows `⬜`: editor CSP `'wasm-unsafe-eval'` (virtual-lab, Q-N3-3); virtual-lab nginx ACAO/location for `WebEngineTS.rapier.js`; ScenarioCreator: declare `physics.backend` where a scenario gains dynamics; benchmarks re-measure on the new build; remove cannon after one release (Q-N3-2); KHR physics import/export mapping (D-14); C2 edit-mode guard if it was omitted.
- [ ] DW-13.3: OWNER-DECISIONS rows for Q-N3-1…3 with the recommendation recorded as the delegated answer; `spike.md`, `switch-over.md` and build notes in `code-foundations/N3/`.

---
## Test Coverage
**Level:** 100% of new routines; every pre-existing test unchanged.
## Test Plan
- [ ] Every DW above maps to a named test or a pasted command output (DW-1.1, 2.1–2.3, 3.2, 9.1–9.2, 12.1).
- [ ] Dirty tests: Rigidbody enabled/disabled/destroyed before the backend is ready; `_reset` during a load; module URL 404; WASM blocked by CSP; 17+ layers; collider re-parented to a new Rigidbody on Rapier; handle use after `world.free()` impossible (all handles cleared — test double `_reset`); `useBackend` with a different kind after bodies exist → named error.
- [ ] Integration: S3 rig and the D-3 checks through engine components on both backends; a scenario with a `physics.backend: "rapier"` manifest loaded through `loadScenarioFromBuffer` steps bodies from its first fixed step.
- [ ] Browser: player-smoke `rapier` probe (shipped policy, `'wasm-unsafe-eval'` only, neither).
- [ ] Manual: none.

## Assumptions
| Assumption | Confidence | Verify Before Phase | Fallback If Wrong |
|---|---|---|---|
| Rapier `-compat` runs under vitest/Node (base64 WASM, no fetch) | high | 1 | load the plain `.wasm` from disk in the test setup via `initSync`-style bytes; record it |
| A per-pose WASM call per body is cheap enough at 500 bodies | medium | 1 | read all poses through one bulk call if the pinned version has one; else record the cost in the D-9 ratio (sync is included) |
| `import.meta.url` is available in the standalone (ES) build where it runs | high | 9 | default `rapierModuleUrl` derived from the player's `engineUrl` passed into `Physics` by the player |
| No behavioural test encodes a cannon artefact | medium | 11 | `cannonOnly` list, reviewed per entry (D-10) |
| C2 merges before Phase 10 | medium | 10 | omit the edit-mode guard, follow-up row |
| Rapier forces persist until `resetForces` | high | 1 (DW-1.3) | drop the reset if the check shows otherwise; record it |

## Decision Log
| Decision | Alternatives Considered | Rationale | Phase |
|---|---|---|---|
| Spike on raw libraries, then seam | build the seam first and compare through it | card: "only if it wins"; 3 days vs 2 weeks at risk | 1–3 |
| Engine state as source of truth, opaque handles (D-5) | wrap cannon types; let components hold Rapier objects | Rapier creates bodies inside a world asynchronously; cannon creates them standalone — only engine-owned state fits both | 4–6 |
| Raycasts stay on Three.js proxies (D-6) | Rapier `castRay` | backend-independent, synchronous, no WASM for picking-only content (all shipped scenarios) | — |
| Separate `WebEngineTS.rapier.js`, `-compat` flavour (D-7) | inline into standalone; bare `.wasm` + fetch | standalone budget 450 KB vs ≥586 KB gzip of WASM; compat needs no MIME/bundler plugin | 9 |
| Lazy Rapier world, preload by manifest/host (D-8) | always load at scenario start | raycast-only content never pays ~0.6–0.9 MB | 6, 10 |
| Keep cannon-only inspection accessors (D-10) | rewrite white-box tests | "existing tests migrate unchanged" | 5–6, 11 |
| Layer compaction + hooks overflow (D-12) | hooks always; limit to 16 layers | per-pair JS callbacks only when needed; keeps 32 Unity layers | 7 |
| No serialized-field change (D-14) | rename to KHR shapes | A9 format freeze, Unity naming decision; KHR is an interchange mapping | — |
| `Application.dispose` → `Physics._reset` (D-15) | leave as is | WASM memory is not collected; fixes a G5-like leak of gravity/defaults | 6 |

---
## Notes
- Hub/central files (`Physics.ts`, `Rigidbody.ts`, `Collider.ts`, `Joint.ts`, `PhysicsWorld.ts`) are
  touched by Phases 5, 6, 9, 10: strictly serial. Phases 7–8 touch only new backend files and may not
  overlap Phase 9's edits to `Physics.ts`: keep them serial too (one worker, one task).
- Full-gate reviews re-run, themselves: the pending-attach edge cases (Phase 6), the 18-layer test
  (Phase 7), the kinematic push and force-persistence tests (Phase 8), the player-smoke probe (Phase 9),
  and S1 through the engine (Phase 12).
- Measurements change with the build: record `BuildInfo.version` with every table (ENGINE-GAPS rule).
- Owner decisions in force: 2026-10-09 "works like Unity" (D-14); delegated Q-N3-1…3 (research).
---
## Decided During Build
_Filled by /code-foundations-build — one row per decision an agent made or question it raised:_
| # | Phase | Decision or question | Source | Status |
---
## Execution Log
_To be filled during /code-foundations-build_
