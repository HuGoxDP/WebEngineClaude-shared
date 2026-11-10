# M0.2g — a public read of one-per-object

Card: ROADMAP `M0.2g` — *"Public read of one-per-object (`_allowMultiple`) so the editor's Add
Component can hide or grey out `RectTransform`/`Transform` when the object already has one"*.
Repos: **E, Ed**. Branch `M0.2g-one-per-object-public-read` in both, plus `.claude-shared`.

## The gap

M0.2b (owner decision #14) put the one-per-object rule into `addComponent`: on an object that
already holds a live `RectTransform` or `Transform`, nothing is added or woken, a warning names the
object and the type, and the held component is returned. The rule lived behind
`Component._allowMultiple`, a `static readonly` marked `@internal`, and the family walk in
`GameObject._singleCopyFamily`/`_heldSingleCopy` is private. So a host UI that offers components had
to offer them all as addable: the editor's Add Component menu listed `RectTransform` next to an object
that already had one, and the click was a silent no-op with a `console.warn`.

## Design decision

Two public reads, each answering one half of the question, mirroring what `addComponent` does:

| API | Answers | Why it is needed |
|---|---|---|
| `Component.allowsMultiple` (static getter) | may a GameObject hold more than one of this type? | the type's side of the rule; `RectTransform`/`Transform` `false`, everything else `true`, inherited |
| `GameObject.hasComponent(type)` | does this object already hold one? | the object's side — **and `getComponent` cannot answer it**, because the `Transform` is never in `_components` (`GameObject`'s constructor creates it as part of the object), so `getComponent(Transform)` is `null` on every live object |

Kept deliberately out of the public surface: the family walk (`_singleCopyFamily`) and the "held"
lookup. `hasComponent` reuses the held lookup so the read and the refusal cannot drift — one rule,
read from two directions. `addComponent`'s own warn/refuse/return behaviour is untouched (its
existing 13 tests pass unmodified; the extracted `_singleCopyOf` is silent, the warning and the
throw stay in `_heldSingleCopy`).

`hasComponent` answers what `addComponent` would do, not what `getComponent` sees:

- a component destroyed with `destroyImmediate` is gone → `false`;
- a component destroyed with `destroy` still occupies its slot until the frame ends → `true`,
  because adding another is refused in that window;
- for a type that allows several it is the presence in the list, which is what `getComponent` sees;
- the `Transform` is always held while the object lives.

## Editor change

`inspector.component.ts`: `isHeld(entry)` = `ctor.allowsMultiple === false && go.hasComponent(ctor)`.
The Add Component list dims a held entry (`li.held`, `cursor: not-allowed`, `--fg-3`) with a title
keyed `insp.held` (en + uk), and `onAddComponent` refuses a held entry so no empty history step is
recorded. `Component` is Angular's decorator in that file, so the engine class is imported as
`type Component as EngineComponent`.

Bundled engine: the editor tracks its engine tarball (`app/WebEngineTS-0.1.0.tgz`, plus the
integrity line in `app/package-lock.json`), so it was repacked from this branch — build with
`WEBENGINE_BUILD_VERSION=0.1.0-local.1794331216980`, stamped only for `npm pack`, restored
immediately (the engine's `package.json` is not in the diff). The other consumers did **not** get the
new tarball: this change adds public surface and changes no existing behaviour, so ScenarioCreator
and virtual-lab have nothing to pick up.

## Tests

New `tests/OnePerObjectRead.test.ts` (8 tests):

1. `allowsMultiple` false for `RectTransform`/`Transform`, true for `UIImage`, `Script`, `Component`.
2. a subclass inherits its base's answer (`MyRect` false, `MyScript` true).
3. `hasComponent(Transform)` is true while `getComponent(Transform)` is `null` — the finding.
4. a single-copy component a sibling graphic added is found.
5. `destroyImmediate` → not held (and re-adding does not warn).
6. `destroy` → held until the frame ends, gone after the sweep.
7. a type that allows several is true when any is held.
8. the editor's whole test in one case: the read and the refusal agree — `isHeld` says blocked, and
   `addComponent` then adds nothing and warns exactly once.

`tests/OnePerObject.test.ts` (M0.2b's 13) pass unchanged — the extraction moved no behaviour, and
the warning text is byte-identical to before.

## Debug pass (whole suite, one run)

- Engine: `npm run typecheck` exit 0 (three tsconfigs) · `npx vitest run` 163 files / 2837 tests
  passed, 0 failed (162/2829 before + this file's 8) · `npm run build` exit 0.
- Editor: `npm ci` (app) · `npx ng build` exit 0 · `npm run e2e` (Chromium via `msedge`, Playwright
  borrowed from `W2/virtual-lab/e2e`, production build served at `127.0.0.1:8044`) — **all checks
  passed**, including "no page errors" per scenario. The bundle-budget warning (1.85 MB initial over
  the 1.00 MB budget) predates this change and is unchanged by it.
- No engine bug found; no existing test needed a change.
