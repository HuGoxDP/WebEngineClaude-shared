# M1.2r build notes — W3, 2026-11-20

Doc + doc-test task per plan. Worktrees: `.workers/W3/virtual-lab`
(base `ea95355`, merged M1.2s), `.workers/W3/.claude-shared`
(`84bb0e0` research+plan). Branch `M1.2r-compose-file-overlays` in both.
Research `research.md` (verified file:line facts + live `COMPOSE_FILE` proof),
plan `plan.md` (decision: doc fix core, doc-grep test, no `--https` update leg).

## P1a — RED test first (`b9bc387`)

New `scripts/test/selfhost-doc.test.mjs`, 67 lines, 5 tests — `node:test` +
`node:assert/strict`, `readFileSync` of `docs/self-host.md`, sections sliced by
`## ` heading boundaries (guidance must be in the RIGHT section, not anywhere
in the file). Pattern precedent: `https-redirect.test.mjs`. No Docker, no network.

Assertions (research §4):

1. HTTPS section: `COMPOSE_FILE=` naming base + `docker-compose.https.yml`,
   Windows case named, `` `; `` separator shown.
2. Editor section: `COMPOSE_FILE=` naming `docker-compose.editor.yml`.
3. Update area (includes rollback subsection): names `COMPOSE_FILE`; every
   `docker compose … up` line plain or fully `-f`-listed (≥2 `-f`, base named) —
   no partial overlay list.
4. Logs/stop/reset section: names `COMPOSE_FILE`.
5. Rollback restore keeps explicit `-f docker-compose.yml -f docker-compose.restore.yml`
   (M1.2s text guard — passes on the pre-fix doc, by design).

RED on pre-fix doc (`npm run test:scripts` at `b9bc387`): **93 tests, 89 pass,
4 fail** — assertions 1–4 fail (`COMPOSE_FILE` absent from the doc), assertion 5
green (existing restore pair), existing 88 intact.

P2 re-verification of RED (scratch copy, no worktree edit): old doc extracted
with `git show ea95355:docs/self-host.md`, the `b9bc387` test file pointed at it,
`node --test` raw:

```
✖ self-host doc: HTTPS section sets COMPOSE_FILE with the https overlay, Windows ; separator (7.6744ms)
✖ self-host doc: editor section sets COMPOSE_FILE with docker-compose.editor.yml (0.7388ms)
✖ self-host doc: update area (Як оновитися + rollback) names COMPOSE_FILE; up commands plain or fully -f-listed (0.4653ms)
✖ self-host doc: logs/stop/reset section says the plain commands follow COMPOSE_FILE too (0.2698ms)
✔ self-host doc: M1.2s rollback restore keeps the explicit -f docker-compose.yml -f docker-compose.restore.yml pair (0.3923ms)
ℹ tests 5
ℹ pass 1
ℹ fail 4
ℹ duration_ms 551.8695
```

Same 4-fail signature as the P1 full-suite RED.

## P1b — doc + scrub (`1d01a48`)

`docs/self-host.md` +50/−1 (line numbers at `1d01a48`):

1. **«Як оновитися» step 3** (:112-116): plain commands keep overlays only if
   `COMPOSE_FILE` set in `.env` (HTTPS/editor sections); check before updating a
   TLS stack — else step 3 rebuilds without overlays (8443 + `REQUIRE_HTTPS`
   vanish, Moodle launches break). Commands stay plain — `.env` is the one
   source of truth, no `-f` duplication.
2. **Rollback step 2** (:154-155): same one-sentence mechanism reference.
   M1.2s warnings/order untouched (additive only).
3. **Restore command note** (:170-171): explicit `-f` pair deliberate — replaces
   `COMPOSE_FILE` from `.env`, restore always runs base+restore. Command itself
   unchanged.
4. **«Що нового»** (:188-193): dated 2026-11-20 entry per the section's rule
   (admin-visible change), names the failure it prevents.
5. **HTTPS section** (:231-244): `.env` guidance block —
   `COMPOSE_FILE=docker-compose.yml:docker-compose.https.yml`, Windows `;`
   variant commented; with it plain `up -d` ≡ the `-f` pair above; without it a
   plain `up -d --build` drops the TLS listener and `REQUIRE_HTTPS` — Moodle
   launches fail (LTI needs https), bearer tokens accepted over http again.
6. **Editor section** (:407-418): `COMPOSE_FILE=docker-compose.yml:docker-compose.editor.yml`,
   both-overlays variant `…https.yml:…editor.yml`, Windows `;`; without it
   `/editor/` disappears and the `editor` container is left an orphan.
7. **«Логи, зупинка, скидання»** (:430-432): these commands also read
   `COMPOSE_FILE` — `logs`/`stop`/`down` cover https/editor services; without it
   `down` orphans the editor container.

`scripts/selfhost-check.mjs:167` — `'COMPOSE_FILE',` added to
`COMPOSE_INTERPOLATED` (D7 scrub): an operator-exported `COMPOSE_FILE` can no
longer redirect the check's docker children; existing scrub tests iterate the
list, coverage automatic. Zero behavior change for clean shells (the check
always passes explicit `-f` anyway — belt and braces).

## COMPOSE_FILE empirical verification

Research §2 live proof re-run at P2 (temp dir, base+overlay compose files, `.env`
containing only `COMPOSE_FILE=docker-compose.yml;docker-compose.ovl.yml`):

```
$ docker compose version
Docker Compose version v5.7.0
$ docker compose config --services
base
extra
exit=0
```

Both services resolved from `.env` alone — no `-f`, no shell export. Windows `;`
separator verified, not just doc-quoted. Explicit `-f` replaces `COMPOSE_FILE`
(compose precedence), which is why the restore pair stays as-is.

## Gates (P1, recorded) + P2 re-runs

- P1 gates: `npm run test:scripts` **93/93** (RED was 93 tests / 89 pass / 4 fail);
  `cd backend && npm run test:unit` **308/308** (duration_ms 4706).
- P2 re-run `npm run test:scripts` at `1d01a48`, raw tail:

```
ℹ tests 93
ℹ suites 0
ℹ pass 93
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 16035.1815
```

- P2 re-run `npm run test:unit` (worktree backend, no Docker), raw tail:

```
ℹ tests 308
ℹ suites 0
ℹ pass 308
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 7348.0004
```

- `node --check scripts/test/selfhost-doc.test.mjs` + `node --check
  scripts/selfhost-check.mjs` → `SYNTAX_OK`.

## Scope check

`git diff ea95355..1d01a48 --stat`:

```
 docs/self-host.md                  | 51 ++++++++++++++++++++++++++++-
 scripts/selfhost-check.mjs         |  1 +
 scripts/test/selfhost-doc.test.mjs | 67 ++++++++++++++++++++++++++++++++++++++
 3 files changed, 118 insertions(+), 1 deletion(-)
```

Exactly the planned surface: doc + new test + 1 scrub line. No compose files, no
backend code, no Readme/backup-restore.md (out of card scope; both already use
explicit `-f`/`-p`). M1.2s rollback warnings/order and identity paragraph intact
(additive sentences only). vl worktree clean at P2 (`git status --short` empty).

## Why no `--https` update leg

`selfhost-check.mjs` is fresh-clone only; `composeArgs` (:198) and
`teardownCommands` already carry the https overlay on up and down (:196-215 at
research HEAD) — the check is not defective. An update leg would need a second
full build under `vl-db.lock` + both ports held, to test a *documentation*
defect. The doc-grep test is deterministic, ~0.5 s, no Docker/locks (plan
§Decision, research §3).

## Commits

- virtual-lab: `b9bc387` `test(M1.2r): RED doc test for COMPOSE_FILE overlay
  preservation` (1 file, +67), then `1d01a48` `docs(M1.2r): COMPOSE_FILE overlay
  preservation across self-host guide` (2 files, +51/−1). Pushed to
  `origin/M1.2r-compose-file-overlays`.
- .claude-shared: `84bb0e0` research+plan; P2 commit — this notes.md + report.md,
  ROADMAP:80 ✅, CHANGELOG entry.
