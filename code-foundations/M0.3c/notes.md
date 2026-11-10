# M0.3c — debug hard stop on destruction

Owner decision #15 (2026-11-07): yes. Default mode (`isolateCallbackErrors = true`) unchanged.

## Behaviour with `isolateCallbackErrors = false`
`GameObject.onDestroy` keeps its order (components, children, scene unregister, Transform) and
remembers the first error (a component's, or a child's destruction). After the Transform is gone it
rethrows that one; every later error is logged (the first is not logged twice).

| Path | Where the error surfaces |
|---|---|
| `destroyImmediate` | thrown to the caller, object fully destroyed |
| `destroy()` (microtask) | unhandled error from the microtask — acceptable for a debug hard stop; nobody can catch it, and the destruction is already complete |
| `destroy(delay)` (`_updatePendingDestroys`) | every due object destroyed first, then the first error leaves the frame loop (same place a throwing `update` surfaces in hard stop) |
| `Scene.destroy` / `SceneManager.loadScene` / `unloadScene` | roots all destroyed, scene/registry cleaned, scene removed and events fired, then rethrown |

`EngineObject._hardStopProbe` is installed by `ScriptableBehaviour` (EngineObject cannot import it).

## Tests
`tests/DestroyHardStop.test.ts` (8): immediate, child-only error, logging of the rest, default mode,
microtask (uncaughtException), timed, default timed, unloadScene.

## Debug pass
typecheck, full `npm test` (158 files passed, 2775 tests, 9 skipped), `npm run build` — all green on the first run; no further bug found.
