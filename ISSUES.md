# Open defects — visual review, 2026-09-05

Found by driving the scenarios in a browser. **One item per line**, so closing one is a
single-line deletion. Working file: delete it when empty, and do not let it grow into a second
plan — anything strategic belongs in [`PLAN.md`](PLAN.md).

**Rule for this list: an item is removed only after its fix is verified**, by a test, a screenshot,
or both. An unverified change leaves the item standing.

Severity: **A** wrong/misleading to a student · **B** broken interaction · **C** cosmetic ·
**F** feature request.

## Content — ScenarioCreator

- [ ] **A · AtomStructure shows only ~36 elements, not the full periodic table** — `Scenarios/AtomStructure/scripts/data/elements.ts`; 118 entries needed, each with shell configuration, category, mass and fact. Scope decision, not a defect.

## Needs a decision or clarification before it can be worked

- [ ] **? · "Планети перевёрнуті" in solar-system** — **not the north–south orientation**, checked 2026-09-05 by zooming the camera onto Earth: Africa sits upright, broad across the Sahara and narrowing to the south, with Europe above it and Madagascar off its coast. North is up. What is left is either the orbital/rotation direction, or an east–west mirror — and the latter is the open texture-UV convention (G4), which `design/coordinate-check/` deliberately does not cover ("this checks handedness only"). Needs one word from the reporter: is the complaint about the motion?
- [ ] **? · "Кеплер дивно виглядає"** — four faults have been found and fixed in it since: the third-law plot drawn across the readout instead of inside its own panel, the orange marker for the student’s own body missing from that plot entirely, the speed slider’s label written over its value, and a clipped toggle label. Worth another look before deciding whether anything remains.
- [ ] **? · DNA helix handedness and solar-system orbital direction** — derived as correct (right-handed B-DNA; prograde), and screenshots do not contradict it, but neither can be settled from a still frame. Needs eyes on the running scene.
