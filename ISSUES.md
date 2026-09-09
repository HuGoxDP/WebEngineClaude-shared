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

- [ ] **? · DNA helix handedness** — derived as correct (right-handed B-DNA), and screenshots do not contradict it, but it cannot be settled from a still frame. Look at the *near* face of the helix: the strands crossing it should run lower-left to upper-right. The solar-system half of this item is **closed** — orbits confirmed anticlockwise from the running scene, and the planets’ own orientation confirmed fixed. Axial rotation was found running the *other* way to the orbits and negated 2026-09-09; worth confirming in the same look.
