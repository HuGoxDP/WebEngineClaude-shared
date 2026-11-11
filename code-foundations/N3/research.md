# N3 — Rapier behind the physics API: research (Claude, 2026-11-11)

**Status:** confirmed by Claude (architect lane); the plan beside it (`plan.md`) is `ready`.
**Base:** WebEngineTS `master` `a020db6` (after A5, A7, E-G2a; none of them touched
`src/engine/physics/`, `Application.ts`'s fixed loop, `package.json`'s physics dependency or the size
script — re-checked with `git diff --stat 06aeaf5 a020db6` on those paths: empty).
Card: `tasks/E-growth.md` § N3. ROADMAP row N3 (M6, `🧠`).

## What N3 must achieve

cannon-es has had no release since 2022-08-12 (`npm view cannon-es time.modified`). The card asks for
a **spike first** — cannon-es vs `@dimforge/rapier3d-compat` (deterministic build) on physics-heavy
scenes: CPU ms per step, bundle size — and **only if Rapier wins**, a backend switch under
`Rigidbody`/`Collider`/`Joint` with the same public API. This research adds what the card left open:
the seam, the packaging and CSP, the switch-over criteria, how existing tests migrate unchanged, and
what happens to content that relies on cannon-specific behaviour.

## Facts checked against the code (`a020db6`)

| Fact | Where |
|---|---|
| Physics module = 13 files, 2,291 lines; cannon is imported directly by `PhysicsWorld`, `Physics`, `Rigidbody`, `Collider`, `BoxCollider`, `SphereCollider`, `CapsuleCollider`, `Joint`, `PhysicMaterial` (9 imports) | `src/engine/physics/*` |
| `PhysicsWorld` is a cannon `World` singleton: gravity, 6 GS solver iterations, SAP broadphase, `allowSleep` | `PhysicsWorld.ts:22-28`; settings `EngineSettings.ts:15` (`FIXED_TIMESTEP 1/50`), `:31` (`GRAVITY`), `:36` (`DEFAULT_SOLVER_ITERATIONS 6`) |
| Materials: one cannon `ContactMaterial` per *pair* of materials, average combine; a collider without a material falls to `defaultContactMaterial` (0.3) | `PhysicsWorld.ts:80-123`, `PhysicMaterial.ts:21`, `:90` |
| Step order: kinematic transform → body, `useGravity=false` as a counter-force, springs applied as forces, `world.step(dt)`, dynamic body → transform, collision dispatch | `Physics.ts:115-147` |
| Collision dispatch is engine-side: contact equations grouped per collider pair, Enter/Stay/Exit and trigger events synthesised from a pair set, delivered only to enabled scripts on active objects | `Physics.ts:151-252` |
| **Raycast, `overlapSphere`, `checkSphere` do not use cannon at all**: Three.js `Raycaster` over invisible proxy meshes, and `Collider._sqrDistanceToPoint` | `Physics.ts:299-426`, `BoxCollider.ts` `_sqrDistanceToPoint` |
| Fixed step: `PluginManager._onFixedUpdate` → `scene._fixedUpdate` → `scenario._onFixedUpdate` → `Physics._step(FIXED_TIMESTEP)` inside the accumulator loop (Unity order: FixedUpdate, then the physics step, then the callbacks) | `Application.ts:759-766` |
| `Rigidbody` builds its cannon `Body` in the constructor (exists before `onEnable`), adds it to the world in `onEnable`, removes it in `onDisable` | `Rigidbody.ts:61-65`, `:239-256` |
| `useGravity=false` = `-g·m` force before each step (cannon has no per-body gravity) | `Rigidbody.ts:288-298` |
| `ForceMode` mapped onto `applyForce`/`applyImpulse`/velocity add; cannon clears forces after each step | `Rigidbody.ts:166-183` |
| A collider without a `Rigidbody` makes an implicit static body; a later `Rigidbody` pulls existing colliders onto its body via `Rigidbody._onEnabled` | `Collider.ts:208-242`, `:197-201`, `:314-321` |
| Layer filter: 32 layers, group = `1<<layer`, mask = `LayerCollisionMatrix.maskFor(layer)`, written per **body** (last collider wins on a shared body) | `Collider.ts:281-290`, `LayerCollisionMatrix.ts:2` (`LAYER_COUNT = 32`) |
| `CapsuleCollider` simulates as a 12-segment **cylinder**, while its raycast proxy is a true `CapsuleGeometry` | `CapsuleCollider.ts:104-112`, `:131-135` |
| Joints: `FixedJoint` = `LockConstraint`, `HingeJoint` = `HingeConstraint` with B's pivot/axis derived from A's, `SpringJoint` = `CANNON.Spring` force applied by `SpringJoint._applyAll` before each step | `Joint.ts:175-183`, `:213-230`, `:320-355` |
| `Physics._reset()` has **no production caller** — only tests. Gravity, default friction and the world persist across scenarios in one realm (a G5-like leak); bodies leave only through components' `onDisable` | `grep -rn "Physics._reset\|PhysicsWorld._reset" src` → only `Physics.ts:454` |
| The editor drives its own loop and calls `Physics._step(fixedStep)` from the **editor page** | `WebEngineTSEditor/app/src/app/services/play-mode.service.ts:99` |
| `cannon-es` is bundled in every build (not external; only `three` is external) | `rollup.config.mjs:81-84` |
| Bundle budgets: standalone 450,000 B gzip-9 (measured today **393,125**), player-host 8,000, player 4,000 | `scripts/lib/bundle-checks.mjs` `BUDGETS`; `gzip -9c dist/WebEngineTS.standalone.js \| wc -c` |
| cannon-es's own cost in the bundle: 36,471 B gzip-9 (terser `-c -m` of `cannon-es.js`) | measured |
| `@dimforge/rapier3d-compat@0.12.0` is already in `node_modules` — only as a dependency of `@types/three` (types), never imported | `npm ls @dimforge/rapier3d-compat` |
| Player frame CSP: `script-src <origin> blob: 'unsafe-eval'` (`'unsafe-eval'` implies `'wasm-unsafe-eval'`) | `src/player/static/player.nginx.conf:25`, `design/player-sandbox.md` §5 |
| Platform page CSP has no eval token (the engine never runs there); the editor's `/editor/` CSP has **no `'wasm-unsafe-eval'`** ("Not granted until something uses it") | `virtual-lab/nginx/csp.conf:44`, `virtual-lab/nginx/csp-editor.conf:13-15` |
| N1 (⬜) plans to cut the player's `'unsafe-eval'` to `'wasm-unsafe-eval'` | `tasks/E-growth.md` N1 |
| The player derives everything from `engineUrl`; the transcoder is the only other path the host passes | `src/player/protocol.ts:106`, `PlayerHost.ts:76`, `:157` |

### Tests that touch physics (vitest, `tests/`)

| Kind | Files (tests) | Touch cannon internals? |
|---|---|---|
| Behaviour through the public API | `CollisionCallbacks` (12), `OverlapSphere` (13), `RaycastTruth` (11), `RigidbodyGravity` (6, one comment), `SpringJoint` (11; 1 assertion on `world.constraints`), plus physics components inside `Serialization` (155), `FormatVersions`, `AssetFiles`, `MissingComponent`, `PrefabComponentIds`, `ModuleHookInstallation` | no (or one line) |
| White-box on cannon | `Physics` (37 tests; raw `CANNON.Body`s, `world`, `_cannonMaterial`), `RigidbodyMaterial` (`getContactMaterial`, `contactmaterials`), `PhysicMaterial` (same), `HingeJointGeometry` (`_constraint` as `CANNON.HingeConstraint`, `_body.position`), `ColliderCenter` (`_getBody().shapeOffsets`), `RestoreOrder` (`_body.shapes`, `_getBody() === rb._body`) | yes |

## Production content and physics

The ten ScenarioCreator scenarios use physics **only for picking**: `SphereCollider` added in script
plus `Physics.raycast` (`AtomStructure/scripts/helpers/AtomBuilder.ts:193`, `Scenario.ts:135`; `DNA`
`HelixBuilder.ts:238`, `Scenario.ts:323`; `Molecules` `MoleculeBuilder.ts:80`, `Scenario.ts:146`).
**No scenario has a `Rigidbody`, a `Joint` or a `PhysicMaterial`** (grep over `Scenarios/**/*.ts` and
`*.json`). Mechanics, GasTheory and Kepler simulate in their own scripts.

Consequences: (1) no shipped scenario depends on cannon-specific dynamics, so a backend change cannot
break a lesson that exists today; (2) raycast-only content must not be made to download a physics
WASM it never uses — raycasts already work without any physics engine.

## Rapier facts (measured from the npm tarballs, 2026-11-11; nothing executed)

Versions: `@dimforge/rapier3d*` 0.19.3 (2025-11-05), 0.20.0 (2026-08-08), **0.21.0 (2026-09-25,
latest)**. Variants: plain (wasm-bindgen ESM that `import`s the `.wasm` — needs a bundler wasm
plugin), `-compat` (WASM inlined as base64, `await RAPIER.init()`), `-deterministic` /
`-deterministic-compat` (cross-platform bit-identical, no SIMD), `-simd-compat`.

| Artifact | raw | gzip-9 | brotli |
|---|---|---|---|
| `rapier3d` 0.19.3 `.wasm` | 1,570,176 | 586,311 | 429,605 |
| `rapier3d` 0.20.0 `.wasm` | 2,021,200 | 765,814 | 558,066 |
| `rapier3d` 0.21.0 `.wasm` | 3,082,103 | 1,168,722 | — |
| `rapier3d-deterministic` 0.21.0 `.wasm` | 3,105,893 | 1,179,524 | 855,167 |
| `rapier3d-compat` 0.19.3 `rapier.mjs` (WASM inlined) | 2,238,719 | 829,793 | 614,287 |
| `rapier3d-compat` 0.21.0 `dist/rapier.mjs` | 4,340,292 | 1,652,936 | — |
| `rapier3d-deterministic-compat` 0.21.0 `dist/rapier.mjs` | 4,372,012 | 1,659,546 | — |
| cannon-es 0.20.0, minified (for comparison) | — | 36,471 | — |

0.21 doubled the WASM (soft bodies, `RawSoftBody*` exports). The deterministic flavour costs ~1% in
size. The base64 inlining of `-compat` costs ~40% more gzip than the bare `.wasm`.

API facts that shape the seam (0.21 `.d.ts`; the spike re-confirms them on the pinned version):

- `await init()` before anything — **initialisation is asynchronous**; cannon is synchronous.
- Bodies and colliders are created **in a world** (`world.createRigidBody(desc)`,
  `world.createCollider(desc, body)`), not standalone as in cannon; handles die with `world.free()`
  (WASM memory is not garbage-collected).
- `InteractionGroups` is **16 membership bits + 16 filter bits** (`geometry/interaction_groups.d.ts`) —
  the engine has 32 layers. `PhysicsHooks.filterContactPair/filterIntersectionPair` exist for
  arbitrary JS filtering (a JS call per candidate pair; only for colliders with `ActiveHooks`).
- Events: `EventQueue.drainCollisionEvents(h1, h2, started)` — start/stop only, no "stay";
  contact points per pair via the narrow phase. Colliders need `ActiveEvents.COLLISION_EVENTS`.
- `ActiveCollisionTypes.DEFAULT` = dynamic–dynamic, dynamic–kinematic, dynamic–fixed;
  `KINEMATIC_FIXED` etc. are opt-in per collider.
- Per-body `setGravityScale` (replaces the counter-force), `setEnabledTranslations/Rotations` (axis
  locks), `setLinearDamping/AngularDamping`, `sleep/wakeUp/isSleeping`,
  `setNextKinematicTranslation/Rotation` (kinematic bodies get a velocity and push correctly).
- User forces (`addForce`, `addTorque`, `addForceAtPoint`) **persist until `resetForces`** (Rapier user
  guide, "forces and impulses"); impulses are instant. Unity and the engine clear forces every step.
- Shapes: `ball`, `cuboid`, true `capsule(halfHeight, radius)`, `trimesh`, `convexHull`.
- Materials per collider: `setFriction`, `setRestitution`, `setFrictionCombineRule` /
  restitution rule (`Average`=0 default, `Min`, `Multiply`, `Max`) — the same four rules Unity has.
- Mass: per collider `setDensity`/`setMass` (inertia computed from the shape) or body
  `setAdditionalMass`.
- Joints: `JointData.fixed`, `revolute`, `spherical`, `prismatic`, `rope`, **`spring(rest, stiffness,
  damping, a1, a2)`**, `generic`; `createImpulseJoint(data, b1, b2, wakeUp)`.
- `world.timestep`, `world.numSolverIterations`, `world.castRay`, `intersectionsWithShape`.

## CSP and loading

- Instantiating WASM from bytes needs `'wasm-unsafe-eval'` (or `'unsafe-eval'`, which implies it).
  Supported by Chrome 97+, Firefox 102+, Safari 16+
  ([WebAssembly CSP proposal](https://github.com/WebAssembly/content-security-policy/blob/main/proposals/CSP.md),
  [MCP ext-apps #605](https://github.com/modelcontextprotocol/ext-apps/issues/605)).
- Player frame: works today (`'unsafe-eval'`) and after N1 (`'wasm-unsafe-eval'`). The `-compat`
  build needs no extra fetch, so `connect-src` is unaffected; loading it as a separate module from the
  engine's origin needs the same `Access-Control-Allow-Origin` the engine bundle already gets
  (`design/player-sandbox.md`, ablation "-ACAO:engine bundle").
- Editor page: **fails** today — `csp-editor.conf` has no `'wasm-unsafe-eval'`, and the editor steps
  physics in its own page. Rapier in the editor's Play needs a one-token change in virtual-lab
  (a follow-up row, not engine work).
- Platform page: unaffected (the engine never runs there).
- No cross-origin isolation is needed: the single-threaded build uses no `SharedArrayBuffer` (the
  card's reason to avoid Jolt's multithreaded build does not apply).

## Unity semantics the engine mirrors (and where cannon misses them)

| Unity (PhysX) | cannon today | Rapier |
|---|---|---|
| Capsule is a capsule | 12-segment cylinder (rolls and rests differently, flat caps) | true capsule |
| Kinematic body moved in FixedUpdate pushes dynamics by its velocity | teleported (`position.set`), zero velocity: weak, tunnel-prone pushes | `setNextKinematic*` gives velocity |
| Collider without material = default material, **averaged** with the other side | `defaultContactMaterial` replaces the pair (no average) | per-collider friction + `Average` rule = Unity |
| Forces cleared after each step | cleared | persist → adapter must `resetForces` after each step |
| 32 layers, matrix per collider | per body, last collider wins | 16+16 bits per collider → needs compaction |
| Collision events need a non-kinematic Rigidbody on one side; triggers need any Rigidbody | cannon rules (spike records them) | `DEFAULT` types; sensors opt into `KINEMATIC_*` |
| Stay every step while touching | synthesised from contact list | synthesised from start/stop + pair set |
| Default solver: 6 position iterations | 6 GS iterations | `numSolverIterations` (default 4) → set from `EngineSettings` |
| Determinism: same machine, same build | JS doubles — same engine build + browser only | deterministic flavour: cross-platform bit-identical |

## Decisions (made here; the card left them open)

- **D-1 Spike gates everything.** Phases 1–3 measure cannon vs Rapier on raw libraries (no engine
  seam yet) and end with a written go/no-go against the criteria in D-9. No-go → the seam is not
  built; N3 ends with the spike report and the ROADMAP row says why.
- **D-2 Spike scenes** (in the engine repo, `scripts/physics-bench/`, re-runnable, so switch-over is
  re-measured through the engine later): **S1 pile** — 400 dynamic boxes and 100 spheres dropped into
  a static open box (broadphase + many resting contacts; the Mechanics-lab case); **S2 gas** — 300
  spheres, restitution 1, friction 0, no gravity, in a closed box, with 4 trigger volumes (the
  GasTheory case: many short contacts + trigger churn); **S3 rig** — 20-link hinge chain + 10 spring
  pairs (joints; correctness only, small). The card's "benchmark harness" is the
  WebEngineTS-Benchmarks repo, which is not in this workspace; the engine-side harness is what the
  workers can run and keep, and its CSV columns follow `Benchmark.ts`'s `FrameTimeStats`.
- **D-3 Correctness checks** (both backends, raw library calls at dt=1/50): free fall vs ½gt² (≤1% at
  2 s); 5-box stack rests (drift ≤1 cm over 10 s); restitution 0.5 bounce ratio ≈ e² (±10%); friction
  μ=0.5 block holds on a 20° incline and slides on 35°; pendulum period vs 2π√(L/g) (±3%); spring
  period vs 2π√(m/k) (±5%); trigger enter/exit counts on S2's volumes; a layer-ignored pair never
  contacts; capsule resting on its side stays put (cannon's cylinder is expected to fail — recorded,
  not fixed); `useGravity=false` body hovers; forces cleared after one step (verifies Rapier's
  persistence + `resetForces`).
- **D-4 Versions.** Pin an **exact** version (as three is pinned). Spike measures 0.19.3 and 0.21.0,
  each in the plain and deterministic flavours. Choose the smallest version that passes D-3 and D-9
  unless a needed fix exists only later (record it). The deterministic flavour is the default if its
  S1/S2 median step is within 20% of the non-deterministic one (same-result-on-every-device helps CI
  and graded experiments; its size cost is ~1%).
- **D-5 The seam — engine-side state is the source of truth.** Components keep every serialized and
  public value in engine fields (`mass`, `drag`, `isKinematic`, `size`, `friction`, …) and push them to
  an opaque backend handle when one exists. A new internal interface `PhysicsBackend`
  (`src/engine/physics/backend/PhysicsBackend.ts`) speaks only plain numbers, engine enums and opaque
  handles — no cannon or Rapier type crosses it, and nothing in `src/engine/core` imports a backend.
  Calls: world create/free/step, gravity, solver iterations; body create/remove, type
  (dynamic/kinematic/static), mass, damping, axis locks, gravity scale, pose read/write (into
  caller-owned scratch arrays — zero allocation per step), velocity, forces/impulses/torque, sleep;
  collider add/remove/update (box/sphere/capsule, offset, trigger, friction, bounciness, layer
  bits); joint add/remove (fixed, hinge, spring); `drainContacts(visit)` delivering *(colliderId,
  colliderId, contact points, relative velocity)* per touching pair after a step. Dispatch,
  Enter/Stay/Exit, raycasts and overlap queries stay in `Physics.ts`, engine-side and
  backend-independent.
- **D-6 Raycasts stay on the Three.js proxies.** They are backend-independent today, synchronous, need
  no WASM, and are the only physics the shipped scenarios use. Rapier's capsule makes the simulation
  agree with the existing `CapsuleGeometry` proxy, which cannon never did.
- **D-7 Packaging: Rapier never enters the standalone bundle.** A separate engine-free file
  `dist/WebEngineTS.rapier.js` (own rollup entry: the `-compat` build plus the `RapierBackend`
  adapter, exporting one `createBackend(): Promise<PhysicsBackend>`), loaded by dynamic `import()`
  from `Physics.rapierModuleUrl`, default `new URL("./WebEngineTS.rapier.js", import.meta.url)` —
  next to whichever engine file is running, so the player needs no protocol change. ESM/CJS npm
  consumers get the same file through a package export and their bundler. The standalone budget
  (450,000) is untouched; the new file gets its own budget in `bundle-checks.mjs`, set at the
  measured size + 5%. The `-compat` (inlined) flavour is chosen over a bare `.wasm` because it needs
  no `application/wasm` MIME, no bundler wasm plugin and no second fetch; its ~40% gzip premium is
  measured in the spike and revisited only if D-9's size criterion fails.
- **D-8 Selection and loading.** `Physics.backend` is chosen before the first physics component is
  enabled: host option (`PlayerHost` / `loadScenario*` option `physicsBackend`) > scenario manifest
  field > `EngineSettings.Physics.BACKEND`. `await Physics.useBackend(kind)` loads and initialises;
  the scenario loader awaits it before building scenes. The **Rapier world is created lazily**: static
  colliders alone never need it (raycasts do not use it, and static–static pairs report nothing in
  Unity); the first `Rigidbody` or `Joint` enabled in play mode starts the load if the scenario did
  not preload, components stay *pending* (engine state intact, no handle) and attach in order when it
  is ready, and `_step` simulates nothing until then, with one `console.warn` naming the manifest
  field. So raycast-only content never downloads Rapier, and content with dynamics declares it to
  avoid the first-frames stall. cannon stays synchronous and eager, exactly as today. In edit mode (C2)
  nothing triggers a load (physics never steps there).
- **D-9 Go and switch-over criteria.** *Go after the spike* (all): Rapier passes every D-3 check cannon
  passes; Rapier's median step is ≤ 0.6× cannon's on S1 **and** S2 in Chromium, sync of all bodies
  included; the chosen Rapier file is ≤ 900,000 B gzip-9; Rapier initialises in the player frame under
  today's policy and under `'wasm-unsafe-eval'` alone. *Switch the default to Rapier* (after the seam,
  re-measured **through the engine**) when, additionally: the unchanged behavioural tests are green on
  both backends; S1/S2 through the engine keep ≤ 0.7× cannon; first-step latency after
  `useBackend('rapier')` (init + compile) ≤ 300 ms median in Chromium on the dev machine.
- **D-10 Existing tests migrate unchanged.** The cannon backend keeps the names the white-box tests
  read — `PhysicsWorld.instance.world` (the cannon `World`), `Rigidbody._body`,
  `Collider._getBody()`, `PhysicMaterial._cannonMaterial`, `Joint._constraint` — as `@internal`
  inspection accessors that are valid only while the cannon backend is active (they throw a named
  error under Rapier). Every existing test file runs unchanged against cannon. A second vitest project
  (`vitest.workspace` / `projects`) runs the **behavioural** files unchanged against Rapier through a
  setup file that awaits `Physics.useBackend("rapier")`; the white-box files are excluded there by an
  explicit list, and Rapier gets its own white-box tests. A behavioural test that fails only on
  Rapier is a parity bug, fixed in the adapter, never by editing the test; if the test encodes a
  cannon artefact that contradicts Unity, it stays unchanged on cannon and the Rapier project lists it
  in a reviewed `cannonOnly` list with the reason (Full-gate review checks each entry).
- **D-11 Cannon-specific behaviour.** No shipped scenario has dynamics, so nothing breaks today. The
  differences (capsule shape, kinematic pushes, material-less friction averaging, per-collider layers,
  contact-point positions, callback order within a step, sleep timing) are listed in
  `WebEngineTS/design/physics-backends.md` and the CHANGELOG *Changed* entry of the switch-over, with
  the parity table. Content that needs the old behaviour selects `"cannon"` explicitly for one
  release; removing cannon is a follow-up row after that release.
- **D-12 Layers.** Map the distinct layers in use to Rapier's 16 group bits (slot allocator, rebuilt
  when a layer appears or the matrix changes); if more than 16 distinct layers are live, the colliders
  on unmapped layers get `ActiveHooks.FILTER_CONTACT_PAIRS` and a JS `filterContactPair` applies the
  32-layer matrix. Per-collider filtering is Unity's rule; cannon's per-body "last collider wins" is a
  documented cannon artefact.
- **D-13 Mass.** `Rigidbody.mass` is the total; the adapter distributes it over the body's colliders
  in proportion to their volumes (`ColliderDesc.setMass`) so inertia comes from the shapes, as Unity
  computes it. A Rigidbody with no collider gets `setAdditionalMass(mass)` with a unit-sphere inertia.
- **D-14 Serialized fields do not change.** The card says "shaped after `KHR_physics_rigid_bodies` /
  `KHR_collision_shapes`". The drafts' fields (`motion.mass`, `isKinematic`, `gravityFactor`,
  `centerOfMass`, `inertiaDiagonal`; materials `staticFriction`, `dynamicFriction`, `restitution`,
  `frictionCombine`/`restitutionCombine`; `collisionFilters` by named systems; joints as `limits` +
  `drives`) ([KHR_physics_rigid_bodies](https://github.com/eoineoineoin/glTF_Physics/blob/master/extensions/2.0/Khronos/KHR_physics_rigid_bodies/README.md))
  are a glTF interchange shape. The engine's serialized names are Unity's (owner decision 2026-10-09,
  "works like Unity"), and A9 freezes the version-2 format. So N3 keeps every serialized field as it
  is; the backend interface already carries what KHR needs (gravity scale, combine rules), and a
  KHR import/export mapping is a follow-up row on the glTF path. No format change inside N3.
- **D-15 World lifecycle.** `Application.dispose()` calls `Physics._reset()` (frees the Rapier world —
  WASM memory is not collected — and resets gravity/defaults; today nothing does). The loaded Rapier
  *module* stays cached for the realm.
- **D-16 Step semantics through the seam:** kinematic → `setNextKinematic*`; `useGravity=false` →
  gravity scale 0 (cannon backend keeps its counter-force); springs → native joints on Rapier
  (cannon keeps `Spring` forces); after `step` the Rapier adapter calls `resetForces`/`resetTorques` on
  every dynamic body; solver iterations from `EngineSettings.Physics.DEFAULT_SOLVER_ITERATIONS`.

## Owner questions (delegated: decided by recommendation, recorded by the plan's last phase)

- **Q-N3-1 — a new shipped file with its own size budget.** Rapier adds a ~0.6–0.9 MB (gzip) file that
  only scenarios with dynamics download; the standalone budget does not change. *Recommendation:*
  accept, budget = measured + 5%, re-decided only if a later Rapier version grows it past 900,000 B.
- **Q-N3-2 — default backend after switch-over.** *Recommendation:* Rapier becomes the default only
  when D-9's switch-over criteria hold through the engine; cannon stays selectable for one release,
  then is removed (follow-up row).
- **Q-N3-3 — editor CSP.** The editor's Play steps physics in the editor page. *Recommendation:* add
  `'wasm-unsafe-eval'` to `csp-editor.conf` (the file already names it as the expected next
  loosening) in a virtual-lab follow-up row; the platform and player CSPs need nothing.

## Risks

- **Async init vs a synchronous component model.** Handled by D-8's pending attach; the Full-gate
  review must try: Rigidbody enabled before the module resolves, disabled before it resolves,
  destroyed before it resolves, collider added to a pending body, scenario disposed mid-load.
- **WASM handle lifetime.** A handle used after `world.free()` corrupts or throws. Every handle is
  owned by exactly one component and cleared in `_reset`; tests double-reset and re-use.
- **Per-step WASM boundary cost.** Reading 500 poses one call at a time can eat the solver's win; the
  spike measures sync separately and the adapter reads into reused scratch.
- **Hub/central files.** `Physics.ts`, `Rigidbody.ts`, `Collider.ts`, `Joint.ts` are touched by several
  phases — those phases run strictly in order.
- **C2 interplay.** C2 (`📐`, not merged at `a020db6`) adds edit mode; D-8's "no load in edit mode"
  uses its `_isEditMode()` if C2 has merged when Phase 9 starts, otherwise the guard is left out and a
  follow-up row added.
