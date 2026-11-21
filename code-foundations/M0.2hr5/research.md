# M0.2hr5 research — case-5 coverage hole + stale "Kepler pattern" claims + field-comment truth

Date 2026-11-19, W3. Source: ROADMAP row M0.2hr5 (E, S; ¼ h; Claude review of M0.2h).
Engine worktree HEAD `07f81d6` (merge of M0.2hr2; 3026 tests in 185 files at claim time).
Shared worktree HEAD `88f9e69`. All line numbers verified against those HEADs.
Claim: `claims/M0.2hr5` = `41fceff`, branch `M0.2hr5-verification-doc-fixes` in both repos.

## 1. The case-5 bug — confirmed, but the prescribed mutation check is FALSIFIED

`code-foundations/V1/setters-m02h.js:13-15` (whole file is 21 lines, 5 cases):

```js
mk("inactiveAssign+reactivate", new Vector3(0, 4, 0), g => { inactive = g;
  g.setActive(false);
  g.addComponent(MeshFilter).mesh = Mesh.createCube(2);
  g.addComponent(MeshRenderer).sharedMaterial = mat(); });
inactive.setActive(true);
```

Components are added **after** `setActive(false)`, so `onAwake` is deferred to
activation and reads the already-assigned mesh — a wake-time read, the same
mechanism case 3 (`mesh+sharedMat`, :11) exercises. It never exercises
"renderer awake with no mesh, mesh arrives later".

Real Kepler order — `ScenarioCreator/Scenarios/Kepler/scripts/helpers/SweptArea.ts`:
- :47-49 `go.addComponent(MeshFilter); go.addComponent(MeshRenderer).sharedMaterial = material; go.setActive(false);`
- :91-92 `this._slots[slot].getComponent(MeshFilter)!.sharedMesh = mesh; this._slots[slot].setActive(true);`

Note Kepler assigns **`sharedMesh`**, not `.mesh`. The rewritten case must use
`sharedMesh` to be the real pattern.

### Measured: deleting `MeshRenderer.onEnable` re-sync does NOT fail case 5 — old OR rewritten

`MeshRenderer.onEnable` (`src/engine/core/rendering/MeshRenderer.ts:98-101`) is
`super.onEnable(); this.updateMesh();`. But the **push notify** already syncs
while inactive: `set sharedMesh` (MeshFilter.ts:52) → `_notifyRenderer()`
(:128-130) → `updateMesh()` (MeshRenderer.ts:176-187), which has **no
active-state gate** — only `_threeMesh === null` (nulled in `onDestroy` only,
:112). `Renderer.onDisable` (Renderer.ts:511-513) is visibility-only. So the
assign-while-inactive write syncs geometry immediately; `onEnable` re-sync is a
**redundant second safety net** for this pattern, not the load-bearing path.

Executed at research time (scratch bundles in
`C:/Users/HuGox/AppData/Local/Temp/opencode/w3/hr5-research/`, engine source
untouched; base = worktree dist built 2026-11-19T20:41:52Z from hr2-era HEAD;
mutants = one-string `sed` edits of the minified bundle, each verified by grep
count before running):

| Bundle mutation | old probe (5 cases) | new probe (case 5 = Kepler order) |
|---|---|---|
| none (base) | 5/5 DRAWN | 5/5 DRAWN |
| `onEnable(){super.onEnable(),this.updateMesh()}` → `onEnable(){super.onEnable()}` | 5/5 DRAWN | **5/5 DRAWN** |
| `_notifyRenderer(){…updateMesh()}` → `_notifyRenderer(){}` | — | case 4 `not drawn rgb(0,0,0)`, case 5 DRAWN (onEnable catches it) |
| **both** of the above (≈ pre-M0.2h wake-time-only reads) | — | cases 4 **and 5** `not drawn rgb(0,0,0)` |

Raw outputs: `base-run.txt`, `mutant-run.txt`, `base-5case.txt`,
`mutant-5case.txt`, `base-old-probe.txt`, `mutant-old-probe.txt`,
`mutant-notify-5case.txt`, `mutant-both-5case.txt` in the same directory.

Conclusions:
1. The ROADMAP prediction "would pass even with onEnable re-sync deleted" is
   true — and stays true for the **rewritten** case 5. That is not a coverage
   hole in the rewrite: the notify push IS the M0.2h fix for this pattern
   (root causes #1-#3 in `M0.2h/report.md`); `onEnable` re-sync (root cause #4)
   is defense-in-depth for case 5: neither single-mechanism deletion fails
   case 5 while the other mechanism lives (notify-only deletion does fail
   case 4 — table above).
2. The rewritten case 5 is still a genuine regression probe: under
   wake-time-only behavior (both mechanisms deleted — the pre-M0.2h world) it
   FAILS, while the old case 5 passes. **The mutation check must delete BOTH
   the notify body and the onEnable re-sync**, not onEnable alone. This
   deviation from the task card's prescribed check is lead-visible here and in
   the plan; measurements above are the evidence.
3. The unit tests `tests/MeshFilterMesh.test.ts:153` ("a mesh assigned while
   inactive draws on activation") and `:168` (setter variant) already use the
   real Kepler order — the pixel probe was the only place with the wrong order.

## 2. MeshFilter.ts:18 comment — verified false, correction is true

`src/engine/core/rendering/MeshFilter.ts:18`:
`/** This filter's own copy, made on the first write through {@link mesh}. */`

Actual semantics at this HEAD:
- `get mesh` (:67-83): clones `_sharedMesh` into `_meshInstance` on the **first
  read** (:75), notifies (:77).
- `set mesh` (:85-96): stores the reference into `_sharedMesh` (:93, comment
  :91-92 "instancing happens on the first *read* through the getter, not
  here"); self-assign keeps the instance (:86-88).

So the copy is made on the first **read**. Fix: "made on the first read of
{@link mesh}". The property JSDoc (:55-65) already states this correctly —
only the private field comment is stale (pre-M0.2h the setter cloned).

## 3. Stale claim locations — verified verbatim

- `code-foundations/M0.2h/report.md:76-77`: "**5/5 DRAWN** — the 4 original V1
  cases + inactiveAssign+reactivate (the Kepler SweptArea pattern)".
- `code-foundations/V1/notes.md:110`: correction note "(…assign-while-inactive
  + reactivate; fixed by M0.2h…)" — pattern description itself is fine, but
- `V1/notes.md:123-124`: "case 5 — the SweptArea pattern, `mesh` assigned while
  `setActive(false)` then reactivated — also DRAWN" — wrong order, wrong setter.
- `V1/notes.md:132` table row: "inactive: `filter.mesh = m` + renderer, then
  `setActive(true)` | (broken in Kepler) | DRAWN".
- `ROADMAP.md:66` (M0.2h cell tail): "pixel re-check 5/5 DRAWN incl. the Kepler
  SweptArea pattern".

Historical honesty requirement: the original case 5 was a wake-time-read
duplicate of case 3's mechanism; hr5 rewrites it and re-verifies. The docs must
say so, not silently restate 5/5 as if it had covered Kepler all along.

## 4. Harness invocation + prerequisites — verified present

`code-foundations/V1/run.mjs` (50 lines):
- Usage :2 `node run.mjs <zip> <probe.js> [--gpu] [--shots dir] [--wait ms]`,
  plus `--engine <path>` (:15, default `<root>/WebEngineTS/dist/WebEngineTS.standalone.js`),
  `--w/--h` (:16, default 1280×800), `--scale`, `--logs`.
- Root :9 = three levels up from `V1/` → workspace root; Playwright resolved
  via `createRequire(<root>/virtual-lab/e2e/package.json)` (:10-11).
- Server :25-31: local http, port 0, serves page + `/engine.js` + `/s.zip`.
- Browser :33-35: `chromium.launch({ channel: "msedge", headless: true })`,
  SwiftShader flags unless `--gpu`.
- Probe protocol :44-48: probe body wrapped in `async (page, shot)`, its
  return value printed as JSON — "DRAWN" is the probe's own pixel verdict
  (`setters-m02h.js:19`: magenta test `r>200 && b>200 && g<80` on the centre
  pixel via `app.captureFrame`), not a harness keyword.

M0.2h invocation (from `V1/notes.md:118-122`): scenario
`solar-system-scenario.zip`, SwiftShader, `--engine <worktree bundle>`.

Prerequisites checked at research time:
- `ScenarioCreator/ReleaseScenarios/solar-system-scenario.zip` — exists.
- `virtual-lab/e2e/node_modules/playwright` — loads, version **1.62.1**.
- Edge: `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe` — exists.
- Worktree `dist/WebEngineTS.standalone.js` — exists, git-ignored,
  `builtAt 2026-11-19T20:41:52.509Z` (hr2-era). HEAD `07f81d6` includes
  hr1+hr2; rebuild in P1 anyway so the bundle provably matches HEAD.
- Worktree `node_modules/.bin/vitest` — present (gates runnable).
- Four live harness runs already executed successfully at research time
  (table above) — browser + server + ZIP path all proven working.

## 5. Scope guards

- Engine source change is ONE comment line (`MeshFilter.ts:18`). No behavior
  change; suite expected unchanged at 3026/3026 (185 files).
- No `release:local` (M0.2h report's open item stays open; consumers own their
  bumps via A10b / M1.2).
- ScenarioCreator NOT in scope (repos E, S only); SweptArea.ts read-only evidence.
- `setters.js` (original 4-case probe) untouched — historical artifact.
- Mutation testing runs on **scratch copies of the minified bundle** in the
  temp dir, never on engine source; source-level mutation (comment out
  `this.updateMesh()` in onEnable + the `_notifyRenderer` body, rebuild, run,
  restore exactly) is the build-phase variant the review re-executes.
