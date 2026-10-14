# Execution plan — task cards

`PLAN.md` says **what** is open and **why**. This folder says **how**: one card per task, written so
that a session that has never seen this project can do it without asking. Cards are written and
reviewed by a planning model (Opus); most are implemented by a cheaper one (Sonnet). The
direction they serve is the vision document of 2026-10-13
(https://claude.ai/code/artifact/01113f63-16cd-4f87-912b-182e286b6501).

State of every repository when these cards were written (2026-10-14), all on branch
`claude/scenario-platform-architecture-24f9fy`:

| Repo | Head | Notes |
|---|---|---|
| WebEngineTS | `bdf038b` | 136 test files / 2280 tests green; standalone 392 KB gzip. A1–A4 and A6 done; `PrefabDiff` no longer exported (#12). |
| virtual-lab | `709494c` | Refuses scene/prefab/manifest versions its player cannot read (`backend/player-formats.js`). Backend unit 125/125, full 232 with Postgres. |
| WebEngineTSEditor | `b4a1a22` | Docs only since `9a6e35a`. Still on engine `0.1.0-local.1789023160893`. |
| ScenarioCreator | `fbdc7c3` | Docs only. Still on engine `0.1.0-local.1789023160893`. |
| webengineclaude-shared | this commit | — |

---

## How a task is run

**One task per session.** Start a fresh session for each card; do not chain cards in one context.
Most of the token cost so far came from long sessions that re-read large files and from several
multi-agent runs at once — not from the model.

1. **Open the card** (`tasks/<id>-*.md`) and the files it lists under *Read first*. Read only those
   unless the card's steps lead elsewhere. `SceneSerializer.ts` (~2.4k lines), `PrefabOverride.ts`
   and `Prefab.ts` are large: read the functions a card names, by line range, not whole files.
2. **Plan, then TODO, then code** — the engine's `CLAUDE.md` workflow rule. A plan that departs
   from the card says why in the commit message and in the report.
3. **Reproduce first.** A defect card names a probe or a failing case; run it and see it fail
   before changing code.
4. **Iterate on targeted tests** (`npx vitest run tests/<File>.test.ts`), and run the full checks
   once at the end (see *Checks per repo*).
5. **Commit small**, one concern per commit, conventional subject, the two trailer lines below.
6. **Push** the designated branch when the full checks are green. Pushing is safe: these branches
   are the integration branches, and a container can be reclaimed at any time.
7. **Report** in the shape the card asks for (the end of every card). The reviewer reads the report
   and the diff, not the session.
8. **Review** (Opus, a separate session or agent): the card's *Review focus* list, an adversarial
   probe or two, and the conventions. Findings become a follow-up card or a fix in the same card.

**Which model.** Each card names one:

- **Sonnet** — the card spells out the change, the files and the tests. Most cards.
- **Opus** — the change needs design judgement inside a subtle area (prefab/serializer semantics,
  the render adapter, undo by diffs). Evidence: the E11 serializer was written by Opus and still
  produced 20 review findings, and the fixes for those produced 3 regressions. In these areas the
  risk is the semantics, not the typing.
- **Sonnet + Opus review** — Sonnet implements, then an Opus reviewer runs the card's review focus
  before the push.

How to pick it: in Claude Code, `/model sonnet` (or `/model opus`) at the start of the session. From
an orchestrating session: the Agent tool's `model: "sonnet"`, or `{ model: 'sonnet' }` on a
Workflow `agent()` call.

**Token rules.**
- No multi-agent fan-out for an implementation card. Fan-out is for research and for review.
- Do not paste large outputs back into the conversation: `| tail`, `| grep`, `--reporter=dot`.
- Probes and scratch files go under the session's scratchpad, never into `tests/` of a repo you
  will commit from. If they must survive the session, put them in `tasks/probes/` here.
- When a session nears its limit, commit what is green, push, and write the report with what is
  left. Uncommitted work in a reclaimed container is lost.

---

## Conventions every card assumes

**Branch.** `claude/scenario-platform-architecture-24f9fy` in every repo. Never push to `main`/`master`
(merging is an owner decision, `tasks/OWNER-DECISIONS.md`).

**Commits.** Conventional subject (`fix(serialization): …`, `feat(backend): …`, `docs: …`). Never
rewrite pushed history. Every Claude-made commit ends with exactly:

```
Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: <the session's URL>
```

(Use the attribution the running session's system prompt gives; the two lines above are the shape.)

**Checks per repo** — what "green" means before a push:

| Repo | Commands |
|---|---|
| WebEngineTS | `npm run typecheck` · `npm test` · `npm run build` (all exit 0). CI: `.github/workflows/ci.yml`. |
| virtual-lab backend | `cd backend && npm run test:unit`; with Docker: `docker compose -f docker-compose.test.yml up -d --wait` then `DB_HOST=localhost DB_PORT=55432 DB_NAME=virtual_lab_test DB_USER=test_user DB_PASSWORD=test_password ADMIN_TOKEN=ci-admin-token npm test`, then `docker compose -f docker-compose.test.yml down`. In a cloud container `dockerd` may need starting by hand. |
| virtual-lab frontend | `cd frontend && npx ng test --no-watch` (60 tests; needs Chromium — `/opt/pw-browsers` in cloud containers). |
| WebEngineTSEditor | `cd app && npm ci && npx ng build && npm run e2e` (see `README.md` for `E2E_PLAYWRIGHT_DIR` / `E2E_BROWSER_CHANNEL`). CI: `.github/workflows/ci.yml`. |
| ScenarioCreator | `npm ci && npm run build:all && npm run build -- --all --tests && npm run manifest:all -- --tests && npm run manifest:verify`. CI runs on `windows-latest`; the builder needs Windows `tar.exe` — on Linux, build only in a scratch copy with a shim. |

**Engine into a consumer.** `npm run release:local` in WebEngineTS packs and installs the engine
into every consumer. It expects the consumers at `../ScenarioCreator`, `../testv/virtual-lab` and
`../WebEngineTSEditor` (the owner's PC layout). In a cloud container the platform is at
`../virtual-lab`: either symlink `../testv/virtual-lab` to it, or pack by hand exactly as the
script does (build → stamp `0.1.0-local.<ts>` only for `npm pack` → restore `package.json` → rename
to `WebEngineTS-0.1.0.tgz` → copy → `npm install ./WebEngineTS-0.1.0.tgz` in the consumer so the
lockfile records the new integrity). A card says which consumers get the new engine; do not update
the others.

**Never** skip, disable or weaken a test to get green; never `--no-verify`; never commit
`node_modules`, `dist/` (engine), probes or scratch paths.

---

## The cards

Ordered. *Depends* must be done first. Sizes are for one person-session at the stated model.

### Phase A — the first engine release, `v0.2.0` (delivery before features)

| Card | What | Repo | Model | Size | Depends |
|---|---|---|---|---|---|
| [A1](A1-e11-regressions.md) | **Done 2026-10-14** (`5579e59..31c7793`, 2094 tests). N1–N6, `path`; review fixes; format decisions: `after` replaces `index` on added children, one `applyInstance` rule, `of` binds in any load order | WebEngineTS | Opus | — | — |
| [A2](A2-e11-docs-api.md) | **Done 2026-10-14** (`5d271e5`, `4823500`, `ef1a56a`). `PrefabDiff` export removed per owner decision #12 (`bdf038b`) | WebEngineTS | Sonnet | — | — |
| [A3](A3-d5-destroyed-component.md) | **Done 2026-10-14** (`5c41aa3`, `4f99210`, review fix `d532df6`). Hazards it surfaced → A13 | WebEngineTS | Sonnet + Opus review | — | — |
| [A4](A4-engine-version-api.md) | **Done 2026-10-14** (`5650921`, `ddcd126`, `115e91b`, `4a3f4fe`, review fix `85496dc`). `SceneSerializer.readableVersions`/`versionOf`/`canRead`, `UnsupportedFormatError` | WebEngineTS | Sonnet | — | — |
| [A12](A12-ui-rect-transform-restore.md) | A UI object loads with one RectTransform, the saved one (pre-existing; found in A3's review) | WebEngineTS | Sonnet + Opus review | 1 d | — |
| [A13](A13-lifecycle-robustness.md) | Destroy is robust: a throwing `onDestroy`, self-destroy, children destroyed mid-update | WebEngineTS | Sonnet + Opus review | 1 d | — |
| [A5](A5-component-ids.md) | Component ids (Q2), scoped like node ids | WebEngineTS | Opus | 3–5 d | A12 |
| [A6](A6-minify-bundle.md) | **Done 2026-10-14** (`80e9f2d`, `6db59ef`). 892 → 392 KB gzip, budget 450 KB in CI; browser check not run (needs ScenarioCreator's verify-render) | WebEngineTS | Sonnet | — | — |
| [A7](A7-changelog-backfill.md) | Backfill CHANGELOG for E3/E5/E6/E7/E10/E13 and 2026-09-10 | WebEngineTS | Sonnet | ½ d | A1–A6 |
| [A8](A8-editor-new-engine.md) | Editor takes the new engine and opens files through it | WebEngineTSEditor | Sonnet | 1 d | A4 |
| [A9](A9-release-v0.2.0.md) | Cut `v0.2.0` | WebEngineTS | Sonnet | ½ d | A1–A8, **owner** |
| [A10](A10-platform-on-release.md) | Platform on the release: URL dependency, versioned engine path, prefab v2 accepted | virtual-lab | Sonnet | 1–2 d | A9 |
| [A11](A11-scenariocreator-on-release.md) | ScenarioCreator on the release; `.meta` guids; decorators flag | ScenarioCreator | Sonnet | 1–2 d | A9 |

### Phase B — editor milestone 1 (a scenario without code, from "Create project" to the catalog)
[`B-milestone-1.md`](B-milestone-1.md): editor stages 6–10, engine E1, platform publish keys and
player isolation. ~11 editor weeks + ~3 engine + ~1.5 platform.

### Phase C — editor milestone 2 (a scenario with behaviour; Play as in Unity)
[`C-milestone-2.md`](C-milestone-2.md): stages 11–13, engine E2 + E4, E8 (RenderTexture).

### Phase D — editor milestone 3 (prefabs with links, settings, Unity-style undo)
[`D-milestone-3.md`](D-milestone-3.md): stages 14–16; link mode on in project files, expanded at Build.

### Phase E — platform and engine growth (parallel lanes, after Phase A)
[`E-growth.md`](E-growth.md): LTI 1.3, offline lessons, KTX2 without `'unsafe-eval'`, meshopt,
Rapier, render adapter stage 1 → WebGPU, accessibility, a project store outside Chromium,
content fixes (G2), backups and HTTPS.

### Owner decisions
[`OWNER-DECISIONS.md`](OWNER-DECISIONS.md) — what an agent must not decide, each with the
recommended answer.

### Probes
`probes/e11/` — the reviewers' and verifiers' probe tests for the prefab-instance serializer.
They import `../../src/...`, so copy a folder to `WebEngineTS/tests/<folder>/` to run it, and
delete it before committing. `probes/e11/vzw/v_new_findings.test.ts` is A1's acceptance list.
