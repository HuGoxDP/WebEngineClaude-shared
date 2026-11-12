# B6r3 — the sweep's public-read allow-list names three dead routes — notes

Branch: `B6r3-sweep-allowlist-dead-routes` in `virtual-lab` and `.claude-shared` (this file,
the row). Claimed by W3 on 2026-11-12 straight from the B6 review's F-R5 (a low finding that
became a row rather than a change inside the B6 task).

## The finding, and what it was worth

`backend/test/helpers/routes.js` listed six names as "an anonymous caller may read this":

```
GET /api/catalog          GET /api/catalog/:id       GET /api/scenarios/:id
GET /api/health           GET /play/:id              GET /api/scenarios/:id/manifest
```

Three of them no route answers. Live enumeration from the app's own stack — 52 method+path
entries, 26 with a parameter, none of those three — and a grep of `backend/routes/*.js`,
which shows `PUT`/`DELETE /api/catalog/:id`, `GET /api/catalog/:id` and nothing for `/play/`
or a `manifest` route. `GET /play/:id` is an **Angular client route**
(`frontend/src/app/app.routes.ts:24`, `path: 'play/:id'`) served by the SPA, so no server
route ever existed with that name; the sweep's author had written down what a client calls,
not what the server serves.

A superset is harmless the day it is written and a hazard the day after: the sweep skips
whatever is on the list, so a dead name silently stops a future route that reuses the exact
path from being swept.

## What landed

1. **The three dead entries are gone.** The allow-list is now exactly what the app answers
   publicly: `GET /api/catalog`, `GET /api/catalog/:id`, `GET /api/health`. The comment says
   why `/play/:id` is not on it, so nobody "helpfully" re-adds it.
2. **The list now checks itself.** `bola-sweep.test.js` gained a test that every allow-list
   entry is served — built from `routes(app)` (which strips the `/^` mount prefix, so a path
   reads as it is called), because the raw `methodPathList` carries that prefix and never
   matches. A dead entry, or a public route later moved behind a guard, fails there.

The raw `methodPathList` helper lost its only caller in the sweep (the new test uses
`routes`); it is still exported for anyone who needs the un-stripped form.

## Verified

- `node --test test/integration/bola-sweep.test.js`: **29 passed, fail 0, skipped 0** (the
  28-subtest sweep, the 26-route floor, and the new allow-list check).
- Mutation check: re-adding one dead entry (`GET /gone/later/:id`) makes the new test fail
  with `on the allow-list but the app does not serve it`; the file was restored and
  `node --check`ed.
- The full backend suite for this row ran against the shared Postgres test container while
  another worker held `vl-db.lock`, so 379 of its failures were that worker's truncates, not
  this change (the same suite was 1658/1658 green minutes earlier on this branch's parent).
  The row's own suite was re-run under the lock: see the report.
