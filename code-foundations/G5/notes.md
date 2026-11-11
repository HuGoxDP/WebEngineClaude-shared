# G5 — a caller for `Time._reset()`: `timeScale` no longer leaks across scenarios

Card: ROADMAP `G5` — *"Engine: a caller for `Time._reset()` so `timeScale` does not leak"* (the
engine half of `ENGINE-GAPS.md` G5; the platform half is closed by player-isolation, 2bf3a12).
Branch `G5-time-reset-on-dispose` in `WebEngineTS` (+ `.claude-shared` for the row).

## The gap

`Time` is static state — `timeScale`, the deltas, `_time`, `_frameCount` — and `Time._reset()`
(`Time.ts`, sets `_timeScale = 1` and marks the class uninitialized) had **no caller**. A host that
reuses one page realm — opens a viewer, the student pauses (`Time.timeScale = 0`) or slows the
scenario, closes it, opens another — started the next scenario with the old scale: everything frozen
or half-speed, with no sign of why. `virtual-lab` never saw it (every scenario, restarts included,
runs in a fresh player frame); hosts that reuse a realm did.

## The fix

`Application.dispose()` calls `Time._reset()` beside the other module resets it already performs
(`Input._dispose`, `Touch._teardown`, `AudioManager._reset`,
`EngineObject._clearPendingDestroys`, `TextureRelease._clear`) — the dispose path is exactly the
"this Application is over" boundary where every other module's static state is released, and Time is
the one that was missing. The reset restores the scale, the deltas and the frame count, and marks
Time uninitialized so the next `_update` re-initializes cleanly.

Deliberately not done: resetting on `unloadScenario()` as well. Dispose is the documented boundary
(the gap names `Application.dispose()`); a scenario reload inside one live Application is the
scenario's own business, and Unity likewise keeps `timeScale` across a scene unload within one
player.

## Verification

`tests/TimeResetOnDispose.test.ts` (2 tests, behind the same DOM/FakeBackend harness the dispose
tests use):

1. a paused scenario's `timeScale` (0) and frame count do not reach the next one — after dispose,
   `timeScale` is 1 and `frameCount` 0;
2. a slowed scenario (0.25) with frames actually run does not carry its scale or frame count over.

Both assertions **fail without the change** (verified by stashing `Application.ts`). Engine checks:
`npm run typecheck` green; `npm test` **2876/2876 green** (171 files — 2874 plus these 2);
`npm run build` green. `CHANGELOG.md` `[Unreleased]` → Fixed.

`ENGINE-GAPS.md` row G5: the engine half is closed by this; its "still open for hosts that reuse
one realm" clause no longer applies.
