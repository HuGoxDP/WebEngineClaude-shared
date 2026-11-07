# M0.3e — ScriptableBehaviour._guard closure per callback

## Measurement
Probe: 3410 `ScriptableBehaviour`s with empty Update/LateUpdate/FixedUpdate on the active scene, one frame =
`_fixedUpdate + _update + _lateUpdate` (10 230 callbacks), `gc()` before each sample, `heapUsed` delta, 5 samples.

| Mode | Before | After |
|---|---|---|
| Default (TurboFan warm, 300 warm-up frames) | ~3.7 KB / 5 frames (= the probe's own noise, same at 0 frames) | same |
| Optimizing compilers off (`--no-opt --no-maglev`) | 2.30 MB / frame (~224 B / callback) | 1.31 MB / frame (~128 B / callback) |

- The ~2.8 MB / 4500 frames from M0.3a does not reproduce as a steady figure: with a hot JIT, V8 escape analysis
  removes the closure, so there is no measurable growth before or after. The closure is real only in cold code
  (first frames, deopts, non-optimizing tiers), where it costs ~96 B per callback. The 2.8 MB was most likely
  scavenger noise plus those cold frames.
- The remaining ~128 B / callback in the interpreter is not the guard (the scene walk / interpreter temporaries);
  not pursued.

## Change
`WebEngineTS/src/engine/core/ScriptableBehaviour.ts` only. `_guard(phase, body)` removed. `_systemUpdate`,
`_systemLateUpdate`, `_systemFixedUpdate` each: `isolateCallbackErrors` off -> call `_runX()` directly; on -> `try { _runX();
_consecutiveFailures = 0 } catch (e) { _onCallbackError("x", e) }`. The bodies moved verbatim into `_runUpdate/
_runLateUpdate/_runFixedUpdate`; the log text, `callbackFailureLimit` disabling and ordering are unchanged.
No call sites outside the class changed.

## Tests
`tests/ScriptableBehaviourAllocation.test.ts` (new): turns optimizers off through runtime V8 flags, asserts < 170 B per
callback; fails on the old code (224 B), passes on the new. The isolation behaviour itself (logging, object name,
failure limit, `isolateCallbackErrors = false`) stays pinned by the existing `tests/CallbackIsolation.test.ts`
(unchanged, passes).

## Follow-up
The test depends on V8 honouring `--no-opt` at runtime; if a future Node ignores it the test would pass vacuously
(never fail falsely).
