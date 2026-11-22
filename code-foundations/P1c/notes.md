# P1c — ручна реєстрація LTI: друга половина (скрипт) + справжні поля Moodle

Рядок ROADMAP (Claude review 2026-11-19), ключове дослівно:

> `docs/self-host.md` LTI «Крок 3 — ручна реєстрація» is a dead end — the tool learns a platform only
> through Dynamic Registration (`backend/lti/registration.js:145` is the only caller of
> `store.saveRegistration`; `launch.js:139` finds no registration for any other issuer and answers
> 403 «Платформа не зареєстрована»), so an admin whose Moodle blocks dynamic registration fills the
> table and every launch is 403. The table also names fields Moodle's form does not have
> («Метод автентифікації», "Target link URI") and omits LTI version = LTI 1.3, Public key type =
> Keyset URL, Supports Deep Linking, IMS LTI Assignment and Grade Services = "Use this service for
> grade sync and column management", Accept grades. Fix: either delete Step 3 and state Dynamic
> Registration is the only supported path, or add the tool-side half — a documented, tested way to
> insert a `lti_registrations` row … e.g. a small `backend/scripts/lti-add-registration.js` run via
> `docker compose exec backend`, with a unit test against `store.js` — and correct the Moodle field
> names. Verify on lti-demo (fresh `reset-demo.ps1`), or mark the step unverified: :161 now says
> «Кроки перевірені» …

Обрано другий варіант рядка: **додати інструментальну половину** (скрипт + тести), а не видаляти
крок — ручна реєстрація потрібна там, де Moodle блокує динамічну, і саме це глухий кут, який рядок
описує. Живий прогін на lti-demo неможливий (Docker daemon недоступний), тож застосовано дозволений
рядок варіант «mark the step unverified».

## Код

- `backend/lti/manual-registration.js` (новий) — правила ручної реєстрації, відокремлені від БД:
  усі URL https без credentials (`http.parseHttpsUrl` — позиція registration.js); три ендпоінти
  платформи на origin issuer (те саме, що `grades.js` `pinnedUrl` вимагає в момент оцінки);
  client_id обов'язковий, ≤255; хоча б один deployment_id (`launch.js` звіряє з ним запуск, 403
  інакше). `MOODLE_ENDPOINTS` — стандартні `/mod/lti/auth.php`, `/mod/lti/token.php`,
  `/mod/lti/certs.php`.
- `backend/scripts/lti-add-registration.js` (новий) — CLI: `--from-moodle <origin>` заповнює три
  адреси й issuer (wwwroot Moodle), `--issuer` перекриває; або всі шість полів прапорцями;
  `--dry-run` перевіряє й друкує рядок без запису; `--help`. Запис — через наявний
  `store.saveRegistration` (upsert по (issuer, client_id)). Пише напряму в БД свідомо:
  write-ендпоінта для реєстрацій немає by design, а адмін із shell уже має БД.
- `backend/Dockerfile` — `COPY scripts ./scripts`, щоб
  `docker compose exec backend node scripts/lti-add-registration.js` працював в образі.
- `backend/package.json` — `lti:add-registration` для локального запуску.

## Тести

- `backend/test/unit/lti-manual-registration.test.js` (новий, 11 тестів, без БД): правила
  (https/credentials/origin-pin/client_id/deployments, нормалізація списку), парсинг прапорців
  (`--flag=value`, невідомі/без значення), `--from-moodle`, `--dry-run` нічого не пише, реальний
  прогін зберігає рівно валідований рядок через store, невалідний вихід 2 з причиною; пін, що
  Dockerfile копіює scripts/.
- `backend/test/integration/lti-manual-registration.test.js` (новий, 4 тести, проти СПРАВЖНЬОГО
  `lti/store.js` і Postgres — вимога рядка «unit test against store.js» закрита і stub-юнітом, і
  real-store тестом): рядок читається `getRegistration`/`listRegistrations` (те, що читає login),
  повторний прогін оновляє той самий рядок (upsert, не дубль), dry-run не пише, форма рядка модуля
  == форма store. Скіпається без БД, як усі integration-тести suites (на цій машині Postgres
  недоступний: 127.0.0.1:55432 ECONNREFUSED; 4 skipped — доказ нижче).

## Документація

`docs/self-host.md`:

- «Крок 3» переписано як дві половини: **3a** — форма Moodle зі справжніми назвами полів
  (Tool name, Tool URL, LTI version = LTI 1.3, Public key type = Keyset URL, Public keyset,
  Initiate login URL, Redirection URI(s), Supports Deep Linking, IMS LTI Assignment and Grade
  Services = grade sync and column management, NRPS = Do not use, Accept grades); вигадані
  «Метод автентифікації» і «Target link URI» прибрано; після збереження — «View configuration
  details» → Client ID / Deployment ID / Platform ID. **3b** —
  `docker compose exec backend node scripts/lti-add-registration.js --from-moodle … --client-id …
  --deployment-id … --dry-run`, потім без dry-run; пояснення 403 без другої половини.
- Явна позначка стану перевірки в кроці 3: «перевірений тестами правил і запису …, але не живим
  запуском на lti-demo» — дозволена рядком альтернатива живому прогону.
- Вступ розділу: замість загального «**Кроки перевірені на Moodle 5.0.2**» (рядок :161 у рев'ю) —
  «Крок 2 … перевірений на Moodle 5.0.2 (локальний стенд lti-demo); крок 3 … перевірений тестами,
  не живим запуском — позначено в ньому».
- «Якщо щось пішло не так»: нові пункти 403 «Платформа не зареєстрована» (→ крок 3b) і 403
  «Невідоме розгортання (deployment)» (→ правильний `--deployment-id`).
- «Що нового» — запис 2026-11-22 (P1c).

## Перевірка (запущене)

- RED на документі до правки (`git show origin/main:docs/self-host.md`): **12/12 предикатів FAIL**
  (скрипт, docker compose exec, 403, п'ять назв полів, відсутність вигаданих полів, позначка
  «не живим», відсутність загального «Кроки перевірені»).
- `node --test test/unit/lti-manual-registration.test.js` → **11 tests, 11 pass, 0 fail**.
- `node --test test/integration/lti-manual-registration.test.js` → **4 tests, 0 fail, 4 skipped**
  («no database reachable») — реальний store-прогін чекає на БД, як і решта integration-suite.
- CLI руками: `--help` rc=0; `--from-moodle … --dry-run` друкує повний рядок з трьома
  `/mod/lti/…` адресами, rc=0, нічого не пише; невалідний issuer (`http://`) → `refused: issuer має
  бути https-адресою…`, **exit=2**.
- `node --test scripts/test/selfhost-doc.test.mjs` → **17 tests, 17 pass, 0 fail** (2 нові P1c).
- `npm run test:scripts` → **110 tests, 110 pass, 0 fail, duration_ms 12324** (було 108).
- `cd backend && npm run test:unit` → **319 tests, 319 pass, 0 fail** (було 308; +11 P1c).
- Живий lti-demo (`reset-demo.ps1`) не запускався: Docker daemon недоступний
  (`docker version` → npipe … dockerDesktopLinuxEngine). Рядок прямо дозволяє позначити крок
  unverified — позначено і в кроці, і у вступі розділу.

Коміти virtual-lab: `0ca23b1 feat(lti): lti-add-registration script for a manual platform
registration (P1c)`, `e91fbd0 test(lti): manual registration against the real store (P1c)`.