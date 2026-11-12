# B6r1 — F-R3 of the B6 review: a transfer hands the new owner the previous owner's journal — notes

Task row: `B6r1` (Claude's review of B6), claimed by W1 as `B6r1-audit-era-transfer`.
Branch: `virtual-lab/B6r1-audit-era-transfer` (`e3f642f`), `.claude-shared/B6r1-audit-era-transfer`.
Source of the finding: `code-foundations/B6/security-review.md`, F-R3.

## The defect

`audit.listActivity`'s era filter (`backend/audit.js`) anchored "the live row's era" to
`scenarios.created_at`:

```sql
AND a.created_at >= s.created_at
```

A scenario id is not unique over time (B6, DW-4.2 handled delete + recreate), but a scenario can also be
**transferred**: a moderator hands a live row from Alice to Bob through `PUT /api/scenarios/:id/owner`,
which records `scenario.owner` with `{from, to}` and rewrites `scenarios.owner_key_id` — and leaves
`scenarios.created_at` at the original creation. So Bob, the new owner, still read Alice's
`scenario.create`, `submit` and `update` events: her whole journal, through his own scenario. The B6.4
test suite covered the delete-and-recreate shape but not the transfer, so nothing caught it.

## The fix

The era starts at the newest `scenario.owner` event **naming the viewer as the new owner**, and falls back
to the row's creation when nobody ever handed the scenario to them:

```sql
AND a.created_at >= COALESCE(
  (SELECT max(e.created_at) FROM audit_events e
    WHERE e.scenario_id = a.scenario_id
      AND e.action = 'scenario.owner'
      AND e.details->>'to' = ($4::int)::text),
  s.created_at)
```

- A scenario never transferred: the subquery finds nothing → `s.created_at`, the previous behaviour, so the
  B6.4 tests pass unchanged.
- Transferred to the viewer: the era starts at the hand-over, so the viewer reads their own era only. Alice's
  events are out, and the reviewer's "low" note (the version list already carries `uploadedByKeyId`) stays
  true — the journal keeps who did what; only the *author's view* of it changes.
- A moderator (`sinceScenarioCreated: false`) keeps the full history: the era fragment is not in the query
  at all.

### Why a new filter, and not `ownerKeyId`

`GET /api/scenarios/:id/history` filters by `scenarioId` only and passes no `ownerKeyId` — so `ownerKeyId`
cannot carry the anchor there. Reusing it would also have restricted a moderator's full-history read to
scenarios they own, which is exactly what the route exists not to do. `eraOwnerKeyId` is therefore its own
parameter: who the era belongs to, independent of which scenarios are filtered.

### The bug the test found in my own first attempt

The first version always bound four parameters. When `sinceScenarioCreated` is false the era fragment is
not in the query text, so Postgres refused the query —
`bind message supplies 4 parameters, but prepared statement "" requires 3` — a 500 on every moderator's
history read. The parameter is now appended only when the fragment that names it is present.

## Verification

- `history-era.test.js` extended with the transfer case (5 subtests): the hand-over is in the new owner's
  history; Alice's create and update are not; the old owner now gets 403 (they no longer own it); the
  moderator still administers the whole journal (3 events); the new owner's dashboard agrees; and a scenario
  never transferred still anchors on its own creation.
- The pre-existing B6.4 test is unchanged and green.
- Full backend suite (`npm test`, the unit tests plus the integration tests against the Docker test DB on
  55432): **1664 tests, 1664 pass, 0 fail**. Reproduction of the bug before the fix: the transfer test's
  "the hand-over is in Bob's history" check passes but "Alice's create is not" fails — the old anchor let
  Bob read her create, which is exactly the finding.
- No frontend change, so the frontend's own check was not run; the diff is three backend files.

## Follow-ups (not rows)

- `scenario_versions.uploaded_by_key_id` already answers "who uploaded this version", so the transfer does
  not need to rewrite history — nothing to do.
- If the editor ever shows an author's journal for a scenario they used to own, it reads the moderator view;
  the API has no "previous owner" concept and the row asks for none.
