# B6r2 — F-R4 of the B6 review: telemetry answered 201 for any existing scenario id — notes

Task row: `B6r2`, claimed by W1 as `B6r2-telemetry-any-scenario`.
Branches: `virtual-lab/B6r2-telemetry-any-scenario` (`18867e6`), `.claude-shared/B6r2-telemetry-any-scenario`.
Finding: `code-foundations/B6/security-review.md` F-R4.

## The defect

`POST /api/telemetry/session` asks "does this scenario id exist" through
`db.scenarioExists`, which was `SELECT 1 FROM scenarios WHERE id = $1`. Every status answers "yes", so a
slug in `review`, `rejected`, `archived` or `draft` got a **201 with a session id**. An anonymous caller
(no key, rate-limited by `telemetryLimiter` but not authenticated) could therefore enumerate the
unpublished catalog by id: 201 means "that slug exists and is not public", 404 means "no such row". The
review's note about the 409 on a taken id in the *author* flow is a different surface — it needs a key and
answers it in the admin routes, so it stays as it is.

## The fix

`scenarioExists` now binds to the same condition every public read uses:

```sql
SELECT 1 FROM scenarios s LEFT JOIN categories c ON c.slug = s.category
 WHERE s.id = $1 AND s.status = 'published' AND COALESCE(c.is_visible, true)
```

The condition is **`scenario-rows.js`'s `PUBLIC_ROW` and `ITEM_FROM`** — the single fragment the catalog
list, summary, related, by-id, version-preview and LTI routes already share, with the file's own note
"add every new public read to it". An existence check behind a public 404/201 answer *is* a public read, so
it belongs there; duplicating the literal would let the two disagree the next time a status is added.

No change to the 404 for a bogus id, and no change for a scenario with no category row (the table has no
foreign key on purpose, and the public readers leave those visible).

## Verification

- `archives-and-telemetry.test.js` gains one subtest: `solar-system` set to `draft` → 404, set back to
  `published` → 201. It uses the shared `setStatus` helper and the existing seed, so nothing new is
  seeded.
- The new check **fails against the old `scenarioExists`** — verified by stashing the fix and re-running
  the file (2 failures: the hidden subtest and its published-back half), which makes it a regression test
  rather than a description of current behaviour.
- Full backend suite (`npm test`, unit + integration against the Docker test DB on 55432, inside
  `vl-db.lock`): **1665 tests, 1665 pass, 0 fail** (one more than B6r1's 1664 — the new subtest).
- Backend-only change; the frontend has no file in the diff, so its own check was not run.

## Follow-ups (not rows)

- The 409-on-a-taken-id shape the review also named is the *author* flow (`from-archive`/`submit`), which
  needs a live key and answers through the admin routes. Nothing to do there for an anonymous caller.
- If a future public route gains an "is this id known" answer, route it through `scenarioExists` rather
  than writing a new query.
