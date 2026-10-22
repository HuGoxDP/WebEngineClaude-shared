# Shared context — the WebEngineTS ecosystem

Loaded into every repository's Claude session. **Keep it short**: every line here is paid for in
four sessions at once. Repo-specific detail belongs in that repo's own `CLAUDE.md`, not here.

## Who owns what

| Repo | Owns | Path |
|---|---|---|
| **WebEngineTS** | The engine and its docs | `WebstormProjects/WebEngineTS` |
| **ScenarioCreator** | Scenario *content* and the CLI that packages it into ZIPs | `WebstormProjects/ScenarioCreator` |
| **WebEngineTSEditor** | The graphical scenario editor (`app/` Angular, `design/` mockup) | `WebstormProjects/WebEngineTSEditor` |
| **testv/virtual-lab** | The student platform: catalog, backend, db, nginx, docker | `WebstormProjects/testv/virtual-lab` |
| **WebEngineTS-Benchmarks** | The benchmark harness, scenes, RUNBOOK, recorded results | `WebstormProjects/WebEngineTS-Benchmarks` |

**Setting up a machine:** from an empty `WebEngine` folder run `.claude-shared/workspace/clone-all.ps1`
(or `.sh`) — it clones every repo into the layout above (virtual-lab under `testv/`), installs,
and drops a root `CLAUDE.md` + `WebEngine.code-workspace` so the whole folder opens as one project.

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
- **WebEngineTSEditor/app** — the packed tarball, like the rest. Taking the engine *directory*
  instead loaded two THREE.js instances; don't go back to it.
- **WebEngineTS-Benchmarks** — `engine/WebEngineTS.standalone.js` + `.d.ts` copied directly.
- The **basis transcoder** (`basis_transcoder.js` / `.wasm`) into virtual-lab and the benchmarks.

Nothing needs copying by hand. Verify which build is running with `BuildInfo.builtAt` /
`BuildInfo.version` rather than by grepping a bundle.

## Reporting something the engine cannot do

Do **not** work around it silently in a consumer. Add a row to the shared index first —
`.claude-shared/ENGINE-GAPS.md`, open vs. closed, one line each — then write the full entry
(evidence, what's affected, workaround) in *your own* repo's list, using whichever of these
already exists there:

- `ScenarioCreator/docs/ENGINE-GAPS.md`
- `testv/virtual-lab/docs/upstream/webenginets.md`
- `WebEngineTS-Benchmarks/tasks/webenginets.md`

Each full entry needs evidence — a file, a line, a measurement — and a note on what the consumer
does instead. The engine answers all three in `WebEngineTS/design/upstream-answers.md`.

**Re-verify before reporting or acting.** Of the nine entries once spread across those lists, six
were already fixed by the time they were re-checked. The lists describe the build they were
written against, and that build is usually old.

## Where plans and history live

**One plan for every repo: [`PLAN.md`](PLAN.md).** New tasks go there, under their project — do not
start a per-repo `PLAN.md`/`TODO.md` again. It replaced five scattered plans on 2026-09-04.
**It carries open items only**: finished work is deleted from it and recorded in `CHANGELOG.md`.

**How to do a planned item: [`tasks/`](tasks/README.md)** — one card per task (files to read, steps,
tests, acceptance), the order, which model, and the owner decisions. Start any task from its card.

**One changelog: [`CHANGELOG.md`](CHANGELOG.md)**, a section per project. The single exception is
`WebEngineTS/CHANGELOG.md`, which stays because `package.json` ships it inside the npm tarball —
that one is the engine's release notes, this one is the cross-project record.

Neither is `@`-imported: they are read on demand, so they cost nothing per session. Deep design
documents stay in their own repos and are indexed at the end of `PLAN.md`.

## What changed in the engine

`WebEngineTS/CHANGELOG.md` — one section per released version. Read it before assuming a
capability is missing. Anything that moves a measured number is under *Changed* and says so, so
the benchmark suite can tell whether it must re-measure.
