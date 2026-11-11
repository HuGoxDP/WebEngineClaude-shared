# M1.1 — the profiler out of `solar-system`

Card: ROADMAP `M1.1` — *"Take the profiler out of `solar-system`; re-publish"* (PLAN §4.10, owner,
2026-10-25). Branch `M1.1-solar-system-no-profiler` in `ScenarioCreator` (+ `.claude-shared`).

## What was removed

`Scenarios/solar-system-scenario/scripts/Scenario.ts` opened the engine's `MemoryProfiler` itself:
`showOverlay()` + `logReport()` in `awake()`, `logReport()` at "setup complete" and at the CPU
texture release, the `M`-key toggle, `hideOverlay()` in `onDestroy()`, and `M=Memory` in the help
line. The PLan's reasoning: the platform keeps the profiler off (so the calls are a no-op there),
and content should not open a developer overlay at all — the profiler is developed separately.

All of it is gone, including the `MemoryProfiler` import. The scenario's own logging (cache size,
release milestones, pause) stays, as do all keys except `M`.

## Rebuild and publish

- Rebuilt with the engine the release row expects: ScenarioCreator's dependency is the **v0.2.0
  release URL** (A11 moved it), so `npm install` pulled `0.2.0` from GitHub. (The worktree had
  drifted back to `file:WebEngineTS-0.1.0.tgz` with a stale local pack from an earlier
  `release:local`; `git checkout --` restored master's release dependency before branching.)
- `npm run build -- --scenario solar-system-scenario` → new archive;
  `node build-manifest.mjs --scenario solar-system-scenario` → new streaming manifest (7 lazy
  fallbacks unchanged, per SC-G2).
- Checks: `npm test` 17/17; `npm run build:all` + `npm run build -- --all --tests` +
  `npm run manifest:all -- --tests` + `npm run manifest:verify` all green (112 referenced files,
  0 problems).
- `npm run publish:release` + `npm run import:assets` into a lab stack **under `vl-db.lock`**
  (verification stack on 8046, own DB): the catalog row for `solar-system` points at the new
  archive (`70289666…`, 17.9 MB, HTTP 200) and the store serves `/a/solar-system.json` (200).

## Deviation recorded: the canonical 8044 catalog row

The canonical platform stack (port 8044) currently runs under **another worker's `ADMIN_TOKEN`**
(W3's; my publish there answers `403 Невірний токен`), so its `solar-system` row still points at
the old archive. The rebuilt archive and manifest are in the **shared** release directory
(`ReleaseScenarios` is a junction to the primary checkout), so the next platform-side
`npm run publish:release` from any worktree publishes the new archive with no further work.
Recorded in `.workers/ATTENTION.md`; the only step not performed is that row update, and it is
performed by whoever owns the 8044 stack next.
