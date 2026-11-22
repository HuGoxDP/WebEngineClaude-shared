# Build notes: C4r8 — every script of a scenario is available on the platform

**Worker:** W3 (build slot) · **Date:** 2026-11-22 · **Plan:** `plan.md` (📐, built as written)
**Bases:** WebEngineTS `73c96a6` (branch cut; `origin/master` moved to `8b1632e` mid-build, merged at the phase boundary), WebEngineTSEditor `a1f8619`, ScenarioCreator `4eaaf2c` (read-only, detached).
**Commits:** engine `609ec32` (+ merge `d66f5ad`), editor `ec4bb7d`.
**Coder discipline:** no builds/tests run (hard constraint — verifier runs the gates). Correctness argued by static trace + graphify + reading existing tests; the only executions were tiny Node probes of the module system and the check's grep logic, not engine gates.

## Phase 1 — Engine (Full gate), Skill cc-defensive-programming (APPLIER)

**Files:** `WebEngineTS/src/engine/core/scenario/Scenario.ts`, `WebEngineTS/tests/ScenarioScriptRegistration.test.ts` (new).

### What/why, traced to decisions
- **D-1 (import every script before awake):** new private `_importRemainingScripts()` (Scenario.ts :1096-1109 after merge; call site :586), called in `run()` between `_loadEntryPoint()`/`_systemSetResultSink` and `_entryPoint._systemInit(context)` — exactly the plan's slot. It imports every `_scriptBlobUrlMap` entry except `scripts/<manifest.entryPoint>`. No manifest field; `_importScriptModule` untouched (plan OUT).
- **D-2 (order, once-only):** entry first (unchanged `_loadEntryPoint`), remainder `[...map.keys()].filter(p => p !== entryPath).sort()` — sorted key order, sequential `await` in a for-loop so evaluation order is deterministic. Modules in the entry's graph are cached by the module system (same Blob URL identity from the pre-linker), so no double evaluation — the pre-linker maps each ZIP path to exactly one Blob URL and rewrites relative imports to those same URLs (`_createRewrittenBlobUrl`), so entry-graph modules and the sweep hit the identical URL.
- **D-3 (failure isolation):** per-import try/catch; on failure one `console.error(`[Scenario] Script "${path}" failed to load: ${message}`)` (message = `error.message` for `Error`, else `String(error)`), then continue. Entry keeps its hard failure (untouched `_loadEntryPoint`). Defensive-programming checks: no empty catch (logs by path), no assertions on runtime input (a throwing script is anticipated external input → error handling, not assertion), consistent with the file's existing `console.error("[Scenario] …")` logging convention; failure strategy = log-and-skip, matching D-3's rationale (such files were never evaluated before, hard-failing would break scenarios that run today).
- **Contract comments:** the :572-574 comment ("entry module … has registered the component classes") rewritten to the new contract; `run()` JSDoc now lists step 5 and an `@remarks` naming Unity parity (every `Assets/` script compiled into the player).

### DW coverage map (Phase 1)
| DW | Test (tests/ScenarioScriptRegistration.test.ts) | Assertion |
|---|---|---|
| DW-1.1 | "DW-1.1: a scene component whose script nobody imports resolves…" | ZIP entry imports nothing; `scripts/library/Spin.js` declares `@Serializable` `ScriptReg1.Spin`; entryScene names it. After `run()`: no `MissingComponent` on Holder, `TypeRegistry.get` non-null, component ctor present. |
| DW-1.2 | "DW-1.2: addComponent by type name inside the entry's awake…" | entry's `awake()` does `TypeRegistry.get("ScriptReg2.Spin")` + `addComponent(ctor)`; test asserts awake saw the class (`globalThis.__c4r8Awake === ctor`) and the object holds it → registration precedes awake. |
| DW-1.3 | "DW-1.3: entry graph first, then the rest in sorted path order…" | modules push their path to `globalThis.__c4r8Order`; expected `[util, main, a, library/Spin, z]`; util appears once (cached). |
| DW-1.4 | "DW-1.4: a broken non-entry script is logged once by path…" | `Broken.js` throws at top level before registering; exactly one `console.error`, message matches `^\[Scenario\] Script "scripts/library/Broken\.js" failed to load: ` and contains `boom`; scenario `isRunning`; scene's `ScriptReg4.Broken` is `MissingComponent` with `originalType`; sibling `Good.js` still resolves. |
| DW-1.5 | not a new test — verifier runs the named suites unchanged + typecheck/test/build | no existing test was edited or weakened; count before/after belongs to the verifier's gate run. |

### Fixture design (built the same way as ScenarioEntryScene.test.ts)
Real ZIP → `loadFromData` → real manifest validation, pre-linking, asset source, `run()`, `_loadEntryScene`. Two Node seams, both test-side (no engine change):
1. `URL.createObjectURL` mocked to return `data:text/javascript,<encoded rewritten source>` — Node cannot import `blob:` URLs (`ERR_UNSUPPORTED_ESM_URL_SCHEME`, probed), but imports `data:` URLs natively and caches them per URL (probed: same URL imported twice evaluates once; nested relative-import → data URL chain works). The mock preserves the pre-linker's rewritten source verbatim, so import-graph identity/caching behaves like the browser's.
2. Scripts get engine classes from a `globalThis` bridge instead of `import … from "WebEngineTS"`: a native `data:` module is externalized by vite's module runner and cannot import the vite-transformed TS sources. `Serializable({...})(class extends Behaviour {})` is exactly the call tsc emits for `@Serializable` (legacy decorators, tsconfig `experimentalDecorators`), i.e. the shape ScenarioCreator's compiled ZIP holds. The entry's default export extends the *same* `ScenarioBehaviour` class instance the test imports, so the brand check in `_loadEntryPoint` passes without mocking `_loadEntryPoint` — unlike ScenarioEntryScene.test.ts, the real import path runs.

### Failing-first reasoning (red on base c4a0119 / 73c96a6 — quoted, not checked out)
Base `git show origin/master:src/engine/core/scenario/Scenario.ts` (73c96a6 = merged master containing c4a0119's load path), run():
```
            // Load and instantiate the entry point
            this._entryPoint = await this._loadEntryPoint();
            this._entryPoint._systemSetResultSink(result => this._deliverResult(result));
            // Awake — the scenario builds its world here (may be async)
            await this._entryPoint._systemInit(context);
            // The manifest's own scene, after awake: the entry module (and
            // whatever awake imported) has registered the component classes the
            // scene names.
            await this._loadEntryScene();
```
No other `import()` of scripts exists on the run path (`_importScriptModule` serves only `context.importScript`; the fixtures never call it). Therefore on base:
- DW-1.1: `ScriptReg1.Spin` never registers → `_attachComponent` warns `Unknown component type` and attaches `MissingComponent` → `getComponent(MissingComponent)` non-null → **red**.
- DW-1.2: awake's `TypeRegistry.get` returns null → `__c4r8Awake = null ≠ ctor`, no `FromAwake` object → **red**.
- DW-1.3: only the entry graph evaluates → order is `[util, main]`, missing `a/library/Spin/z` → **red**.
- DW-1.4: `Broken.js` never imported → zero `console.error` from the sweep; test demands exactly one → **red** (the MissingComponent part passes on base too, as D-3 requires — that is the compatibility anchor).

### Deviations / notes
- Plan said DW-1.1 "fails on c4a0119"; branch was cut at `73c96a6` per dispatch (current origin/master, same load path). Quoted base code above is `73c96a6`.
- SER1 merged to origin/master mid-build (`8b1632e`); merged into the task branch at the phase boundary (RULES step 10), no conflicts, junk check clean.
- Test file declares `var __c4r8Awake/__c4r8Order` via `declare global` for strict typecheck; each fixture's module sources carry per-test tags/type names so Node's per-URL module cache cannot leak evaluation between tests.

## Phase 2 — Editor check (Standard gate), Skill aposd-verifying-correctness

**File:** `WebEngineTSEditor/app/e2e/scenariocreator-check.mjs` (7 lines added, after the existing MATCH check, inside the per-fixture block).

- **D-4 implemented as prescribed:** `const unknownTypes = [...new Set([...out.matchAll(/Unknown component type "([^"]+)"/g)].map(m => m[1]))]` over the `verify-render.mjs` stdout, then `check("no component went missing on the platform", unknownTypes.length === 0, …)` — a FAIL names every unknown type; `failed > 0` makes the script exit non-zero (existing final `process.exit`). Applies to every fixture. Existing Library flow unchanged: on the new engine the wizard's Library-added Rotator resolves, no warning, check passes (DW-2.1 — verifier confirms with `objects=2` + Rotator output). Editor script loading untouched (plan OUT).
- Static verification performed (allowed): `node --check` → SYNTAX_OK; grep logic probed with a synthetic verify-render line — `[SceneSerializer] Unknown component type "Bogus.Ghost"` extracts `["Bogus.Ghost"]` and FAILs naming it; clean output PASSes. DW-2.2/DW-2.3 need real runs (verifier, inside `editor-e2e.lock`).

### ⚠ OPEN QUESTION for the Lead/owner — DW-2.2 cannot fire with today's ScenarioCreator (parked, not guessed around)
Research D-4 says the check "greps the verify-render output for `Unknown component type`". Static trace of ScenarioCreator `verify-render.mjs` @ `4eaaf2c` (unchanged on its origin/master) shows that string can never reach that stdout today:
- the engine emits it as `console.warn` **inside the browser page** (`SceneSerializer._attachComponent`, Scenario.ts graph community; `src/engine/core/serialization/SceneSerializer.ts:2788`);
- the browser is spawned with `stdio: "ignore"` (verify-render.mjs:268) and results return by `POST /result` carrying only `{renderer, results:[{scenario, mode, loadMs, manifestId, entryPoint, timeToFirstFrame, scene:{roots, gameObjects}, ok, error}]}` — no console capture, no component types;
- therefore the new check is a correct tripwire but currently inert: it will PASS even with a deliberately broken type name injected (DW-2.2 stays red).

The plan's File scope (editor check only) does not cover forwarding page warnings, so per 📐 discipline I implemented the prescribed grep verbatim and STOP on this point instead of widening scope. **Recommendation:** a follow-up task in ScenarioCreator (`verify-render.mjs`: capture page `console.warn` via CDP `Log.enable`/`Runtime.consoleAPICalled` or a harness-side `console.warn` shim into the POST payload, print forwarded warnings) would make D-4 observable and let DW-2.2 go green. Alternatively the Lead may re-scope Phase 2. Recorded in the report; no ATTENTION write from the build slot (lead owns the owner channel for this run).

## Verification performed by the coder (quotes)
- `node --check app/e2e/scenariocreator-check.mjs` → `SYNTAX_OK`
- grep probe → `extract: ["Bogus.Ghost"] FAIL — Bogus.Ghost` / `clean: PASS`
- Node module probes → `blob import FAIL ERR_UNSUPPORTED_ESM_URL_SCHEME`; `data import ok 1`; `nested data import ok ["util","entry"] 1`; `eval count 1`
- Engine branch: `git diff --name-only origin/master...HEAD` → `src/engine/core/scenario/Scenario.ts`, `tests/ScenarioScriptRegistration.test.ts`; editor → `app/e2e/scenariocreator-check.mjs`; `git status --porcelain` empty in both after commit.
- No `npm run typecheck/test/build`, no vitest/tsc, no e2e — per hard constraint; verifier runs Full (engine) and Standard (editor) gates.

## Remaining
- Verifier gates (engine Full; editor Standard inside `editor-e2e.lock`, after Phase 1 merge + `npm run release:local`), DW-1.5/DW-2.1–2.3 evidence.
- Phase 3 (docs, CHANGELOG, ENGINE-GAPS G6 Closed, report.md) — not this slot.
- DW-2.2 blocked on the open question above.
