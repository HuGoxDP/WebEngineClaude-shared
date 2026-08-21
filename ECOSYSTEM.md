# Shared context — the WebEngineTS ecosystem

Loaded into every repository's Claude session. **Keep it short**: every line here is paid for in
four sessions at once. Repo-specific detail belongs in that repo's own `CLAUDE.md`, not here.

## Who owns what

| Repo | Owns | Path |
|---|---|---|
| **WebEngineTS** | The engine, its docs, and (temporarily) the thesis article in `ClaudeDocs/` | `WebstormProjects/WebEngineTS` |
| **ScenarioCreator** | Scenario *content* and the CLI that packages it into ZIPs | `WebstormProjects/ScenarioCreator` |
| **WebEngineTSEditor** | The graphical scenario editor (`app/` Angular, `design/` mockup) | `WebstormProjects/WebEngineTSEditor` |
| **testv/virtual-lab** | The student platform: catalog, backend, db, nginx, docker | `WebstormProjects/testv/virtual-lab` |
| **WebEngineTS-Benchmarks** | The benchmark harness, paper scenes, RUNBOOK, recorded results | `WebstormProjects/WebEngineTS-Benchmarks` |

## The one rule that must not be broken

**Data flows one way: engine → tarball / standalone bundle → consumers.** The engine imports from
no consumer, ever. Scenario content, the authoring UI and the benchmark harness never live in the
engine repo.

Diagnostics are the exception worth knowing: `MemoryProfiler`, `Profiler` and `Benchmark` are
engine API — they are what a host *calls*. The harness that drives them is not. A consumer that
surfaces diagnostics must gate them behind an explicit opt-in.

## Getting an engine change into a consumer

Run `npm run release:local` **in WebEngineTS**. One command covers every consumer:

- **ScenarioCreator** and **testv/virtual-lab/frontend** — the packed tarball, then `npm install`.
- **WebEngineTSEditor/app** — skipped until it has a `node_modules/` (run `npm install` there once).
- **WebEngineTS-Benchmarks** — `engine/WebEngineTS.standalone.js` + `.d.ts` copied directly.
- The **basis transcoder** (`basis_transcoder.js` / `.wasm`) into virtual-lab and the benchmarks.

Nothing needs copying by hand. Verify which build is running with `BuildInfo.builtAt` /
`BuildInfo.version` rather than by grepping a bundle.

## Reporting something the engine cannot do

Do **not** work around it silently in a consumer. Write it up in that repo's list:

- `ScenarioCreator/docs/ENGINE-GAPS.md`
- `testv/virtual-lab/docs/upstream/webenginets.md`
- `WebEngineTS-Benchmarks/tasks/webenginets.md`

Each entry needs evidence — a file, a line, a measurement — and a note on what the consumer does
instead. The engine answers all three in `WebEngineTS/design/upstream-answers.md`.

**Re-verify before reporting or acting.** Of the nine entries once on those lists, six were
already fixed by the time they were re-checked. The lists describe the build they were written
against, and that build is usually old.

## What changed in the engine

`WebEngineTS/CHANGELOG.md` — one section per released version. Read it before assuming a
capability is missing. Anything that moves a measured number is under *Changed* and says so, so
the benchmark suite can tell whether it must re-measure.
