# M0.2b: one-per-object enforced at `addComponent`

- **Branch:** `M0.2b-one-per-object` (WebEngineTS, .claude-shared). Engine base `c1bc2a5`.
- **Date:** 2026-11-10. Owner decision #14 (2026-11-07): yes, before A5.
- **Engine commit:** `807f6a1` feat(core): addComponent holds one RectTransform/Transform per object.

## The contract

`GameObject.addComponent(type)` where `type` (or a class above it) has
`Component._allowMultiple === false`, on an object that already holds a live one:

- adds nothing, constructs nothing, wakes nothing;
- `console.warn("[GameObject.addComponent] \"<name>\" already has a <Type>, and an object holds only one; …")`;
- **returns the held component.**

Details:

- The "family" is the topmost class in the chain with `_allowMultiple = false`; every subclass shares
  its one slot. Asking for the base when a subclass is held returns the subclass (type-correct).
  Asking for a subclass when a plain base is held **throws** — returning the base would lie about `T`.
  Unreachable today: nothing subclasses `RectTransform`.
- `Transform` now declares `_allowMultiple = false`; `addComponent(Transform)` returns `go.transform`.
  Before, it put a second `Transform` into `_components`. The load fold never sees `Transform`
  (it is written as `transform:` on the node, not in `components`), so the flag changes nothing there.
- A component destroyed with `destroyImmediate` is gone from the list and no longer counts; one
  destroyed with `destroy` counts until the frame ends (`exists()` is true until then) — Unity's
  `Destroy` + `AddComponent` in one frame fails the same way.
- Loads still go through `_attachComponent`, which does not check; the `_foldSingleCopies` /
  `_attachAll` fold is unchanged and still needed for files written by older engines.

## Why "return the existing one", not Unity's "null + error"

Unity: `AddComponent` of a `[DisallowMultipleComponent]` type (and of `Transform`) that the object
already holds logs an error and returns `null`. Weighed against the engine's callers:

| Caller | Pattern | Null + error | Return existing |
|---|---|---|---|
| Engine `UIBehaviour`/`LayoutGroup`/`RectMask2D.rectTransform` | `getComponent(RT) ?? addComponent(RT)` | safe (never reaches the add with one held) | safe |
| Tests: 66 `addComponent(RectTransform)` sites | `addComponent(RT).sizeDelta.set(…)`, `const rt = addComponent(RT)` | `T` would become `T \| null`: every site under `strict` needs `!` — an API break for nothing, all add the rect first | unchanged |
| ScenarioCreator `UIKit.place` (9 scenarios), `Plot.ts`, `Histogram.ts` | `const rt = go.addComponent(RectTransform); rt.anchorMin = …` before the UI component | type break, as above | unchanged (rect is always added first) |
| Editor `commands.service.ts` Add Component / Create | `target.addComponent(ctor as any)` inside `history.record`, result unused | no-op + console error | no-op + console warn |
| Code that adds a graphic first, then the rect (the M0.2 review's 11 pairs) | `addComponent(UIImage); addComponent(RT).sizeDelta.set(…)` | **TypeError at runtime** — code that worked (if wrongly) now crashes | **now does what it meant**: sizes the rect the graphic draws with |

Returning `null` would only add a crash path to the one pattern the task fixes and a type break to
every other caller; `addComponent` has no other null path in this engine. The divergence from Unity
is the return value only; the "nothing added, logged" part matches. Warn rather than error: the call
succeeds with a usable result, and it matches the load fold's `console.warn`.

## Consumer impact (read-only checks, main checkouts)

- **ScenarioCreator:** every `addComponent(RectTransform)` adds the rect before the UI component
  (`UIKit.place` then `addComponent(UIText|UIImage|Button|…)`; `Canvas` roots are not `place`d).
  No behaviour change, no warning.
- **WebEngineTSEditor:** the Add Component menu passes the registry's ctor. Adding RectTransform to
  an object that has one is now a recorded no-op with a console warning instead of a hidden
  second rect. Follow-up for the editor (not done here): grey out a one-per-object type the target
  already holds; `_allowMultiple` is `@internal`, so a public reader would be needed first.

## Tests

`tests/OnePerObject.test.ts` (13): the graphic's rect is returned; added twice → same; existing
values untouched; one warning naming object and type; none for the first add; a layout set through
the returned rect is the one drawn and saved, and reloads without a fold warning; re-add after
`destroyImmediate`; `Transform` returns `go.transform`; subclass-beside-base throws; base when a
subclass is held returns it; through `Component.addComponent`; types that allow several still add
and wake; a refused add re-wakes nothing. 8 failed before the change, all pass after.

## Debug pass (whole suite, one run)

`npm run typecheck` exit 0 · `npm test`: Test Files 158 passed | 1 skipped (159), Tests 2780 passed
| 9 skipped (2789), exit 0 · `npm run build` exit 0. The only failure met during the build was the
new test's own typecheck error (`awake`/`onEnable` declared `protected` over public bases), fixed in
the test before the commit. No engine bug found.

## For A5

A live object can no longer hold `RectTransform #k≥1`, so ids minted from live objects never address
one. Files from older engines still can: the M0.2 review's A5 notes 1–3 stand for them. Noted in
`tasks/A5-component-ids.md` (Read first).
