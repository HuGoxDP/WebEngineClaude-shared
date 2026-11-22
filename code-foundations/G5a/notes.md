# G5a — a production caller for `Physics._reset()`: physics state no longer outlives a scenario

Card: ROADMAP line 222 — *"`Physics._reset()` has no production caller (same leak class as G5):
call it from `Application.dispose()` so physics state cannot outlive a scenario in a reused
realm; test it"* (source cell: N3 research). Branch `G5a-physics-reset-on-dispose` in
`WebEngineTS` (+ `.claude-shared` for the notes). Base `8b1632e` (origin/master, SER1 landed).
Mirrors G5 (`6c25db9`, `code-foundations/G5/notes.md`) in approach, comment style and test shape.

## The gap

`Physics` is static state — `_colliders`, `_activeCollisions`, `_framePairs` — and so is the
`PhysicsWorld` singleton: gravity, `defaultFriction`/`defaultBounciness`, registered rigidbodies
and paired contact materials. `Physics._reset()` (`Physics.ts:450`) drops all of it and
forwards to `PhysicsWorld._reset()` (`PhysicsWorld.ts:141`), which nulls the singleton so the
next access recreates the world with the defaults (`EngineSettings.Physics.GRAVITY = -9.81`,
cannon default friction 0.3, restitution 0). N3 research recorded: `grep -rn
"Physics._reset\|PhysicsWorld._reset" src` → only `Physics.ts:454` (the forward itself);
re-verified on base. Bodies otherwise leave only through components' `onDisable`, and nothing
resets gravity/defaults or the leftover collision pairs. A host that reuses one page realm
started the next scenario on the old world: moon gravity, an icy house surface, stale Enter/Stay
pairs. The platform (fresh player frame per scenario) never saw it — same exposure as G5.

## The fix

`Application.dispose()` calls `Physics._reset()` in the static-module-reset block, immediately
after `Time._reset()` and before `TextureRelease._clear()` (`Application.ts`, +11 lines incl.
comment). `Physics` was already imported (`Application.ts:19`) for the loop's `Physics._step`.

### Teardown-order reasoning

- **After `unloadScenario()`** (first statement of dispose): scene destruction runs components'
  `onDisable`/`onDestroy`, which unregister colliders and remove their implicit cannon bodies
  from the world (`Collider.onDisable → Physics._unregisterCollider`,
  `_detachShape → PhysicsWorld.instance.world.removeBody`). Those must run against the *live*
  world; resetting first would recreate a world mid-teardown and leave the old one's bodies
  orphaned. `_reset` then clears whatever the unload path could not reach (registrations left
  by non-scenario objects, gravity/defaults, stale pairs).
- **After `stop()`**: the loop is off, so no `Physics._step` runs after the world is dropped.
- **Nothing below reads physics state**: `TextureRelease._clear`, `_backend.dispose`, the
  render/read hooks, the singleton clear — none touch `Physics`/`PhysicsWorld` (static trace
  over dispose's tail). Placement beside `Time._reset` matches the existing convention: each
  static module released at the "this Application is over" boundary, in loop-dependency order.
- Double dispose is safe: `PhysicsWorld._reset` guards on `_instance` being non-null;
  `Physics._reset`'s array/map clears are idempotent. Pinned by test 3.

Deliberately not done (same as G5): resetting on `unloadScenario()`; dispose is the boundary
the row names.

## The test — `tests/PhysicsResetOnDispose.test.ts` (3 tests, new file)

Same harness as `tests/TimeResetOnDispose.test.ts`: `FakeBackend` via
`Application.backendFactory`, window/document/rAF stubs, dynamic `await import` of
Application/Physics/PhysicsWorld, `afterEach` disposing `Application.current` plus
`Physics._reset()` for hygiene.

1. **gravity/defaults do not reach the next scenario** — set gravity (0,−1.62,0),
   defaultFriction 0.05, defaultBounciness 0.9; dispose; assert `PhysicsWorld.instance` is a
   *new* object and gravity is (0,−9.81,0), friction 0.3, bounciness 0.
2. **colliders and pairs do not survive** — a real `GameObject` + `BoxCollider` registers via
   `addComponent → _wakeComponent → onEnable → Physics._registerCollider` (same construction
   as `CollisionCallbacks.test.ts`); seed `_activeCollisions`/`_framePairs` as a last step
   would leave them; dispose; assert `_colliders.length === 0`, both maps empty, world
   replaced, and `Physics.checkSphere(boxPos, 2) === false` (the Unity-`CheckSphere` query a
   reused realm would have answered with the dead box).
3. **double dispose + fresh Application** — dispose twice (idempotent reset), construct a new
   Application in the same realm, assert default gravity and empty `_rigidbodies`.

### Failing-first reasoning (red on base)

Base `Application.dispose()` (8b1632e, `Application.ts` L720–775) contains **no** physics call:
the reset block reads `AudioManager._reset(); … EngineObject._clearPendingDestroys(); …
Time._reset(); … TextureRelease._clear();` — verified by `git show
8b1632e:src/engine/core/Application.ts | sed -n '720,760p' | grep -n
"Physics\|Time._reset\|TextureRelease"` → only `36: Time._reset();` and
`39: TextureRelease._clear();`, no `Physics` line. Without the new call: test 1 fails at
`expect(PhysicsWorld.instance).not.toBe(worldBefore)` (same singleton, gravity still −1.62);
test 2 fails at `expect(internals._colliders.length).toBe(0)` (registration survives); test 3
fails at `expect(Physics.gravity.y).toBeCloseTo(-9.81)` (still −3). All three assertions are
red on base by static trace; per slot rules the coder does not run the suite — the verifier
runs the gates.

## Files

- `src/engine/core/Application.ts` — +11 (comment + `Physics._reset();` after `Time._reset()`).
- `tests/PhysicsResetOnDispose.test.ts` — new, 183 lines.
- `CHANGELOG.md` — `[Unreleased] → Fixed`, one entry beside G5's (G5 commit style).

Engine commit `0efd6ad` `fix(engine): reset physics state on Application.dispose (G5a)` —
fix + test + changelog in one commit, exactly G5's shape (`6c25db9`). No existing test touched.
ROADMAP not ticked (Report step, per slot instructions).
