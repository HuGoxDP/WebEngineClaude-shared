# M0.3f — doc fix to my own M0.3b

Card: ROADMAP `M0.3f` — *"Doc fix from Claude's review of M0.3b: `EngineObject.Destroy` says a
zero-delay destroy 'no longer happens at all while the loop is stopped', but the microtask fallback
does destroy it with no loop (pinned by `DestroyBeforeRender.test.ts` 'still destroys its object when
no loop is running'); make the comment say what the code and the test do"*.
Branch `M0.3f-destroy-doc-fix` (WebEngineTS + `.claude-shared`).

The review is right, and it found two wrong clauses, not one.

## What the code actually does

`EngineObject.Destroy(obj)` with no delay pushes `{ obj, remaining: 0 }` onto the pending list **and**
schedules `queueMicrotask(() => _updatePendingDestroys(0))`. The sweep is due at
`remaining - deltaTime <= 0`, so:

| Situation | Old doc claimed | What happens |
|---|---|---|
| No loop running at all (a load's `awake`, a host's dispose, a test) | "nothing fires" | the microtask drains it (pinned: *still destroys its object when no loop is running*) |
| Loop running, `Time.timeScale = 0` (paused) | "postponed" | deltaTime is 0, `0 - 0 <= 0` → **due**: it dies on the next frame. A zero delay has no countdown to postpone. |
| Loop running, normal | nothing wrong | dies after LateUpdate, before render (M0.3b) |
| Positive delay, any of the above | as documented | the countdown obeys `Time.deltaTime`, so a pause postpones it and a stopped loop never runs it |

## The fix

- The JSDoc's paragraph now says the zero delay dies on the first frame that runs — including one from
  a paused game — and, with no loop, from the microtask that stands in for a frame, citing the pinning
  test by name.
- The inline comment in `Destroy` carries the same distinction and states the arithmetic (`0 - 0`).
- New test in `tests/DestroyBeforeRender.test.ts`: **dies on the next frame even while the game is
  paused** — `Destroy(now, 0)` and `Destroy(later, 1)`, one `_updatePendingDestroys(0)` sweep, `now`
  gone and `later` still alive. That is the claim the comment now makes, so the comment says what the
  code and the tests do.
- CHANGELOG under *Documentation*: the M0.3b entry's wording is corrected, with the pinned cases
  named.

No behaviour, API or test-shape change; this is the paragraph and one test.

## Checks (one run)

`npm run typecheck` exit 0 · `npx vitest run` 164 files / 2842 tests passed (2841 + the new case),
0 failed · `npm run build` exit 0.
