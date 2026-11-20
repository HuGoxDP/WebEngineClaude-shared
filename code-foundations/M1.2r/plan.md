# M1.2r plan — COMPOSE_FILE overlay preservation in self-host.md + doc-grep test

Branch `M1.2r-compose-file-overlays` (virtual-lab + .claude-shared). Research: `research.md`
(read first — verified file:line facts, live `COMPOSE_FILE` proof, test-location decision).

## Decision (lead lean, confirmed by research)

**Doc fix is the core; verification = cheap doc-grep test, no `--https` update leg.**
The check driver is fresh-clone only and already overlay-correct on up/teardown
(`composeArgs`/`teardownCommands`, selfhost-check.mjs:196-215); an update leg would need
a second full build under `vl-db.lock` to test what is a *documentation* defect.
`COMPOSE_FILE` in `.env` is honored by docker compose — proven live on this host
(v5.7.0, `;` separator, `config --services` listed both files; research §2).

## Phase 1 — virtual-lab worktree: test first (RED), then doc (GREEN)

### P1a — `scripts/test/selfhost-doc.test.mjs` (new file, written FIRST)

Pattern: `https-redirect.test.mjs` — `node:test` + `node:assert/strict`, `readFileSync`
of repo files, root via `fileURLToPath`. No Docker, no network. Assertions (research §4):

1. `## HTTPS` section: `COMPOSE_FILE=` value naming `docker-compose.yml` **and**
   `docker-compose.https.yml`; Windows `;` separator mentioned.
2. `## Редактор сценаріїв` section: `COMPOSE_FILE` guidance naming `docker-compose.editor.yml`.
3. `## Оновлення` section (spans «Як оновитися» + M1.2s rollback): mentions `COMPOSE_FILE`;
   every `docker compose up` line is plain or fully `-f`-listed (no partial overlay list).
4. `## Логи, зупинка, скидання` section: mentions `COMPOSE_FILE`.
5. Rollback restore command keeps the explicit `-f docker-compose.yml -f docker-compose.restore.yml`
   pair (M1.2s text guard).

Section slicing by heading regex (`/^## /m` boundaries), so guidance must be *in the
right section*, not anywhere in the file. Run `npm run test:scripts` → **RED on the
new tests** (COMPOSE_FILE absent from doc today), existing 88 stay green. Record output.

### P1b — `docs/self-host.md` edits (Ukrainian, doc's voice; keep M1.2s text intact)

1. **HTTPS section** (after the :210-212 start commands): add `.env` guidance —
   `COMPOSE_FILE=docker-compose.yml:docker-compose.https.yml` in `.env` (Windows:
   separator `;`), so every later plain `docker compose` command (оновлення, логи,
   зупинка, бекап) keeps the overlay; with it set, plain `docker compose up -d` is
   equivalent to the `-f` pair shown. State the failure it prevents: a plain
   `up -d --build` without it recreates the stack from the base file alone — 8443 and
   `REQUIRE_HTTPS` vanish, Moodle launches fail, tokens accepted over http again.
2. **Editor section** (:365-373): same guidance —
   `COMPOSE_FILE=docker-compose.yml:docker-compose.editor.yml` (both overlays:
   `docker-compose.yml:docker-compose.https.yml:docker-compose.editor.yml`), `;` on
   Windows; without it a plain update drops `/editor/`.
3. **«Як оновитися»**: one sentence before/inside step 3 — the plain commands in these
   steps keep overlays **iff** `COMPOSE_FILE` is set per the HTTPS/editor sections;
   check `.env` before updating a TLS stack. Steps' commands stay plain (no `-f`
   duplication — the mechanism is `.env`, one source of truth).
4. **Rollback subsection** (M1.2s, :123-170): same one-sentence reference at its step 2
   (:145) — plain rebuild keeps overlays via `COMPOSE_FILE`. Restore command (:156-158)
   untouched: explicit `-f` pair deliberately overrides `COMPOSE_FILE` (add half a
   sentence noting the explicit pair is intentional, if it reads naturally).
5. **«Логи, зупинка, скидання»** (:375-385): one sentence — these commands also follow
   `COMPOSE_FILE`, so `down`/`stop` cover the editor/https services too.
6. Optional consistency (research §5, one line): add `'COMPOSE_FILE'` to
   `COMPOSE_INTERPOLATED` in `scripts/selfhost-check.mjs:164` — D7 scrub now that the
   doc promotes the variable. Existing scrub tests iterate the list (auto-coverage).
7. «Що нового»: dated entry **2026-11-20 — COMPOSE_FILE…** per the section's own rule
   (:174-175, admin-visible changes get an entry).

Out of scope: `Readme.md`, `docs/backup-restore.md` (explicit `-f`/`-p` already),
compose files, backend code, selfhost-check behavior beyond the scrub list.

Verification (P1): `npm run test:scripts` → new tests GREEN, total **88 + N** (N = new
test count, record exact); `cd backend && npm run test:unit` → **308/308** sanity
(no Docker). `git diff --stat` = self-host.md + new test (+1 line selfhost-check.mjs).

Gate: Minimal+ (doc + pure-node test). DW: test RED on old doc proven, GREEN after;
guidance in https+editor+update+rollback+logs sections with Windows `;`; M1.2s restore
pair intact; suites green.

## Phase 2 — shared worktree artifacts

- `code-foundations/M1.2r/{notes,report}.md`: build log (RED output, GREEN counts,
  unit 308/308), decisions, review verdicts.
- `ROADMAP.md:80` → `✅ 2026-11-20 W3` + one-line summary (claim-date convention,
  M1.2s precedent).
- `CHANGELOG.md` virtual-lab section: `### 2026-11-20` entry (doc + test, no measurable
  change).
- Practice bundle: `--date 2026-11-20` after merge.

## Review (adversarial, read-only reviewer)

- Doc accuracy: every new claim against `docker-compose.https.yml:19,23,29`,
  `docker-compose.editor.yml:2,35-36`, compose `COMPOSE_FILE` semantics (research §2
  live proof); Windows `;` correct; no claim that `COMPOSE_FILE` affects explicit `-f`
  commands; restore pair still explicit; Ukrainian voice consistent.
- Test strength (mutation): revert `docs/self-host.md` to `origin/main` version in a
  scratch copy (or strip one section's guidance) → new tests MUST fail; restore → green.
  Also: guidance placed in the *wrong* section must fail (section-scoped assertions).
- M1.2s regression: rollback warnings/order untouched; identity paragraph untouched.

## Merge + post-merge

`wk.sh lock merge W3 M1.2r`; **virtual-lab first**, then .claude-shared, via
`wk.sh merge-push` (9.3 guarded). Post-merge in primary checkouts: re-run
`npm run test:scripts` (doc-truth: merged doc passes) + `test:unit` 308/308; delete
task branches + `claims/M1.2r`; `wk.sh done W3`; practice bundle `--date 2026-11-20`.

## Risks

- Separator confusion: doc must show `:` (Linux) and `;` (Windows) explicitly — the
  live proof used `;`; review checks both appear.
- Over-editing M1.2s text: only additive sentences at rollback step 2; diff review
  confirms warnings/order unchanged.
- Test brittleness: assert on mechanism presence per section, not exact prose — doc
  rewording later must not break the suite unless guidance is actually removed.
