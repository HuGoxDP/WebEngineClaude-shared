# N5 — Accessibility: hidden DOM twin of the Canvas UI — research (Claude, 2026-11-11)

**Status:** confirmed by Claude (architect lane); the plan beside it (`plan.md`) is `ready`.
**Base:** WebEngineTS `master` `a020db6` (after E-G2a). Card: `tasks/E-growth.md` § N5. ROADMAP row N5 (`🧠`).
Re-read every citation below against that commit before building on it — line numbers drift.

## What N5 must achieve

A scenario's Canvas UI is pixels on a 2D `<canvas>` over the WebGL canvas: a screen reader sees nothing,
a keyboard user gets a partial experience. N5 makes the Canvas UI perceivable and operable by assistive
technology (AT) and the keyboard, inside the sandboxed player, with no cost to a frame where nothing
changed. Procurement drivers: EN 301 549 (DSTU EN 301 549) → WCAG 2.1/2.2 AA; ADA Title II deadlines
2027–2028.

## Facts checked against the code (a020db6)

| Fact | Where |
|---|---|
| Focus is one static slot `EventSystem._selected`; `_setSelected` assigns, then `previous._onFocusLost()`, `control._onFocusGained()` | `ui/EventSystem.ts:216` |
| Controls register on enable, unregister on disable/destroy (`_selectables: Set`, insertion order) | `EventSystem.ts:194`, `Selectable.ts:302-332` |
| Keyboard: `_processKeyboard` polls `Input.getKeyDown`: Tab → `_focusNext` (registration order, wraps, **no Shift+Tab**), Escape → clears focus, `_consumesKeyboard` stops the rest, Enter/NumpadEnter/Space → `_submit()`, arrows → `navigate()` | `EventSystem.ts:383-426` |
| `Input` listens to `keydown`/`keyup` on **window** (global), never calls `preventDefault`, never looks at `event.target` | `core/Input.ts:155-233` |
| Mouse is listened to on the WebGL canvas only; every UI overlay canvas has `pointer-events: none` | `Input.ts:239`, `Canvas.ts:575` |
| Loop order: UITween → layout → ScrollRect → `Canvas._updateTransforms` → `EventSystem._update` → `Selectable._updateAll` → 3D render → `Canvas._renderAll` | `Application.ts:816-859` |
| Pressing a control selects it (`onPointerDown` → `select()`) | `Selectable.ts:143` |
| **Only Button reacts to submit** (`onSubmit` → `onClick`). Toggle, Slider, Scrollbar, Dropdown have no keyboard operation at all: Enter on a Toggle does nothing, arrows on a Slider move focus away | `Button.ts:111`, `Toggle.ts:88`, `Slider.ts:93`, `Scrollbar.ts:90`, `Dropdown.ts:114` |
| **No focus indicator on Button**: `state` never returns `Selected` (Disabled/Pressed/Highlighted/Normal only), and Button paints from `_stateColor()`; other controls default to `SelectableTransition.None` | `Selectable.ts:162`, `Button.ts:118-160` |
| Escape always clears focus; an open Dropdown only closes as a side effect of focus loss | `EventSystem.ts:392`, `Dropdown.ts:270` |
| Precedent for a hidden DOM element over a UI element: `InputField` creates an `opacity:0`, `pointer-events:none`, `position:fixed` `<input>` on focus, positioned from `rectTransform._resolvedBounds × canvas.scaleFactor + canvas._surfaceLeft/_surfaceTop`, removes it on blur | `InputField.ts:500-600` |
| That precedent ignores world-space placement (it uses `scaleFactor`, not `canvasToScreenPoint`) — the twin must use `canvasToScreenPoint` | `InputField.ts:589`, `Canvas.ts:678-697` |
| Canvas surface position is cached (`_cssLeft/_cssTop/_cssWidth/_cssHeight`), re-measured only on resize/scroll/500 ms backstop — reading the cache costs no layout | `Canvas.ts:72-80`, `:735-800`, `:897-912` |
| Per-canvas graphics list sorted by `sortingOrder`, then `_hierarchyIndex` | `Canvas.ts:704`, `:939-941`, `:1191` |
| Version-counter precedent for "structure changed": `CanvasGroup._structureVersion` | `CanvasGroup.ts:43-52` |
| Player: `PlayerRuntime` listens to `keydown` on window (capture) and makes **Space toggle pause** unless the target is an editable element — Space on a focused engine Button today both clicks it and pauses the scenario (bug independent of N5) | `player/PlayerRuntime.ts:25`, `:74-77`, `:283-287` |
| Player frame gets `sandbox` + `allow`, **no `title`**; `player.html` has `<title>WebEngineTS player</title>` and no `lang` | `player/host/PlayerHost.ts:277-283`, `player/static/player.html` |
| Player CSP: `default-src 'none'` (so no `style-src`): `<style>` elements and `setAttribute("style")` are blocked; CSSOM property writes are allowed | `player/static/player.nginx.conf`, MDN `style-src` |
| Tests run in node with hand-written DOM doubles; **no jsdom/happy-dom installed** | `tests/_playerFakes.ts:2`, `tests/ResourceReload.test.ts:5`, `package.json` |
| Real-browser harness exists: `npm run player-smoke` drives the shipped player in an opaque-origin sandboxed iframe in Chromium, Firefox, WebKit (Playwright borrowed from `virtual-lab/e2e`) | `scripts/player-smoke/run.mjs`, `design/player-sandbox.md` §2 |
| `Slider` pointer-down jumps to the pointer (`_grab`), `Scrollbar` pointer-down off the handle pages — single-pointer alternatives to dragging already exist for both (WCAG 2.5.7) | `Slider.ts:93`, `Scrollbar.ts:208-220` |

## External evidence

- **WCAG 2.2 AA criteria in play:** 1.1.1 non-text content (text alternative for meaningful images);
  2.1.1 keyboard; 2.1.2 no keyboard trap; 2.4.3 focus order; 2.4.7 focus visible; 2.4.11 focus not obscured
  (minimum); 2.5.7 dragging movements (single-pointer alternative); 2.5.8 target size ≥ 24×24 CSS px (or
  spacing); 4.1.2 name, role, value; 4.1.3 status messages (announced without focus). (W3C WCAG 2.2.)
- **First rule of ARIA:** use the native element when one exists. Evidence that it matters here: custom
  `role="slider"` widgets are **not adjustable** with iOS VoiceOver swipes or TalkBack volume keys, native
  `<input type="range">` is (Angular Material issue #15037; Stanko/aria-progress-range-slider #2; MUI uses a
  native range under its slider). Native `<select>` opens a browser popup, which would duplicate the
  engine-drawn list → the APG **select-only combobox** pattern (`role=combobox` + `role=listbox`/`option`,
  `aria-activedescendant`) is the right shape for Dropdown.
- **Flutter web:** a semantics tree of absolutely positioned `flt-semantics` elements over the canvas;
  **off by default for performance**, switched on by an invisible "Enable accessibility" button; known
  failures of that opt-in (desktop SR never reaches the placeholder, flutter#195585); 3.32 made the tree
  ~80% faster to build (docs.flutter.dev/ui/accessibility/web-accessibility; flutter.dev blog "Accessibility
  in Flutter on the Web").
- **PixiJS:** `AccessibilitySystem` puts invisible divs over accessible objects (`accessibleTitle`,
  `accessibleHint`, `tabIndex`), activated by Tab by default; the Tab activation inserted a canvas-covering
  div with side effects (pixijs#9761); v8 added `enabledByDefault`, `activateOnTab`, `deactivateOnMouseMove`,
  `debug` (pixijs PR #11107).
- **Unity 6:** `UnityEngine.Accessibility` — `AssistiveSupport.activeHierarchy`, `isScreenReaderEnabled`,
  `notificationDispatcher.SendAnnouncement(string)`; `AccessibilityNode` with label/value/hint/role. Native
  screen readers on iOS/Android (later desktop), **not web**; uGUI controls are not exposed automatically.
- **`ariaNotify()`** (`document`/`Element.ariaNotify(text, { priority: "normal" | "high" })`): Chrome/Edge
  141, Firefox 150, Safari 27 (Baseline newly available Sept 2026). Caveats: VoiceOver may drop an
  announcement that coincides with another AX event; ChromeOS never speaks it; NVDA honours `high` only from
  2027.1 (MDN; Edge blog 2025-05-05; nvaccess/nvda #21026). Fallback: `aria-live` polite/assertive regions
  that exist **before** their content changes.
- **Sandboxed / cross-origin iframes:** screen readers read frame content in place through the browser's
  accessibility API regardless of origin (NVDA 2025.3 + Chrome: "frame … Out of frame"); an iframe without a
  name is a known problem across NVDA/JAWS/VoiceOver — the frame needs a `title` (PowerMapper iframe tests).
- **CSP:** CSSOM property writes (`el.style.left = …`, `setProperty`) are not blocked by `style-src`;
  `setAttribute("style")` is; `style.cssText` is disputed between MDN and Chrome → **use per-property writes
  only** (MDN `style-src`, `style-src-attr`).
- **Testing:** Playwright `locator.ariaSnapshot()` / `expect(locator).toMatchAriaSnapshot()` (1.49+);
  a page-level snapshot does not descend into iframes → scope it with
  `page.frameLocator("iframe").locator("body")`. jsdom gives a DOM and events but no layout and no
  accessibility tree.

## Decisions (made here, with their evidence)

- **D-1 Twin shape.** One twin root per document: `<div data-we-a11y>` inserted right after the WebGL
  canvas, `position: fixed` over the render surface (from the cached `_surfaceLeft/_surfaceTop`/size of any
  live Canvas — no layout read), `overflow: hidden`, `pointer-events: none`, `z-index` below the UI
  overlays. Inside it, one group `<div>` per Canvas in render order (ascending `sortingOrder`), and inside
  each group one element per mirrored node in the Canvas's own order (`sortingOrder`, then
  `_hierarchyIndex`). DOM order = reading order = Tab order. Elements are transparent (`opacity: 0`),
  absolutely positioned over their control in CSS px (Flutter and Pixi both position; touch exploration
  needs bounds). Styles written per property only (CSP).
- **D-2 Role mapping (native first).**
  | Engine | Twin element | State/value |
  |---|---|---|
  | `Button` | `<button type="button">` | `disabled` |
  | `Toggle` (no group, or group with `allowSwitchOff`) | `<input type="checkbox">` | `checked`, `disabled` |
  | `Toggle` in a `ToggleGroup` without `allowSwitchOff` | `<input type="radio" name="g<n>">` | `checked` |
  | `Slider` | `<input type="range">` | `min`, `max`, `step` (`1` if `wholeNumbers`, else `any`), `value`, `aria-valuetext` (author formatter), `aria-orientation` |
  | `Scrollbar` | `<input type="range" min=0 max=1>` | `step` from `numberOfSteps`, `value` |
  | `Dropdown` | `<div role="combobox" tabindex="0" aria-haspopup="listbox">` + `<div role="listbox">` of `role="option"` | `aria-expanded`, `aria-activedescendant`, `aria-selected`; text = `selectedText` |
  | `InputField` | `<input>` of the field's content type (persistent) | `value`, `readOnly` |
  | `UIText` (not inside a control) | `<div>` with the text | `role="status"` / `role="alert"` when `live` is set |
  | `UIImage` **with** an author label | `<div role="img" aria-label>` | — |
  | `UIImage` without a label, `RawImage`-like decoration, `ScrollRect`, `VirtualJoystick` | nothing | — |
  A non-interactable control gets the native `disabled` (it is not selectable in the engine either).
  An inactive, disabled, `CanvasGroup.alpha === 0` or `AccessibleLabel.hidden` node is not mirrored.
- **D-3 Accessible names (author API).** New serializable component **`AccessibleLabel`** (`label`, `hint`,
  `hidden`, `live: AccessibleLive.Off | Polite | Assertive`; runtime-only `formatValue?: (v: number) =>
  string`) — a component, not a field on `GameObject`: no hub-file or format change, it serializes like any
  component, and it is opt-in per object. Name resolution, first non-empty wins: `AccessibleLabel.label` →
  the control's own text (`Button.text`, `Toggle.label`) → the `UIText` descendants of the control, in order
  (they are absorbed and not mirrored separately) → none (reported by `Accessibility.audit()`, never the
  `GameObject.name`, which is "Button (1)"-style noise). `hint` → `aria-describedby` to a hidden
  description element (broader support than `aria-description`).
- **D-4 Default on (owner-level; delegated — recommendation recorded as the decision).** `Accessibility.enabled`
  defaults to **true**; the twin root is created lazily on the first Canvas that has mirrorable content, so
  3D-only scenarios pay nothing. Opt-in activation (Flutter's placeholder, Pixi's Tab) is the documented
  failure mode — a screen-reader user can't reliably find the switch — and procurement needs the content
  exposed without a user action. Opt-out: `Accessibility.enabled = false` (removes the root). Reversible as a
  one-line default if the owner disagrees.
- **D-5 Performance budget.** A quiet frame (nothing changed) makes **zero DOM writes, zero layout reads,
  zero allocations**: one loop over preallocated node records comparing cached numbers/strings/booleans.
  Positions are rounded to whole CSS px and written only when they change. Structure is rebuilt only when a
  version counter moves (`EventSystem` registration, a new `Canvas._graphicsVersion`, `CanvasGroup`,
  `AccessibleLabel` enable/disable). Names that concatenate descendant text are recomputed only when one
  of the cached source strings changed (`===`). Measured target: ≤ 0.1 ms per quiet frame for 100 controls
  in Chromium (recorded, not asserted); asserted: 0 DOM writes on a quiet frame (internal write counter).
  `npm run size` must stay within its bundle budget.
- **D-6 Sync point.** DOM attributes and positions sync in `AccessibilityTree._sync()` right after
  `Canvas._renderAll()` (rects, texts and states are final for the frame). DOM → engine work (focus, AT
  actions) is **queued** by the DOM listeners and applied at the start of `EventSystem._update()`, so the
  engine never runs control callbacks from inside a DOM event handler and the order within a frame is
  deterministic.
- **D-7 Focus both ways.** Engine → DOM: when `EventSystem.currentSelected` differs from the last synced
  one and `document.hasFocus()`, focus its twin element with `{ preventScroll: true }` (never pull focus
  into an unfocused frame). DOM → engine: a `focusin` on a twin element queues `select()` of its control
  (ignored if not interactable). Deselecting in the engine (Escape) does not blur the DOM (blurring throws
  the screen reader's place to the top of the document); `focusout` to outside the twin does not clear the
  engine's selection.
- **D-8 Keyboard has one owner.** The engine's `EventSystem` stays the single source of keyboard
  behaviour. While the twin is active: **Tab/Shift+Tab belong to the browser** (DOM order = reading order;
  fixes the missing Shift+Tab; leaves the frame naturally — no keyboard trap) and `EventSystem` skips its own
  Tab handling; for keys the engine handles (Enter, Space, arrows, Home/End, PageUp/PageDown, Escape) the twin
  root calls `preventDefault()` on `keydown` **and** `keyup` (Space activates a button on keyup) when the
  target is a twin control, so native default actions never double the engine's. Events still bubble to
  `window`, so `Input` and scenario scripts see them. `InputField` while editing keeps native editing keys.
- **D-9 AT actions.** Activations that do not arrive as keys — a screen reader's virtual click, VoiceOver
  double-tap, a range `input` from a swipe or TalkBack volume key, a combobox option click — are routed by
  the twin: `click` (with `preventDefault`, so a checkbox does not flip itself) → `select()` + the control's
  activation; range `input` → `value = Number(el.value)` with notify. **Double-activation guard:** an
  assistive activation stamps the control; a pointer click delivered to the same control within 300 ms
  (`Time.realtimeSinceStartup`) is dropped — covers mobile SRs that both press the element and synthesize a
  touch at its centre.
- **D-10 Engine keyboard operability first (prerequisite).** Following Unity's semantics where they exist
  and the APG where Unity is weaker: `Toggle` submit toggles (Unity `OnSubmit → InternalToggle`); `Dropdown`
  submit opens/picks, arrows move the highlight while open, Escape closes the list before clearing focus
  (Unity `OnSubmit → Show`, `OnCancel → Hide`); `Slider` arrows along its axis change the value by
  `step = wholeNumbers ? 1 : (max − min) × 0.1` (Unity `stepSize`), Home/End to min/max (APG),
  PageUp/PageDown by `pageStep = max(step, (max − min) × 0.2)`, rounded when `wholeNumbers` (APG "larger
  increment"; Unity has none); `Scrollbar` likewise with
  `numberOfSteps > 1 ? 1 / (numberOfSteps − 1) : 0.1` (Unity). **Deviation from Unity, recorded:** Unity only
  adjusts a Slider when there is no selectable in that direction; that leaves a slider with neighbours
  un-adjustable from the keyboard (WCAG 2.1.1) — N5 always adjusts along the axis and navigates off-axis
  (APG slider pattern). Mechanism: a `Selectable._move(direction): boolean` hook (default `false` →
  `navigate`) and `_cancel(): boolean` (default `false` → clear focus).
- **D-11 Focus visible.** The Canvas paints a focus ring (2 CSS px outline, `EventSystem.focusRingColor`,
  default high-contrast, ≥ 3:1 against both light and dark — white ring with a 1 px dark inner edge) around the
  selected control's rect when the focus came from the keyboard or AT (`:focus-visible` semantics; pointer
  focus shows no ring), and only while the document has focus or the twin is off. The ring is part of the
  repaint decision (cached target + rect + visible flag; changing any marks the canvas dirty with the ring's
  bounds), so `OnDemand` and partial repaint stay correct. Authors can turn it off per scenario
  (`EventSystem.focusRingWidth = 0`) when their own `ColorBlock.selectedColor` styling is sufficient.
- **D-12 Focus not obscured (2.4.11).** When a control gains focus from keyboard/AT and sits inside a
  `ScrollRect`'s viewport but outside it, the ScrollRect scrolls the minimal distance to reveal it
  (`ScrollRect.scrollIntoView(rect)`, public, also useful to authors). Unity does not do this automatically;
  it is additive and only reacts to keyboard/AT focus, never to pointer focus.
- **D-13 Announcements.** `Accessibility.announce(message, priority = AccessibilityPriority.Normal)`
  (Unity analogue `AssistiveSupport.notificationDispatcher.SendAnnouncement`): `document.ariaNotify` when
  present, else two visually hidden live regions (`aria-live="polite"` / `"assertive"`, created with the
  root, before any content), cleared and re-set on the next frame so a repeated message is re-announced. A
  `UIText` with `AccessibleLabel.live` becomes `role="status"`/`"alert"` and its text changes are announced
  by the browser (WCAG 4.1.3).
- **D-14 Player.** (a) `PlayerRuntime`'s Space-to-pause must not fire when the event target is inside the
  twin (`closest("[data-we-a11y]")`) — otherwise Space on a focused button pauses the scenario. With the twin
  off the existing behaviour stays (follow-up row: a Space on an engine-focused control with the twin off).
  (b) `PlayerHost` gets an optional `title` (default `"Scenario"`) set on the frame: the frame is the
  landmark a screen reader announces. (c) `lang` of the player document needs a protocol field → follow-up
  row, not N5. Nothing in the sandbox blocks the twin: it is plain DOM + CSSOM in the frame's own document,
  and the AT reads cross-origin frames in place.
- **D-15 Author tools.** `Accessibility.audit(): AccessibilityIssue[]` — controls without a name, targets
  smaller than 24×24 CSS px (2.5.8), `UIImage`s with `raycastTarget` and a click handler but no label,
  `VirtualJoystick`s (drag-only: author must provide a keyboard alternative, 2.5.7). `Accessibility.debugView
  = true` shows twin elements with an outline (opacity 0.35) to check positions by eye.
- **D-16 Test strategy.** (1) Node unit tests (existing style, no DOM) for the engine keyboard behaviour,
  the focus ring decision, name resolution and audit. (2) **Add `jsdom` as a devDependency**, used per file
  with `// @vitest-environment jsdom`, for the twin: structure, roles and attributes, quiet-frame zero writes,
  positions from fake surface values incl. world-space, focus both ways, `preventDefault` of handled keys,
  AT-action routing and the double-activation guard, live regions and the `ariaNotify` path (stubbed). (3)
  **Browser check** in `player-smoke`: a fixture scenario with every control, run in the shipped player in
  Chromium/Firefox/WebKit; `frameLocator("iframe").locator("body").ariaSnapshot()` against a committed
  template, Tab order, one `onClick` per Enter and per Space, focus sync both ways. (4) Real screen readers
  (NVDA + Chrome, VoiceOver macOS/iOS, TalkBack) are a manual pass → `owner hw` follow-up row.

## Out of scope (follow-up rows)

- `lang` on the player document (protocol field) — `⬜`.
- Space-to-pause vs. engine-focused control with the twin off — `⬜`.
- 3D-scene objects (non-UI) as accessible nodes, e.g. a labelled clickable mesh — `⬜` (needs raycast
  activation design).
- Manual screen-reader pass on real devices — `owner hw`.
- `InputField` world-space placement bug (uses `scaleFactor`, not `canvasToScreenPoint`) — fixed in N5
  only for the adopted element path; the standalone path stays as is → `⬜` if not covered.

## Risks

- **Double activation** (native default + engine, or SR click + synthesized touch): pinned by D-8/D-9 and
  the browser check counting `onClick` per key in three browsers.
- **Hub/loop files:** `EventSystem.ts`, `Selectable.ts`, `Canvas.ts`, `Application.ts`, `InputField.ts`,
  `PlayerHost.ts` (hub). Phases touching them are serial and Full-gated where input/focus routing changes.
- **Perf regressions in UI-heavy scenarios:** guarded by the write counter test and the measured budget;
  `Accessibility.enabled = false` is the escape hatch.
- **WebKit headless can't focus the window** (`design/player-sandbox.md` §8): focus-sync assertions that need
  `document.hasFocus()` may be unobservable in WebKit → mark as `EXPECTED_FAILURES` only with that reason
  measured, never silently.
