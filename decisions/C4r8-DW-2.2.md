# C4r8 DW-2.2 — how the "unknown component type" check sees page warnings

Decided by the Claude pass 2026-11-23 (delegated, provisional). Question parked in `lead-we-heartbeat.json`
and `.workers/ATTENTION.md` (2026-11-22), now OWNER-DECISIONS #28.

- **Options:** A1 — capture the page console in the editor's own e2e run and feed it to the existing
  `unknownTypes` check; B — make ScenarioCreator `verify-render.mjs` forward page warnings (cross-repo);
  C — leave the check inert and waive DW-2.2.
- **Evidence:** the engine reports an unknown type as `console.warn` inside the page
  (`SceneSerializer.ts:2788`); `verify-render.mjs:268` spawns the browser with `stdio: "ignore"` and its
  `POST /result` payload carries no warnings, so the grep can never fire. The grep itself is probe-verified
  (a synthetic `Unknown component type "Bogus.Ghost"` line fails and names the type).
- **Chosen:** A1 (the recommendation). DW-2.2 can go green inside the repo that owns the check, without
  waiting on another repo. C is rejected: a check that never fires looks protective and is not. B stays
  an optional later row.
- **Plan:** C4r8 Phase 2 file scope grows by the editor e2e harness (`app/e2e/scenariocreator-check.mjs`
  and the harness file that opens the page). Capture page `console.warn`, feed it to `unknownTypes`,
  inject a bogus type into the fixture → non-zero exit naming it (DW-2.2); Library Rotator still passes
  (DW-2.1); run under `editor-e2e.lock` (DW-2.3).
- **Public behaviour:** none. Test and check tooling only; the engine fix (`609ec32`) is unaffected.
- **Rollback:** revert the one editor commit; the check falls back to today's inert grep.
