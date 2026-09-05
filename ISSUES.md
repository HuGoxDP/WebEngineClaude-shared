# Open defects — visual review, 2026-09-05

Found by driving the scenarios in a browser. **One item per line**, so closing one is a
single-line deletion. Working file: delete it when empty, and do not let it grow into a second
plan — anything strategic belongs in [`PLAN.md`](PLAN.md).

**Rule for this list: an item is removed only after its fix is verified**, by a test, a screenshot,
or both. An unverified change leaves the item standing.

Severity: **A** wrong/misleading to a student · **B** broken interaction · **C** cosmetic ·
**F** feature request.

## Engine — WebEngineTS

- [ ] **B · `LineRenderer.useWorldSpace` is stored and never read** — `src/engine/core/components/LineRenderer.ts:109`; vertices are always treated as local, and the default `true` is the opposite of what happens. Implementing it moves lines in any scenario with a transformed parent (DNA has one) — the default is a content decision.

## Content — ScenarioCreator

- [ ] **A · AtomStructure shows only ~36 elements, not the full periodic table** — `Scenarios/AtomStructure/scripts/data/elements.ts`; 118 entries needed, each with shell configuration, category, mass and fact. Scope decision, not a defect.
- [ ] **B · Circuits: charge carriers appear from nowhere on the wire** — `Scenarios/Circuits/scripts/Scenario.ts:228` `_drawCarriers`. **Three causes ruled out by inspection 2026-09-05:** the shared `_scale` is safe (`setInstanceTransform` bakes values immediately via `Matrix4x4.TRS`); `t` outside 0–1 is safe (`pointAlong` wraps with `((t % 1) + 1) % 1`); and the carrier budget does not starve later wires (5 wires x 26 max = 130 against `MAX_CARRIERS` 220). What remains, unconfirmed: `count` is derived from current, so moving a slider re-spaces every carrier at once — which is also physically odd, since current should change carrier *speed*, not density. **Needs the reporter to say whether the popping happens while a slider moves or on its own**; it cannot be reproduced headlessly, where the renderer manages about 1 fps.
- [ ] **C · Kepler: the T² vs a³ plot overlaps the text panel** — `Scenarios/Kepler/scripts/Scenario.ts`; the chart is drawn over the panel that explains it.
- [ ] **C · Kepler: the "Швидкість, частка кругової" slider label overlaps its value** — right-hand control panel; label and readout occupy the same line.
- [ ] **C · An empty info panel still paints its background** — bottom-left in Molecules and AtomStructure; the panel should hide when its text is empty.

## Needs a decision or clarification before it can be worked

- [ ] **? · "Планети перевёрнуті" in solar-system** — ambiguous between orbital direction (motion) and planet textures being upside down (the separate texture-UV convention, `WebEngineTS/design/unity-coordinates-plan.md`). Needs one word from the reporter: motion or picture.
- [ ] **? · "Кеплер дивно виглядає"** — beyond the two layout items above, unclear what else is wrong.
- [ ] **? · DNA helix handedness and solar-system orbital direction** — derived as correct (right-handed B-DNA; prograde), and screenshots do not contradict it, but neither can be settled from a still frame. Needs eyes on the running scene.
