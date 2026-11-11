# Plan: R9 — performance telemetry (anonymous per-session aggregates)
**Created:** 2026-11-11 (Claude, architect lane)
**Status:** ready
**Complexity:** moderate
**Review cadence:** per phase
**Check-ins:** quiet
---
## Context
The platform already records anonymous scenario sessions (launch, duration). R9 adds how well the
scenario ran on the student's machine — time to running, frame-rate percentiles, a coarse GPU class,
core/memory buckets — to the same session row, with bounded retention, and shows moderators the
per-scenario and per-hardware picture that decision #4 (student hardware budgets) is waiting for.
Research, facts with line numbers and every decision: `code-foundations/R9/research.md` — **read it
first; its Decisions (D-1 … D-10) are binding.** Base: virtual-lab `main` `95a8803`, after B6 merges
(merge `origin/main` before starting — B6 touches `server.js`, `rate-limits.js`, `dashboard.js`,
`route-table.test.js`).

**Success criteria:**
1. A student session that ran ≥ 15 s ends with every D-2 field filled (e2e on the lab stack).
2. Garbage in any field is stored as NULL and the session still closes (integration tests).
3. Moderators see the per-scenario fps columns and the hardware table; authors and anonymous get 403/401.
4. Detail older than `TELEMETRY_DETAIL_DAYS` is nulled; counts and durations stay.
5. backend unit + Postgres suite (in `vl-db.lock`), `ng test`, `ng build`, browser e2e green.

## Constraints
- virtual-lab only (+ the task's `.claude-shared` notes). No engine change, no player-protocol change (D-10).
- Only the D-2 fields leave the browser; no renderer string, no screen size, no free text (decision #27).
- Telemetry never throws to the student (`docs/code-standards.md:107`); every new client path is
  wrapped like `telemetry.service.ts` already is.
- Never weaken a test; anything this plan does not answer is a question: park (ATTENTION), do not guess.

---
## Implementation Phases

### Phase 1: Schema, validation, end-with-body, retention (backend)
**Skills:** code-foundations:cc-defensive-programming
**Model:** sonnet
**Gate:** Full
**Depends on:** none
**File scope:** backend/migrations/014_session_performance.sql, backend/telemetry-input.js, backend/telemetry-retention.js, backend/routes/telemetry.js, backend/server.js, backend/config.js, .env.example, backend/test/unit/telemetry-input.test.js, backend/test/integration/telemetry-performance.test.js

**Goal:** the end beacon stores validated performance fields; old detail is pruned.

**Scope:**
- IN: migration 014 — nullable columns per D-2 (`engine_version VARCHAR(60)`,
  `time_to_running_ms INTEGER`, `fps_p50 REAL`, `fps_p05 REAL`, `fps_samples INTEGER`,
  `gpu_class VARCHAR(16)` with a `CHECK (gpu_class IN (...))`, `cpu_cores SMALLINT`,
  `device_memory_gb REAL`, `is_mobile BOOLEAN`, `context_lost BOOLEAN`) and an index on
  `started_at` already exists — add none unless a query plan needs it. `telemetry-input.js` —
  `parsePerformance(body)` → object of D-2 fields, each validated by its own rule (type, range,
  regex, enum; `fps_p05 ≤ fps_p50` else both null), invalid → null, unknown keys ignored, non-object
  body → all null. `routes/telemetry.js` end route: `express.json({ limit: '2kb', type:
  'application/json' })` on the route, `UPDATE … SET <fields> …` in the same statement as today's
  close (still `WHERE ended_at IS NULL`, still 204 always; a 413/parse error still closes the
  session with nulls — catch the body-parser error on this route). `telemetry-retention.js` —
  `pruneTelemetryDetail(pool, days)` nulls D-6's columns (and `user_agent`) where
  `started_at < NOW() - days` and returns the row count; `server.js` calls it at start and every
  24 h (`setInterval(...).unref()`), logging the count; skipped when `NODE_ENV === 'test'`.
  `config.js` reads `TELEMETRY_DETAIL_DAYS` (int ≥ 1, default 180); `.env.example` documents it.
- OUT: summary/hardware queries (Phase 2), frontend.

**Edge cases:** `text/plain` empty beacon (old frontend) → closes as today; body `null`, array,
string; `NaN`/`Infinity` arrive as `null` in JSON — treat as missing; `cpu_cores` not a bucket value
→ null (the client buckets, the server only accepts buckets); a replayed end with a body for a
closed session changes nothing.

**Done when:**
- [ ] DW-1.1: unit tests: `parsePerformance` accepts one valid body exactly, and for every field one out-of-range, one wrong-type and one missing case yields null for that field only; `fps_p05 > fps_p50` nulls both; an unknown key is dropped.
- [ ] DW-1.2: integration (Postgres): start → end with a valid JSON beacon body → the row holds every field; end with garbage → closed, fields null; end with `text/plain` empty → closed, fields null (today's path unchanged); end with a 3 kB body → closed, fields null; second end → row unchanged.
- [ ] DW-1.3: integration: `pruneTelemetryDetail(pool, 180)` on rows aged 181 and 179 days nulls only the old row's D-6 columns and its `user_agent`, keeps `duration_ms`/`ended_at`, returns 1.
- [ ] DW-1.4: `audit.test.js` "telemetry writes nothing" still passes unchanged; the existing `archives-and-telemetry.test.js` telemetry tests pass unchanged.

### Phase 2: Read side — summary columns and hardware endpoint
**Skills:** code-foundations:cc-defensive-programming
**Model:** sonnet
**Gate:** Standard
**Depends on:** 1
**File scope:** backend/routes/telemetry.js, backend/test/integration/telemetry-performance.test.js, backend/test/integration/route-table.test.js, docs/telemetry.md

**Goal:** moderators can read the per-scenario and per-hardware picture (D-7).

**Scope:**
- IN: summary rows gain `medianFps`, `lowFpsShare` (0…1, sessions with `fps_p05 < 30` over sessions
  with `fps_p05` not null; null when none), `medianTimeToRunningMs`. `GET /api/telemetry/hardware?days=`
  (moderator; `days` clamped 1…365 like summary): rows `{ gpuClass, isMobile, sessions, medianFps,
  lowFpsShare, cores: {bucket: count}, memoryGb: {bucket: count} }`; groups with < 5 sessions merge
  into `{ gpuClass: 'other', isMobile: null }` (D-7). `docs/telemetry.md` per D-9: fields, sources,
  retention, never-collected list, the two read endpoints.
- OUT: UI.

**Done when:**
- [ ] DW-2.1: integration: seeded sessions (three gpu classes, one with 3 sessions) → hardware rows as computed by hand in the test, the 3-session class folded into `other`; summary's new columns match hand-computed values; `days` outside 1…365 clamped.
- [ ] DW-2.2: `route-table.test.js` gets `GET /api/telemetry/hardware` with `allowed: MODERATORS` (the existing pattern at `:164`); anonymous 401, author 403.
- [ ] DW-2.3: `docs/telemetry.md` exists and names every column of migration 014 (a unit test greps the migration's column names in the doc, so a new column without a doc line fails).

### Phase 3: Client — collect, bucket, send
**Skills:** code-foundations:cc-defensive-programming, code-foundations:cc-routine-and-class-design
**Model:** sonnet
**Gate:** Full
**Depends on:** 1
**File scope:** frontend/src/app/services/telemetry.service.ts, frontend/src/app/services/telemetry.service.spec.ts, frontend/src/app/services/performance-sampler.ts, frontend/src/app/services/performance-sampler.spec.ts, frontend/src/app/services/device-class.ts, frontend/src/app/services/device-class.spec.ts, frontend/src/app/pages/viewer/viewer.component.ts, frontend/src/app/pages/viewer/viewer-lifecycle.spec.ts, frontend/src/app/player/player-config.ts

**Goal:** the viewer measures the session per D-2/D-4 and the end beacon carries it.

**Scope:**
- IN: `performance-sampler.ts` — `PerformanceSampler` (pure, clock injected): `markLoadStart()`,
  `markRunning()`, `addFps(value)` (dropped while paused, hidden, or < 5 s after running; ring of
  7 200), `setPaused(b)`, `setVisible(b)`, `markContextLost()`, `summary()` →
  `{ timeToRunningMs, fpsP50, fpsP05, fpsSamples, contextLost }` (nearest-rank percentiles; < 10 samples
  → fps null). `device-class.ts` — `gpuClass(renderer: string | null)` (table-driven, D-3),
  `readGpuClass()` (throwaway 1×1 WebGL context, `WEBGL_debug_renderer_info`, then
  `WEBGL_lose_context`; any failure → `'unknown'`; cached per page), `coresBucket(n)`,
  `deviceMemory()`, `isMobile()`. `player-config.ts` exports `ENGINE_VERSION` (parsed from
  `ENGINE_URL`, so the existing spec that pins the URL to the dependency's version pins this too).
  `telemetry.service.ts` — `endSession(performance?)` sends `application/json` Blob via sendBeacon
  (fallback `fetch keepalive` with the same body); `startSession` unchanged. `viewer.component.ts`
  wires: `markLoadStart` at `runSource` start, `markRunning` where state becomes `running`,
  `onFps`/`onPaused`/`onContextLost` feed the sampler, `visibilitychange` listener (removed in
  `ngOnDestroy`), `readGpuClass()` after running, and every `endSession()` call passes the summary +
  device fields. A restart starts a fresh sampler.
- OUT: admin UI.

**Edge cases:** a session that never reached running sends no perf body (and no session exists —
`startSession` runs only after running, F-2); a restart mid-session ends the old session with its own
numbers; `pagehide` after `ngOnDestroy` sends nothing twice (the service already clears `sessionId`).

**Done when:**
- [ ] DW-3.1: sampler spec with a fake clock: warm-up, paused and hidden samples excluded; 9 kept samples → fps null; p50/p05 nearest-rank on a known list; ring keeps the last 7 200.
- [ ] DW-3.2: `gpuClass` spec: at least two real renderer strings per class (ANGLE Intel/AMD/NVIDIA, Apple M-series, Adreno, Mali, PowerVR, SwiftShader, llvmpipe, Microsoft Basic Render Driver), `null` → `unknown`, an unmatched string → `other`; `coresBucket` for 1, 3, 5, 7, 9, 13, 64.
- [ ] DW-3.3: telemetry service spec: the beacon body is `application/json` with exactly the D-2 keys (no renderer string anywhere in the payload — assert by key set), and a throwing `sendBeacon` is swallowed.
- [ ] DW-3.4: viewer-lifecycle spec: fps/paused callbacks reach the sampler; destroy sends one beacon with the summary; restart sends one for the old session and starts a new sampler.

### Phase 4: Admin card, e2e, docs (Minimal)
**Skills:** code-foundations:code-clarity-and-docs
**Model:** sonnet
**Gate:** Standard
**Depends on:** 2, 3
**File scope:** frontend/src/app/pages/admin/dashboard/dashboard.component.ts, frontend/src/app/pages/admin/dashboard/dashboard.component.html, frontend/src/app/pages/admin/dashboard/dashboard.component.spec.ts, frontend/src/app/services/admin-telemetry.service.ts, e2e/tests/student-golden-path.spec.ts, docs/test-plan.md, CLAUDE.md; .claude-shared: code-foundations/R9/notes.md, ROADMAP.md (R9 row), CHANGELOG.md (platform section)

**Goal:** moderators see it; the golden path proves it end to end.

**Scope:**
- IN: a "Продуктивність" card on the dashboard, rendered only for moderators: the hardware table
  and, per scenario, launches / median fps / low-fps share / median time to running for the last
  30 days; empty state text when no data. e2e: in `student-golden-path.spec.ts`, after the existing
  telemetry end, read the beacon's JSON body from the intercepted request and assert the D-2 key set
  and plausible ranges (fps > 0 on the lab stack's SwiftShader, `gpu_class` `software` there); run
  the scenario ≥ 15 s before leaving. `docs/test-plan.md` and `CLAUDE.md` name the new tests and
  `TELEMETRY_DETAIL_DAYS`.
- OUT: student-facing privacy page (D-9: follow-up row if one exists to extend).

**Done when:**
- [ ] DW-4.1: dashboard spec: moderator sees the card with mocked data; author does not; empty state.
- [ ] DW-4.2: browser e2e green on the lab stack (inside `vl-db.lock`), the golden path asserting the beacon body; full backend unit + Postgres suite, `ng test`, `ng build` green on one run.
- [ ] DW-4.3: ROADMAP R9 `✅ <date> W<n>` with the first hardware table rows seen on the lab stack; CHANGELOG platform entry; notes.md.

---
## Deviation rules
- A field that turns out not to be obtainable as specified (e.g. `deviceMemory` absent in the lab's
  Chromium) is sent as null — never replaced by a richer signal. A new field is a question.
- If B6 has not merged when this starts, stop at Phase 1's migration number check: take the next free
  number on `origin/main` at merge time and say so in notes.
