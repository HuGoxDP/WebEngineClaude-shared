# Open defects — visual review, 2026-09-05

Found by driving the scenarios in a browser. **One item per line**, so closing one is a
single-line deletion. Working file: delete it when empty, and do not let it grow into a second
plan — anything strategic belongs in [`PLAN.md`](PLAN.md).

**Rule for this list: an item is removed only after its fix is verified**, by a test, a screenshot,
or both. An unverified change leaves the item standing.

Severity: **A** wrong/misleading to a student · **B** broken interaction · **C** cosmetic ·
**F** feature request.

## Engine — WebEngineTS

- [ ] **B · Dropdown's open list is drawn inside its own element, so it is overlapped by siblings instead of covering them** — `src/engine/core/ui/Dropdown.ts:24` states this as the design; the list must rise above neighbouring controls while open. Seen in Optics, where the option list collides with the slider labels below it.
- [ ] **A · `LineRenderer.startWidth`/`endWidth` do nothing** — `src/engine/core/components/LineRenderer.ts:142` hardcodes `linewidth: 1`, and WebGL ignores `linewidth` for `LineBasicMaterial` regardless; real width needs a ribbon mesh. Every line in every scenario is a 1 px hairline.
- [ ] **B · `LineRenderer.useWorldSpace` is stored and never read** — `src/engine/core/components/LineRenderer.ts:109`; vertices are always treated as local, and the default `true` is the opposite of what happens. Implementing it moves lines in any scenario with a transformed parent (DNA has one) — the default is a content decision.
- [ ] **C · `LineRenderer` ignores the engine `Material` system** — `src/engine/core/components/LineRenderer.ts:574` has `_syncMaterialToThree`/`_syncMaterialsToThree` commented out with a TODO, so `sharedMaterial` never reaches a line and colour comes only from `startColor`.
- [ ] **C · `LineRenderer` bypasses `_setInternalRenderObject`** — `src/engine/core/components/LineRenderer.ts:150` adds the Three object straight to the Transform, so `_internalRenderObject` stays `null` and the base `Renderer`'s shadow, visibility and `bounds` never apply to lines.

## Content — ScenarioCreator

- [ ] **A · AtomStructure shows only ~36 elements, not the full periodic table** — `Scenarios/AtomStructure/scripts/data/elements.ts`; 118 entries needed, each with shell configuration, category, mass and fact. Scope decision, not a defect.
- [ ] **B · Circuits: charge carriers appear from nowhere on the wire** — `Scenarios/Circuits/scripts/Scenario.ts:95` fixes `count = MAX_CARRIERS` on an `InstancedMeshRenderer`; instances beyond the ones in use are still drawn rather than parked.
- [ ] **C · Kepler: the T² vs a³ plot overlaps the text panel** — `Scenarios/Kepler/scripts/Scenario.ts`; the chart is drawn over the panel that explains it.
- [ ] **C · Kepler: the "Швидкість, частка кругової" slider label overlaps its value** — right-hand control panel; label and readout occupy the same line.
- [ ] **C · An empty info panel still paints its background** — bottom-left in Molecules and AtomStructure; the panel should hide when its text is empty.

## Needs a decision or clarification before it can be worked

- [ ] **? · "Планети перевёрнуті" in solar-system** — ambiguous between orbital direction (motion) and planet textures being upside down (the separate texture-UV convention, `WebEngineTS/design/unity-coordinates-plan.md`). Needs one word from the reporter: motion or picture.
- [ ] **? · "Кеплер дивно виглядає"** — beyond the two layout items above, unclear what else is wrong.
- [ ] **? · DNA helix handedness and solar-system orbital direction** — derived as correct (right-handed B-DNA; prograde), and screenshots do not contradict it, but neither can be settled from a still frame. Needs eyes on the running scene.
