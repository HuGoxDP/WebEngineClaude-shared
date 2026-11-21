# C4 phase 5 — adversarial review (2026-11-20, at 4549b8b + d9943bd)

Verdict at review time: FAIL — R4 re-entrancy (sole blocker); R1–R3, R5–R10 clean.

Executed: tsc -p tsconfig.app.json --noEmit exit 0; Node probes (resolveRelative/rewriteEngineImports 7 import forms correct; engine dist imports 260 exports; Babel 7.28.4 bundle scan 0 eval(/0 new Function(). e2e not executed by the reviewer (lock held elsewhere); runtime verdicts on line traces + run.mjs audit. Hygiene: 14 commits origin/master..HEAD, author HuGox, no AI trailers; diff 34 files +3075/−25, intended app/ + package.json (@babel/standalone ^7.28.4, monaco-editor ^0.52.2), lockfile, tarball.

R1 import-throw → Console note w/ path, old class kept, scene intact: PASS (script-runtime.service.ts:226-229, :240, :254; console.service.ts:96-97). Note: INFO row, no jump; no evaluation-throw e2e.
R2 duplicate class name: PASS — sorted files, last-wins deterministic; register collision advisory visible (:306, :377-385).
R3 missing sibling: PASS — unresolved specifier left, import rejects, note names importer; others load (:161-164, :226-229). No dedicated e2e.
R4 reload/save race: FAIL — no re-entrancy guard. Double Ctrl+S → concurrent reload passes; pass B revokes pass A's blob URL mid-import (:283 vs :226) → spurious import-failure Console row; variant: _changedOnDisk sees own just-written file before stamp update → self-overwrite ask. Fix: single-flight reload (shared in-flight promise + trailing re-run), save guard/dirty-check.
R5 outside-edit focus flows: PASS — _checking + dialog guards (:180), keep-mine re-stamp (:206), gone stamps (:190-194), silent clean reload (:212-215), re-seed (:120); e2e :1264/:1306/:1366. Listeners never removed — root singletons, note.
R6 NotFoundError skip vs other read failures reported: PASS (:120-127; e2e :1407/:1446).
R7 library author-owned, dedupe never overwrites: PASS (library.service.ts:52-54/:66-67; commands.service.ts:207/:217-236; six library e2e).
R8 CSP: PASS — 0 eval/new Function (executed scan); blob revocation :283/:150; shim once, never revoked :63-69.
R9 e2e assertions real: PASS (audit :332-1476). Note :844 check(...,true) preceded by real waitForFunction.
R10 scene dirty guard separate, undo scene-only, one engine instance: PASS (BuildInfo e2e :1477).

Non-blocking notes: dead monaco-loader.service.ts (delete); stale "import map" comment run.mjs:306; focus listeners never removed (root singletons); resolveRelative root-level divergence unreachable (scripts/ prefix); stale meta at replace harmless; R1 INFO row without jump.

R4 fix in progress (single-flight reload + save guard, failing-first regression); re-review after the fix.
