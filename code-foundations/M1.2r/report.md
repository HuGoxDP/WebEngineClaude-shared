# M1.2r — COMPOSE_FILE overlay preservation in the self-host guide: task report (W3, 2026-11-20)

Task: M1.2r — Claude review of M1.2 (2026-11-19), ROADMAP M1, ¼ h: the plain
`docker compose` commands in `docs/self-host.md` (update steps 1/3, rollback,
logs/stop) silently drop the https/editor overlays on a stack started with
`-f` pairs. Fix: teach `COMPOSE_FILE` in `.env`; verification via a doc-grep
test (or a `--https` update leg if cheap — it is not, see below).

Branch `M1.2r-compose-file-overlays` in virtual-lab + .claude-shared.
Worktrees: `.workers/W3/virtual-lab` (base `ea95355`, merged M1.2s),
`.workers/W3/.claude-shared`. Research `research.md`, plan `plan.md`,
build log `notes.md`. **Doc + pure-node test + 1 scrub line; no compose/backend
changes.**

## Defect mechanics (verified at base `ea95355`)

- «Як оновитися» step 1 backup and step 3 rebuild (`docker compose up -d --build`),
  M1.2s rollback step 2, and «Логи, зупинка, скидання» (`logs`/`stop`/`down`/`down -v`)
  are all plain-form. A stack started per the HTTPS section with
  `-f docker-compose.yml -f docker-compose.https.yml` is recreated by a plain
  `up -d --build` from `docker-compose.yml` alone: the 8443 listener
  (`docker-compose.https.yml:23`, `${HTTPS_PORT:-8443}:443`) and
  `REQUIRE_HTTPS: "true"` (`:19`) vanish — every Moodle launch fails (LTI needs
  https) and bearer tokens are accepted over http :8044 again (B6 gate in
  `backend/auth.js`). With the editor overlay, `/editor/` disappears
  (`docker-compose.editor.yml:2`, mounts `:35-36`) and `down` orphans the
  `editor` container.
- The restore command's explicit `-f docker-compose.yml -f docker-compose.restore.yml`
  pair was already correct and unaffected: explicit `-f` replaces `COMPOSE_FILE`.

## Fix design

One mechanism, one source of truth: `COMPOSE_FILE` in `.env` selects the compose
file list for **every** plain `docker compose` command, so the update steps stay
plain (no `-f` duplication) and the guidance lives where the overlays are
introduced. Empirically verified before designing (research §2, re-verified at
P2): Docker Compose **v5.7.0** on this Windows host resolved both services from
`.env` alone (`COMPOSE_FILE=docker-compose.yml;docker-compose.ovl.yml`,
`docker compose config --services` → `base` + `extra`, exit 0) — the Windows `;`
separator is proven, not just doc-quoted; Linux/macOS `:` shown alongside.

Edits (line numbers at `1d01a48`):

1. HTTPS section (:231-244): `.env` block with base+https value, Windows `;`
   variant; plain `up -d` ≡ the `-f` pair; the exact failure without it stated.
2. Editor section (:407-418): base+editor value, both-overlays variant, `;`;
   `/editor/` loss + orphaned editor container stated.
3. Update step 3 (:112-116) and rollback step 2 (:154-155): one-sentence
   mechanism references — plain commands are overlay-safe iff `COMPOSE_FILE`
   is set; check `.env` before updating a TLS stack. M1.2s text additive-only.
4. Restore note (:170-171): the explicit pair is deliberate — it replaces
   `COMPOSE_FILE`, restore always runs base+restore. Command unchanged.
5. Logs/stop section (:430-432): these commands follow `COMPOSE_FILE` too.
6. «Що нового» (:188-193): dated 2026-11-20 entry per the section's own rule.
7. `scripts/selfhost-check.mjs:167`: `'COMPOSE_FILE'` added to
   `COMPOSE_INTERPOLATED` — the D7 scrub now covers the variable the doc
   promotes; existing scrub tests iterate the list (automatic coverage), zero
   behavior change for clean shells.

## Verification — doc-grep test, no `--https` update leg

New `scripts/test/selfhost-doc.test.mjs` (`node:test`, `readFileSync`, `##`
section slicing — guidance must be in the right section; pattern:
`https-redirect.test.mjs`). 5 assertions: https value + Windows `;`; editor
value; update area names the mechanism and forbids partial `-f` lists on `up`
lines; logs section names it; M1.2s restore pair guarded.

- **RED** (`b9bc387`, test written first, pre-fix doc): `npm run test:scripts`
  **93 tests, 89 pass, 4 fail** — assertions 1–4 fail (`COMPOSE_FILE` absent
  from the doc), assertion 5 green (existing pair), existing 88 intact.
  Re-verified at P2 against a scratch copy of the `ea95355` doc: same 4-fail
  signature, raw output in `notes.md`.
- **GREEN** (`1d01a48`): `npm run test:scripts` — raw tail:

  ```
  ℹ tests 93
  ℹ pass 93
  ℹ fail 0
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 16035.1815
  ```

  (P2 re-run; P1 gate identical counts.)
- **Unit sanity, no Docker**: `npm run test:unit` in the worktree backend —
  P1 gate **308/308** (4706 ms); P2 re-run raw tail **tests 308, pass 308,
  fail 0, skipped 0**, duration_ms 7348.0004.
- `node --check` on the test file and `selfhost-check.mjs` → SYNTAX_OK.
- **Scope**: `git diff ea95355..1d01a48 --stat` = 3 files, +118/−1 (doc +50/−1,
  new test +67, scrub +1). M1.2s warnings/order/identity untouched.

Why no update leg: the check driver is fresh-clone only and already
overlay-correct on up/teardown (`composeArgs`/`teardownCommands`,
selfhost-check.mjs:196-215 at research HEAD); an update leg means a second full
build under `vl-db.lock` holding both ports — to test a documentation defect.
The doc-grep test is deterministic and needs no Docker/locks (plan §Decision).

## What landed

- **virtual-lab `b9bc387`** — RED test (1 file, +67).
- **virtual-lab `1d01a48`** — doc + scrub (2 files, +51/−1).
- **.claude-shared (this commit)** — report + `notes.md`; ROADMAP:80 →
  `✅ 2026-11-20 W3` (claim-date convention); CHANGELOG entry under virtual-lab
  `### 2026-11-20`. Base `84bb0e0` carried research + plan.

## Review verdict

Adversarial doc-accuracy review **PASS** — R1–R7 and A1–A4 all PASS;
independent RED mutation reproduced (scripts 93/89/4), live Compose v5.7.0
probe, restore pair token-equal. Four cosmetic notes, non-blocking, no action.
Post-merge verification V1–V5 PASS (primary gates re-executed: scripts 93/93 +
unit 308/308).

## Commits

- virtual-lab: `b9bc387` + `1d01a48` pushed to `origin/M1.2r-compose-file-overlays`.
- .claude-shared: `84bb0e0` (research+plan) + this commit, explicit paths
  (ROADMAP.md, CHANGELOG.md, code-foundations/M1.2r/{notes,report}.md), pushed
  same branch. Not merged (merge is the lead's gated step).
