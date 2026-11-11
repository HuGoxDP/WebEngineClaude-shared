# Research: R9 — performance telemetry (anonymous per-session aggregates)
**Date:** 2026-11-11 (Claude, architect lane)
**Base:** virtual-lab `main` `95a8803`; WebEngineTS `master` `2569fc4` (read only — no engine change)
**Decision:** #27 (delegated 2026-11-11): yes, minimal and anonymous — per-session aggregates only,
no account, no IP, no free-form strings, bounded retention. It also answers decision #4 (which
student hardware to budget for) from real sessions instead of a lab.

## What already exists (re-verified — most of the plumbing is there)

- F-1 **Session telemetry is live since 2026-08-01** (`docs/implementation-plan.md:292` "Phase 4 —
  Session telemetry … done"): table `scenario_sessions` (`backend/migrations/003_scenario_sessions.sql`:
  `id, scenario_id, client_id UUID, started_at, ended_at, duration_ms, user_agent VARCHAR(300)`, no FK
  to `scenarios` on purpose); routes in `backend/routes/telemetry.js`:
  `POST /api/telemetry/session` (public, rate-limited `telemetryLimiter`, 404 for an unknown scenario),
  `POST /api/telemetry/session/:id/end` (sendBeacon-friendly, idempotent `WHERE ended_at IS NULL`,
  duration computed server-side and clamped to 8 h, always 204), `GET /api/telemetry/summary?days=`
  (moderator: launches, completed, unique clients, median duration). Integration tests in
  `backend/test/integration/archives-and-telemetry.test.js:356-480`; `audit.test.js:133` pins that
  telemetry writes no audit event; `route-table.test.js:164` pins the summary's roles.
- F-2 Frontend: `frontend/src/app/services/telemetry.service.ts` — `startSession(scenarioId)` after the
  scenario reaches `running` (`viewer.component.ts:413`), `endSession()` via `sendBeacon` with an
  **empty `text/plain` body** on `ngOnDestroy` (`:243`), `pagehide` (`:482`) and before a new session.
  Failures are swallowed by rule (`docs/code-standards.md:107`).
- F-3 The player already streams what R9 needs, with no engine change: `fps` every
  `FPS_INTERVAL_MS = 500` ms (`WebEngineTS/src/player/player/PlayerRuntime.ts:56`, `:266-275`), relayed
  to `callbacks.onFps` (`viewer.component.ts:205`), plus `onPaused` (`:206`). Time to running is
  measurable host-side: `runSource` awaits `host.load(...)` (`viewer.component.ts:399`) and then sets
  state `running` (`:410`). `PlayerHost.measure()` exists (`PlayerHost.ts:200`) but is the admin
  test-run's tool (`test-run.component.ts:97`): it blocks for N seconds and is not for students.
- F-4 `server.js:28` `express.json()` parses only `application/json`; the current end beacon is
  `text/plain`, so a JSON beacon must be sent as `new Blob([json], { type: 'application/json' })` —
  same-origin, so no preflight (sendBeacon only forbids non-CORS-safelisted types cross-origin).
- F-5 Migrations: `backend/migrations.js` applies `migrations/*.sql` in name order; the newest on
  `main` is `013_scenario_versions_graded.sql`. B6 (W3, in flight) adds none so far but touches
  `server.js`, `rate-limits.js`, `dashboard.js`, `route-table.test.js` — hence R9 depends on B6.
- F-6 No scheduler exists in the backend (no `setInterval`/cron in `backend/*.js`); the `backup`
  service (P5a) runs nightly in its own container.
- F-7 The summary endpoint has no UI consumer (`git grep telemetry/summary frontend/src` is empty);
  the admin landing page is `frontend/src/app/pages/admin/dashboard/`.
- F-8 Already stored and therefore inside R9's privacy scope: `user_agent` (300 chars). It is the
  only free-form field; R9 adds none and bounds its retention.

## Decisions

- **D-1 Extend the existing session, do not add a second pipeline.** New nullable columns on
  `scenario_sessions` (migration `014_session_performance.sql`), filled by the existing end beacon,
  which now carries a JSON body. A session ended without a body (old cached frontend, closed tab
  before the first summary) keeps today's behaviour.
- **D-2 What is collected — numbers and closed enums only:**
  `engine_version` (`^\d+\.\d+\.\d+(-[0-9A-Za-z.]{1,40})?$`, from the frontend's `ENGINE_URL`
  version — the platform knows which engine it served), `time_to_running_ms` (int 0…600 000, host
  clock from `runSource` start to `running`), `fps_p50` and `fps_p05` (real 0…240, one decimal),
  `fps_samples` (int 0…100 000), `gpu_class` (enum below), `cpu_cores` (int bucket 1/2/4/6/8/12/16,
  from `navigator.hardwareConcurrency`, rounded **down** to the bucket), `device_memory_gb`
  (`navigator.deviceMemory`, already coarse in Chromium: 0.25…8; null elsewhere), `is_mobile`
  (`navigator.userAgentData?.mobile ?? matchMedia('(pointer: coarse)').matches`),
  `context_lost` (bool, from `onContextLost`). Nothing else; no screen size, no timezone, no
  renderer string.
- **D-3 GPU class, not GPU name.** The host page reads `WEBGL_debug_renderer_info`
  `UNMASKED_RENDERER_WEBGL` from a throwaway 1×1 WebGL context **once per page** and maps it with a
  pure, table-driven `gpuClass(renderer)` to one of: `intel`, `amd`, `nvidia`, `apple`, `adreno`,
  `mali`, `powervr`, `software` (SwiftShader, llvmpipe, Microsoft Basic Render), `other`, `unknown`
  (extension missing or context failed). Only the class leaves the browser. Integrated vs discrete is
  not attempted (the renderer string does not say it reliably).
- **D-4 FPS statistics exclude what is not the scenario's speed:** samples while paused
  (`onPaused`), while `document.visibilityState !== 'visible'`, and in the first 5 s after `running`
  (warm-up: shader compiles, texture uploads) are dropped; fewer than 10 kept samples → `fps_*` null.
  Samples are kept in a fixed-size ring (max 7 200 = one hour) so a long session costs bounded memory.
  Percentiles by nearest-rank on the sorted copy at session end.
- **D-5 Server validates per field, never rejects the end.** Each field outside its type/range
  becomes NULL; the update still closes the session (`204` always, as today). Unknown keys are
  ignored. Body limit: the route uses `express.json({ limit: '2kb' })` locally.
- **D-6 Retention:** `fps_*`, `time_to_running_ms`, `gpu_class`, `cpu_cores`, `device_memory_gb`,
  `is_mobile`, `context_lost`, `engine_version` **and the existing `user_agent`** are set to NULL for
  sessions older than `TELEMETRY_DETAIL_DAYS` (default 180); launch counts and durations stay
  (the deployment write-up needs them, F-1). Implemented as `pruneTelemetryDetail(pool, days)` in a
  new `backend/telemetry-retention.js`, called once at backend start and every 24 h by an
  `unref()`ed interval in `server.js` — the backend is a single process; documented.
- **D-7 Read side:** `GET /api/telemetry/summary` gains per-scenario `medianFps` (median of
  session `fps_p50`), `lowFpsShare` (share of sessions with `fps_p05 < 30`) and
  `medianTimeToRunningMs`; new `GET /api/telemetry/hardware?days=` (moderator) returns rows
  grouped by `gpu_class, is_mobile` with sessions, median `fps_p50`, `lowFpsShare`, and the cores/
  memory distributions — the table decision #4 needs. Groups with fewer than 5 sessions are folded
  into `other` (k-anonymity floor, so a rare device in one school is not singled out).
- **D-8 UI:** a "Продуктивність" card on the admin dashboard (moderators only) with the hardware
  table and the per-scenario fps columns; Ukrainian labels like the rest of the admin.
- **D-9 Transparency:** `docs/telemetry.md` lists every field, its source, its retention, and what is
  never collected; the student-facing "Про платформу"/footer text is out of scope (no such page
  exists to extend — record it as a follow-up `⬜` if the Report finds one).
- **D-10 No engine change**, no protocol change, no `measure()` use for students.

## Risks
- `UNMASKED_RENDERER_WEBGL` may be masked (Firefox resist-fingerprinting, Safari) → `unknown`; fine.
- A throwaway WebGL context on low-end devices costs a little: create it after `running`, lose it at
  once with `WEBGL_lose_context`, once per page load.
