# Plan: N5 — Accessibility: hidden DOM twin of the Canvas UI
**Created:** 2026-11-11 (Claude, architect lane)
**Status:** ready
**Complexity:** complex
**Review cadence:** 1
**Check-ins:** quiet
---
## Context
The Canvas UI is pixels: screen readers see nothing, and the keyboard only half works (only Button reacts
to Enter/Space, no focus indicator, no Shift+Tab). N5 makes the engine's own keyboard behaviour complete,
paints a visible focus ring, and mirrors every Canvas control into a hidden, positioned DOM twin of native
elements that screen readers and the browser's focus model use, kept in sync with `EventSystem` both ways,
with zero cost on a quiet frame. Card: `tasks/E-growth.md` § N5. Research, facts with line numbers and every
decision with its evidence: `code-foundations/N5/research.md` — **read it first; its Decisions section
(D-1 … D-16) is binding.** Base: WebEngineTS `master` `a020db6`.

**Success criteria:**
1. Every `Selectable` (Button, Toggle, Slider, Scrollbar, Dropdown, InputField) is operable by keyboard alone
   through the engine (D-10), and a keyboard/AT-focused control shows a visible ring (D-11).
2. In the shipped sandboxed player, the frame's accessibility tree (Playwright `ariaSnapshot`, Chromium,
   Firefox, WebKit) lists every control with the right role, name and value, in hierarchy order; labelled
   images as `img`; static text as text.
3. Tab/Shift+Tab move focus through the twin and the engine selection follows; `select()` from script moves
   DOM focus; Enter and Space each fire exactly one `onClick`.
4. A quiet frame makes 0 DOM writes (asserted) and allocates nothing (review + measured); the measured sync
   cost for 100 controls is recorded (target ≤ 0.1 ms in Chromium); `npm run size` within budget.
5. `Accessibility.announce` speaks through `ariaNotify` or the live-region fallback.
6. `npm run typecheck`, `npm test`, `npm run build`, `npm run size`, `npm run player-smoke` green.

## Constraints
- Engine only (`WebEngineTS`, including `src/player` and `scripts/player-smoke`), plus the task's
  `.claude-shared` notes. No consumer changes (consumers get it through `release:local` later).
- The engine's `EventSystem` is the single source of keyboard behaviour; the twin never adds a second one
  (D-8). DOM → engine work is queued and applied at the start of `EventSystem._update` (D-6).
- Styles only through CSSOM property writes (`el.style.left = …`), never `setAttribute("style")`,
  `cssText` or `<style>` elements — the player CSP is `default-src 'none'`.
- No `THREE` in any public signature; JSDoc on public/protected members; `@internal` on engine internals;
  zero allocation in per-frame paths (CLAUDE.md).
- New public API (exact names; anything else is a question): `Accessibility` (static: `enabled`,
  `debugView`, `announce(message, priority?)`, `audit()`), `AccessibilityPriority` (`Normal`, `High`),
  `AccessibleLabel` (component: `label`, `hint`, `hidden`, `live`; runtime `formatValue`), `AccessibleLive`
  (`Off`, `Polite`, `Assertive`), `AccessibilityIssue` (type), `EventSystem.focusRingColor`,
  `EventSystem.focusRingWidth`, `ScrollRect.scrollIntoView(rect)`, `PlayerHostOptions.title`.
- Never weaken a test; anything this plan does not answer is a question: park (ATTENTION), do not guess.

---
## Implementation Phases

### Phase 1: Keyboard operation of every control (engine, no DOM)
**Skills:** code-foundations:cc-defensive-programming, code-foundations:cc-control-flow-quality
**Model:** sonnet
**Gate:** Full
**Depends on:** none
**File scope:** src/engine/core/ui/Selectable.ts, src/engine/core/ui/EventSystem.ts, src/engine/core/ui/Toggle.ts, src/engine/core/ui/Slider.ts, src/engine/core/ui/Scrollbar.ts, src/engine/core/ui/Dropdown.ts, tests/KeyboardOperation.test.ts

**Goal:** a keyboard user can operate every control without the twin (D-10).

**Scope:**
- IN: `Selectable._move(direction): boolean` (`@internal`, default `false`) and `_cancel(): boolean`
  (default `false`); `EventSystem._processKeyboard` calls `selected._move(dir)` and falls back to
  `navigate(dir)` only when it returns `false`; Escape calls `selected._cancel()` and clears focus only when it
  returns `false`; Home/End/PageUp/PageDown are passed to a new `_key(code): boolean` hook (default `false`).
  `Toggle`: `onSubmit` toggles (respecting `ToggleGroup`/`allowSwitchOff` exactly like a click).
  `Slider`: arrows along the axis change `value` by `step` (direction and `SliderDirection` reversal
  respected: "increase" is Right/Up for LeftToRight/BottomToTop, reversed for the others — check Y-down:
  Up arrow means visually up), Home/End → min/max, PageUp/PageDown by `pageStep`; off-axis arrows navigate.
  `Scrollbar`: same with Unity's step. `Dropdown`: submit opens (closed) or picks the highlighted option
  (open); arrows Up/Down move the highlight while open (clamped, scroll the list to keep it visible —
  reuse `_scrollTo`); Escape closes an open list (`_cancel` → `true`).
  All value changes go through the public setters (they notify), never `setValueWithoutNotify`.
- OUT: Tab behaviour (unchanged here), the twin, focus ring.

**Edge cases:** non-interactable control (no change); slider at min/max (clamped, no notify when the value
does not change — follow the existing setter); `wholeNumbers` rounding; `minValue > maxValue`
(follow the existing setter's normalisation); empty Dropdown (submit does nothing); an `InputField`
editing (`_consumesKeyboard`) still blocks all of the above; gamepad navigation path
(`_processNavigationAxis`) uses the same `_move` hook so a D-pad adjusts a slider too.

**Done when:**
- [ ] DW-1.1: per control, a test drives `Input` key-downs through `EventSystem._update()` (the existing test pattern in `tests/UI.test.ts`/`ExplicitNavigation.test.ts`) and asserts the value/state change and the `onValueChanged` count: Toggle Enter and Space flip once; Slider Right/Left/Home/End/PageUp/PageDown in all four `SliderDirection`s; Scrollbar with `numberOfSteps` 0 and 5; Dropdown Enter-open, Down×2, Enter-pick, Escape-close-keeps-focus, second Escape clears focus.
- [ ] DW-1.2: a horizontal slider with a button to its right and to its left: Right/Left adjust the value (deviation from Unity recorded in a code comment citing research D-10); Up/Down navigate.
- [ ] DW-1.3: existing navigation, Button submit and InputField tests still pass unchanged.

### Phase 2: `AccessibleLabel`, name resolution and audit (pure, no DOM)
**Skills:** code-foundations:aposd-designing-deep-modules, code-foundations:code-clarity-and-docs
**Model:** sonnet
**Gate:** Standard
**Depends on:** none
**File scope:** src/engine/core/ui/accessibility/AccessibleLabel.ts, src/engine/core/ui/accessibility/AccessibleName.ts, src/engine/core/ui/accessibility/AccessibilityAudit.ts, src/engine/index.ts, tests/AccessibleName.test.ts

**Goal:** authors can name things, and the engine can compute a control's name, role kind and issues
without any DOM (D-3, D-15).

**Scope:**
- IN: `AccessibleLabel` (`@Serializable({ typeName: "AccessibleLabel", category: "UI" })`, fields `label`,
  `hint`, `hidden`, `live: AccessibleLive`; non-serialized `formatValue: ((v: number) => string) | null`);
  a static version counter bumped on its enable/disable/destroy (pattern: `CanvasGroup._structureVersion`).
  `AccessibleName` (`@internal`): `resolveName(control, out: { parts })`-style API that returns the name
  without allocating when the sources are unchanged — design it so the twin can cache the source strings and
  compare with `===` (D-5); `twinKind(behaviour)` → `button | checkbox | radio | range | combobox | textbox
  | text | img | none` per D-2 (`radio` = Toggle in a group without `allowSwitchOff`); the list of `UIText`
  descendants absorbed into a control's name (depth cap like `MAX_HANDLER_DEPTH`).
  `AccessibilityAudit.audit()` → `AccessibilityIssue[]` (`{ kind: "no-name" | "small-target" |
  "unlabelled-clickable-image" | "drag-only", gameObject, detail }`), target size in CSS px via
  `canvas.canvasToScreenPoint` of the rect corners; exported from `index.ts` through `Accessibility.audit`
  in Phase 4 (export the types here).
- OUT: any DOM.

**Edge cases:** a `UIText` inside a Button is absorbed (not a separate text node); nested controls (a
Toggle inside a Button) — the inner control is its own node and its texts are not absorbed by the outer;
`hidden` on an ancestor hides the subtree; `GameObject.name` is never used as a name.

**Done when:**
- [ ] DW-2.1: name precedence test (label → own text → descendant texts in hierarchy order → none) for each control type.
- [ ] DW-2.2: `twinKind` table test covering every row of research D-2.
- [ ] DW-2.3: audit reports a nameless Slider, a 20×20 CSS px Button (and not a 24×24 one; a `CanvasScaler` scale changes the verdict), a clickable unlabelled UIImage, a VirtualJoystick.
- [ ] DW-2.4: `AccessibleLabel` round-trips through `SceneSerializer` save → load (plain scene) with all fields; `formatValue` is not serialized.

### Phase 3: Focus source and the focus ring
**Skills:** code-foundations:cc-defensive-programming
**Model:** sonnet
**Gate:** Full
**Depends on:** Phase 1
**File scope:** src/engine/core/ui/EventSystem.ts, src/engine/core/ui/Selectable.ts, src/engine/core/ui/Canvas.ts, tests/FocusRing.test.ts

**Goal:** a keyboard- or AT-focused control is visibly focused; pointer focus is not ringed (D-11).

**Scope:**
- IN: `EventSystem._focusSource: "pointer" | "keyboard" | "assistive" | "script"` (`@internal`) set by every
  path that selects (pointer-down → pointer; Tab/arrows/gamepad → keyboard; `select()` from script →
  script, ringed like keyboard — Unity's selected state shows for scripted selection too); an internal
  `_select(control, source)` used by those paths, `select()` stays public and unchanged in signature.
  `EventSystem.focusRingColor: Color` (default white), `focusRingWidth: number` (default 2, `0` disables).
  Canvas: after painting graphics, stroke the ring (outer `focusRingWidth` in the colour, 1 px dark inner edge)
  around the selected control's resolved rect when it belongs to this canvas and the source is not pointer.
  Repaint: cache `(control, rect x/y/w/h, visible, colour hash, width)` per canvas in `_prepare`; any change
  marks the canvas dirty and unions old and new ring bounds into the partial-repaint region; masked controls
  are ringed inside their mask clip.
  "Document has focus" input to the decision is a static `EventSystem._documentFocused` (`@internal`, default
  `true`), updated by the twin in Phase 6 — no DOM read here.
- OUT: DOM focus.

**Edge cases:** focus moves between controls on two canvases (both repaint); control destroyed while
focused (ring disappears, no stale rect); `OnDemand` canvas with nothing else changing; world-space canvas;
`focusRingWidth = 0` → no paint and no repaint churn.

**Done when:**
- [ ] DW-3.1: with a recording 2D-context double, Tab to a Button paints a ring stroke at its rect; clicking it (pointer) paints none; `select()` from script paints one.
- [ ] DW-3.2: on an `OnDemand` canvas with `partialRepaint`, moving focus between two buttons repaints exactly a region covering both rings; a following quiet frame repaints nothing.
- [ ] DW-3.3: existing Canvas repaint/partial-repaint tests unchanged and green.

### Phase 4: Twin core — root, structure, roles, names, values (jsdom)
**Skills:** code-foundations:aposd-designing-deep-modules, code-foundations:performance-optimization
**Model:** sonnet
**Gate:** Full
**Depends on:** Phase 2, Phase 3
**File scope:** package.json, package-lock.json, src/engine/core/ui/accessibility/Accessibility.ts, src/engine/core/ui/accessibility/AccessibilityTree.ts, src/engine/core/ui/Canvas.ts (`_graphicsVersion` only), src/engine/core/Application.ts (sync call after `Canvas._renderAll`, teardown in `dispose`), src/engine/index.ts, tests/AccessibilityTree.test.ts

**Goal:** the DOM twin exists and mirrors structure, roles, names, states and values, read-only (D-1, D-2,
D-4, D-5).

**Scope:**
- IN: `npm i -D jsdom` (devDependency only; tests opt in with `// @vitest-environment jsdom`).
  `Accessibility` public static: `enabled` (default `true`; setting `false` removes the root), `debugView`
  (stub until Phase 5), `audit()` (delegates to Phase 2). Root constant `A11Y_ROOT_ATTRIBUTE =
  "data-we-a11y"` (`@internal`, exported for the player test in Phase 10).
  `AccessibilityTree` (`@internal`, static like `EventSystem`): lazily creates the root after the WebGL
  canvas on the first sync that finds mirrorable content; per-Canvas group elements in ascending
  `sortingOrder`; per node a preallocated record `{ behaviour, kind, element, cached name sources, cached
  state }`; structure rebuild when any of `EventSystem` registration version, `Canvas._graphicsVersion`
  (new: bumped on register/unregister/sort), `CanvasGroup._structureVersion`, `AccessibleLabel` version
  changed; element per D-2 (native elements, `type="button"`, radio `name` per `ToggleGroup`, combobox +
  listbox + options with stable ids `we-a11y-<n>`); attribute sync per frame with compare-before-write;
  `_domWrites` counter (`@internal`) incremented by every DOM mutation helper.
  `Application`: `AccessibilityTree._sync()` right after `Canvas._renderAll()`; `AccessibilityTree._reset()`
  in `dispose()` (removes the root and listeners) and wherever `EventSystem._reset()` is called.
  Elements are not positioned yet (Phase 5) and have no listeners yet (Phase 6).
- OUT: positions, focus, events, announcements, InputField adoption (InputField mirrored as a read-only
  `<input>` with value for now).

**Edge cases:** no `document` (node, workers) → no-op; two canvases with the same `sortingOrder`; control
disabled/re-enabled (record reused or rebuilt, never duplicated); `Accessibility.enabled` toggled at runtime;
`Application` disposed and a new one created in the same page (root rebuilt once).

**Done when:**
- [ ] DW-4.1: jsdom test builds one canvas with every control + a labelled UIImage + a UIText + an unlabelled UIImage and asserts the twin DOM: element types, roles, names (`aria-label`/text), `checked`, `min/max/step/value`, `aria-valuetext` from `formatValue`, `aria-expanded`, options with `aria-selected`, `disabled`; unlabelled image absent; absorbed texts absent.
- [ ] DW-4.2: changing each state from script (`isOn`, `value`, `options`, `interactable`, `CanvasGroup.interactable/alpha`, `SetActive(false)`) is reflected after the next `_sync()`.
- [ ] DW-4.3: **quiet frame:** after one sync, ten further `_sync()` calls with nothing changed leave `_domWrites` unchanged.
- [ ] DW-4.4: `Accessibility.enabled = false` removes the root; a scenario with no Canvas never creates one; `dispose()` leaves no `[data-we-a11y]` in the document.

### Phase 5: Twin positions, world space, debug view
**Skills:** code-foundations:performance-optimization
**Model:** sonnet
**Gate:** Standard
**Depends on:** Phase 4
**File scope:** src/engine/core/ui/accessibility/AccessibilityTree.ts, src/engine/core/ui/accessibility/Accessibility.ts, tests/AccessibilityTreeLayout.test.ts

**Goal:** every twin element sits over its control in CSS px, so touch exploration and the SR focus box
match the pixels (D-1, D-5).

**Scope:**
- IN: root `position: fixed` at the surface (`_surfaceLeft/_surfaceTop` and CSS size of a live Canvas — no
  `getBoundingClientRect`), `overflow: hidden`, `pointer-events: none`, `opacity: 0` on elements (root stays
  `opacity: 1` so `debugView` can show children), `z-index` = `BASE_Z_INDEX - 1` (export the constant from
  Canvas or duplicate with a cross-reference test); per element `left/top/width/height` from the resolved
  rect's two corners through `canvas.canvasToScreenPoint` (world-space aware), rounded to whole px, written
  only on change (static scratch vectors, no allocation); an open Dropdown's listbox options positioned at the
  drawn items. `debugView = true`: elements `opacity: 0.35`, `outline: 1px solid magenta`.
  `_lastSyncMs` (`@internal`) measured with `performance.now()` around `_sync` for Phase 11.
- OUT: focus/events.

**Edge cases:** `CanvasScaler` scaling; world-space canvas behind the camera (`isRenderable === false` →
element `hidden` but kept in the tree? → hide it: it is not on screen); fully masked control (stays in the
tree at its real rect, clipped by the root — reachable for Phase 9's reveal); sub-pixel jitter of a
world-space canvas (rounding prevents churn).

**Done when:**
- [ ] DW-5.1: overlay canvas with a `CanvasScaler` and a fake surface offset (20, 30): element boxes equal `canvasToScreenPoint` of the rect corners, rounded.
- [ ] DW-5.2: world-space canvas: moving the camera moves the element; a frame with no camera movement writes nothing (`_domWrites`).
- [ ] DW-5.3: DW-4.3 still holds with positions on (quiet frame = 0 writes).

### Phase 6: Focus both ways, keyboard ownership, AT actions
**Skills:** code-foundations:cc-defensive-programming, code-foundations:aposd-verifying-correctness
**Model:** sonnet
**Gate:** Full
**Depends on:** Phase 5
**File scope:** src/engine/core/ui/accessibility/AccessibilityTree.ts, src/engine/core/ui/EventSystem.ts, src/engine/core/ui/Selectable.ts, tests/AccessibilityFocus.test.ts

**Goal:** the browser's focus and the engine's selection are one thing, and AT actions reach the controls
exactly once (D-6, D-7, D-8, D-9).

**Scope:**
- IN: listeners on the root (added once with the root, removed in `_reset`): `focusin` → queue select
  (source `assistive`, or `keyboard` when the last key event was Tab); `keydown`/`keyup` (capture) →
  `preventDefault()` for Enter, NumpadEnter, Space, arrows, Home, End, PageUp, PageDown, Escape when the
  target is a twin control that is not an editing `InputField` (never `stopPropagation`); `click` →
  `preventDefault()` + queue activation; range `input` → queue `value = Number(el.value)`; option `click` →
  queue pick. `EventSystem._update` starts with `AccessibilityTree._applyPending()`; the queue is a
  preallocated ring (no allocation per event beyond what the browser does). `EventSystem._processKeyboard`
  skips Tab handling while `AccessibilityTree.active` (browser owns Tab/Shift+Tab). Engine → DOM:
  in `_sync`, when the selection changed since the last sync and `document.hasFocus()`, `element.focus({
  preventScroll: true })`; selection cleared → no blur. `EventSystem._documentFocused` updated from
  `window` `focus`/`blur` (Phase 3 input). Double-activation guard: assistive activation stamps
  `Selectable._assistiveAt = Time.realtimeSinceStartup`; the pointer-click path of the same control drops
  a click within 0.3 s of it (one shared helper used by Button, Toggle, Dropdown pointer-click listeners).
- OUT: InputField element adoption (Phase 7), announcements.

**Edge cases:** focusin on a disabled/non-interactable control (ignored); a control destroyed while its
select is queued (dropped); focus moves inside a handler (`_setSelected` assigns first — keep it);
Shift+Tab from the first control leaves the twin (no trap); Escape with an open Dropdown (closes, no focus
change); key repeat; the frame not focused (no `focus()` call at all).

**Done when:**
- [ ] DW-6.1: jsdom: dispatching `focusin` on the Slider's element then running a frame selects the Slider (source assistive); `button.select()` + frame focuses the button element; with `document.hasFocus()` false nothing is focused.
- [ ] DW-6.2: keydown Enter + keyup on the Button element: `defaultPrevented` on both, and `onClick` fires once (through the engine's keyboard path); a synthetic `click` on the element (AT) fires `onClick` once; that click followed within 0.3 s by an engine pointer click on the same button fires no second `onClick`; after 0.3 s it does.
- [ ] DW-6.3: checkbox element `click` toggles the Toggle once and the element's `checked` matches after sync; range `input` event with value 7 sets the Slider to 7 with one `onValueChanged`.
- [ ] DW-6.4: Tab in the engine is skipped while the twin is active and works as before with `Accessibility.enabled = false` (existing tests).

### Phase 7: InputField adopts the twin's element
**Skills:** code-foundations:cc-defensive-programming
**Model:** sonnet
**Gate:** Full
**Depends on:** Phase 6
**File scope:** src/engine/core/ui/InputField.ts, src/engine/core/ui/accessibility/AccessibilityTree.ts, tests/AccessibilityInputField.test.ts

**Goal:** one `<input>` per field: the persistent twin element is the one the field edits through, so the
screen reader finds the field while browsing and editing does not jump focus to a second element.

**Scope:**
- IN: `InputField._adoptElement(el | null)` (`@internal`): when an element is adopted, `_attachElement`
  uses it (adds its `input`/`keydown` listeners, sets type/value/selection, focuses it) and `_detachElement`
  removes only the listeners (never the element); with no adopted element the current create/remove path is
  unchanged. The twin adopts on structure rebuild and un-adopts when the record is dropped. The twin's key
  `preventDefault` skips an editing InputField entirely; `readOnly`, content type → `type`/`inputmode` stay
  owned by InputField. Positioning: the twin positions the element (Phase 5) — InputField's own
  `_syncElementBox` is skipped for an adopted element, which also fixes world-space placement for it.
- OUT: the standalone path's world-space bug (follow-up row).

**Edge cases:** adoption changes while editing (end the edit first); password type; IME composition events
pass through; mobile keyboard scroll (`preventScroll: false` stays for focus from a tap, as today).

**Done when:**
- [ ] DW-7.1: with the twin on, focusing the field's twin element and typing (`input` events) updates `text`, Enter submits once, Tab leaves; only one `<input>` exists in the document throughout.
- [ ] DW-7.2: with `Accessibility.enabled = false`, the existing InputField tests pass unchanged.

### Phase 8: Announcements and live text
**Skills:** code-foundations:code-clarity-and-docs
**Model:** sonnet
**Gate:** Standard
**Depends on:** Phase 7
**File scope:** src/engine/core/ui/accessibility/Accessibility.ts, src/engine/core/ui/accessibility/AccessibilityTree.ts, src/engine/index.ts, tests/AccessibilityAnnounce.test.ts

**Goal:** scenarios can speak status messages (D-13, WCAG 4.1.3).

**Scope:**
- IN: `Accessibility.announce(message, priority = AccessibilityPriority.Normal)`: `document.ariaNotify`
  when it is a function (feature-detected once), else the two live regions created with the root
  (visually hidden: 1×1 px, clipped, inside the root) — clear on announce, set the text on the next sync so
  repeats re-announce; message truncated to 500 chars. Works (as a no-op that does not throw) with the twin
  disabled or no document. `UIText` with `AccessibleLabel.live` → element `role="status"` (Polite) or
  `role="alert"` (Assertive); text changes written as they happen (compare-before-write).
- OUT: automatic announcements of control value changes (the native element already announces its own
  value when focused).

**Done when:**
- [ ] DW-8.1: with a stubbed `document.ariaNotify`, `announce("x", High)` calls it once with `{ priority: "high" }`; without it, the assertive region holds "x" after the next sync, and a second identical announce is re-announced (cleared then set).
- [ ] DW-8.2: a live `UIText` whose text changes gets `role="status"` and the new text; a non-live one has no role.

### Phase 9: Reveal the focused control inside a ScrollRect
**Skills:** code-foundations:cc-defensive-programming
**Model:** sonnet
**Gate:** Standard
**Depends on:** Phase 6
**File scope:** src/engine/core/ui/ScrollRect.ts, src/engine/core/ui/EventSystem.ts (one call in the select path), tests/ScrollIntoView.test.ts

**Goal:** a control focused by keyboard or AT is never hidden behind its scroll view's viewport (D-12,
WCAG 2.4.11).

**Scope:**
- IN: `ScrollRect.scrollIntoView(rect: Rect)` (rect in canvas units): the minimal content move that brings
  the rect inside the viewport on the enabled axes, clamped to the scrollable range, `stopMovement()` first;
  the select path calls a static `ScrollRect._revealFocused(control)` for sources keyboard/assistive only —
  nearest ScrollRect ancestor whose `content` contains the control.
- OUT: smooth scrolling (instant; a later row may animate).

**Edge cases:** control larger than the viewport (align its start edge); nested ScrollRects (innermost
first, then outer); non-scrolling axis untouched; pointer focus never scrolls.

**Done when:**
- [ ] DW-9.1: list of 20 buttons in a vertical ScrollRect showing 5: Tab-select of item 12 (keyboard source) puts it fully inside the viewport; pointer select of a partly visible item does not scroll.
- [ ] DW-9.2: `scrollIntoView` of an already visible rect does not move content (`onValueChanged` not fired).

### Phase 10: Player — Space vs. focused controls, frame title
**Skills:** code-foundations:cc-defensive-programming
**Model:** sonnet
**Gate:** Standard
**Depends on:** Phase 4
**File scope:** src/player/player/PlayerRuntime.ts, src/player/host/PlayerHost.ts, tests/PlayerRuntime.test.ts, tests/PlayerHost.test.ts

**Goal:** the twin works inside the shipped sandboxed player without the player fighting it (D-14).

**Scope:**
- IN: `PlayerRuntime` Space-to-pause ignores events whose target is inside `[data-we-a11y]` (literal string
  in the player — it must not import the engine statically — with a test asserting it equals the engine's
  `A11Y_ROOT_ATTRIBUTE`). `PlayerHostOptions.title?: string` (default `"Scenario"`), set as the iframe's
  `title` in `_createFrame`; bounded to `MAX_TEXT_LENGTH`. `PlayerHost.ts` is a hub file: change only
  `_createFrame` and the options type.
- OUT: `lang` (protocol field, follow-up row); Space with the twin off (follow-up row).

**Done when:**
- [ ] DW-10.1: a Space keydown whose target is a `button` inside `[data-we-a11y]` does not pause; one on `body` still pauses (existing test).
- [ ] DW-10.2: the created frame has `title="Scenario"` by default and the given title when set; sandbox/allow attributes unchanged (existing tests).

### Phase 11: Browser accessibility-tree check in player-smoke + performance record
**Skills:** code-foundations:cc-quality-practices
**Model:** sonnet
**Gate:** Standard
**Depends on:** Phase 8, Phase 9, Phase 10
**File scope:** scripts/player-smoke/a11y.mjs, scripts/player-smoke/a11y.aria.yml, scripts/player-smoke/fixtures.mjs, scripts/player-smoke/run.mjs, scripts/player-smoke/shipped.mjs, tests/PlayerSmokeA11y.test.ts

**Goal:** prove success criteria 2–4 in real browsers through the shipped sandboxed player.

**Scope:**
- IN: a fixture scenario (built like the existing synthetic ZIP) with one of each control, a labelled image,
  a live text, and 100 extra buttons in a second canvas for the timing run; it reports clicks/values through
  `reportResult`-free channels already used by the harness (console or the existing report POST — follow
  `shipped.mjs`). Checks per browser (Chromium, Firefox, WebKit): `page.frameLocator("iframe").locator("body")
  .ariaSnapshot()` matches `a11y.aria.yml` (roles, names, values; committed template); keyboard: real
  `page.keyboard.press("Tab")` steps focus in hierarchy order and `Shift+Tab` back; Enter and Space on the
  button each give exactly one click; `ArrowRight` on the slider changes its value by one step;
  script `select()` moves `document.activeElement` inside the frame; `announce` result visible in the live
  region or `ariaNotify` called (instrumented stub only when absent). Timing: median `_lastSyncMs` over 300
  quiet frames with 106 controls, printed into the run output and recorded in the notes (target ≤ 0.1 ms
  Chromium; not a failing threshold). A check that is not observable in a browser (WebKit window focus, see
  `design/player-sandbox.md` §8) goes into `EXPECTED_FAILURES` **only** with the measured reason, and also
  fails with the twin's assertion removed.
  `tests/PlayerSmokeA11y.test.ts`: unit test of the template parser/normaliser in `a11y.mjs` (node).
- OUT: axe-core (not installed; follow-up if wanted); real screen readers (`owner hw` row).

**Done when:**
- [ ] DW-11.1: `npm run build && npm run player-smoke` exits 0 in all three browsers with the a11y checks included; output pasted into `code-foundations/N5/notes.md`.
- [ ] DW-11.2: the ariaSnapshot of Chromium is pasted into the notes next to the template.
- [ ] DW-11.3: the timing line is recorded; full checks `npm run typecheck`, `npm test`, `npm run build`, `npm run size` green.

### Phase 12: Docs and roadmap
**Skills:** code-foundations:code-clarity-and-docs
**Model:** sonnet
**Gate:** Minimal
**Depends on:** Phase 11
**File scope:** CHANGELOG.md (engine), CLAUDE.md (engine: Dependencies → `jsdom` dev; Game loop → twin sync after Canvas render; Key Technical Decisions → one bullet on the twin), docs/ (the engine's UI author page — find it with `graphify query "Canvas UI documentation"`; add an Accessibility section there, no new top-level file unless no UI page exists), .claude-shared/ROADMAP.md (N5 row + follow-up rows), .claude-shared/tasks/E-growth.md (N5 status line), .claude-shared/code-foundations/N5/*

**Goal:** authors and the next tasks find what landed and what is left.

**Done when:**
- [ ] DW-12.1: engine CHANGELOG *Added* (`Accessibility`, `AccessibleLabel`, `AccessibleLive`, `AccessibilityPriority`, `AccessibilityIssue`, `ScrollRect.scrollIntoView`, `EventSystem.focusRingColor/Width`, `PlayerHostOptions.title`, keyboard operation of Toggle/Slider/Scrollbar/Dropdown) and *Changed* (Tab owned by the browser while the twin is on; slider arrows always adjust — deviation from Unity; focus ring painted; Space no longer pauses the player on a focused twin control; a DOM subtree `[data-we-a11y]` now exists beside the canvas — a measured-number note: UI-heavy frames gain the sync cost recorded in Phase 11).
- [ ] DW-12.2: author docs: naming controls, labelling images, live text, `announce`, `audit`, `debugView`, opting out, drag-only controls need a keyboard alternative.
- [ ] DW-12.3: ROADMAP N5 → `✅ <date> W<n>` + what landed; follow-up rows `⬜`: player `lang` (protocol field); Space-to-pause vs. engine-focused control with the twin off; accessible 3D objects; standalone InputField world-space placement; `owner hw`: manual NVDA/VoiceOver/TalkBack pass.

---
## Test Coverage
**Level:** 100% of new and changed routines.
## Test Plan
- [ ] Every DW above has a named test (`tests/KeyboardOperation`, `AccessibleName`, `FocusRing`, `AccessibilityTree`, `AccessibilityTreeLayout`, `AccessibilityFocus`, `AccessibilityInputField`, `AccessibilityAnnounce`, `ScrollIntoView`, `PlayerRuntime`, `PlayerHost`, `PlayerSmokeA11y`) or a recorded command output (DW-11.x).
- [ ] Dirty tests: control destroyed with a queued focus/activation; `Accessibility.enabled` toggled mid-frame; two `Application`s in sequence; focusin on a non-interactable element; announce with no document; 501-char message.
- [ ] Regression: the whole existing suite unchanged (UI, navigation, InputField, Dropdown focus, Canvas repaint, player tests).
- [ ] Manual: none by workers; real screen readers are the `owner hw` follow-up row.

## Assumptions
| Assumption | Confidence | Verify Before Phase | Fallback If Wrong |
|---|---|---|---|
| `preventDefault` on keydown (Enter) and keyup (Space) stops native button/checkbox activation in all three engines | medium | 6 (jsdom can't prove it) → 11 | keep the double-activation guard keyed on key events too (engine submit stamps like an assistive activation) and record it |
| Chromium/Firefox/WebKit expose the opaque-origin frame's DOM to Playwright `ariaSnapshot` via `frameLocator` | high | 11 | snapshot via `page.frames()[1].locator("body")`; never via page-level snapshot |
| Every UI graphic registers with its Canvas (so `_graphicList` covers Selectables and UIText) | high | 4 | walk the Canvas subtree with `getComponentsInChildren` only on structure rebuild |
| `jsdom` works under vitest 4 with the per-file environment comment | high | 4 | `happy-dom` (record the switch) |
| Bundle size budget absorbs the twin (~8–12 kB min) | medium | 4, 11 | raise the budget only with the measured number in the CHANGELOG, never silently |

## Decision Log
| Decision | Alternatives Considered | Rationale | Phase |
|---|---|---|---|
| Native elements (button, checkbox, radio, range, input) | ARIA roles on divs | first rule of ARIA; custom sliders not adjustable on iOS/Android SRs | 4 |
| Select-only combobox for Dropdown | native `<select>` | `<select>` opens a native popup duplicating the drawn list | 4 |
| Positioned transparent elements | visually-hidden (clipped) elements | touch exploration and SR focus boxes need real bounds (Flutter, Pixi) | 5 |
| Default on, opt-out | opt-in on Tab / placeholder button | opt-in is the documented failure mode (flutter#195585, pixijs#9761); procurement | 4 |
| `AccessibleLabel` component | field on `GameObject` | no hub/format change, serializes as any component, opt-in | 2 |
| Engine keeps keyboard; twin prevents native defaults; browser owns Tab | twin handles keys natively | one source of truth; fixes Shift+Tab; no double activation | 6 |
| DOM → engine queued to `EventSystem._update` | run callbacks in DOM handlers | deterministic frame order; no engine code in event handlers | 6 |
| Slider arrows always adjust | Unity: only when no neighbour | WCAG 2.1.1 / APG slider | 1 |
| jsdom devDependency | more hand-written fakes | DOM events/focus/attributes semantics are the subject under test | 4 |

---
## Notes
- Hub/loop files: `EventSystem.ts` (1, 3, 6, 9), `Selectable.ts` (1, 3, 6), `Canvas.ts` (3, 4), `Application.ts` (4), `PlayerHost.ts` (10). Phases 1 and 2 may run as a wave only if Phase 1's Full gate runs alone afterwards — simplest: run them serially. Phases 8 and 9 (both Standard, disjoint) may run as a wave; Phase 10 may join them.
- Each Full-gate review must re-run DW-4.3 (quiet frame = 0 writes) and DW-6.2 (one click per key) itself.
- Research decisions D-1 … D-16 are binding; the build records deviations in "Decided During Build".
---
## Decided During Build
_Filled by /code-foundations-build — one row per decision an agent made or question it raised:_
| # | Phase | Decision or question | Source | Status |
---
## Execution Log
_To be filled during /code-foundations-build_
