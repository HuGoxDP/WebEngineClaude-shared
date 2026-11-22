# P5d — редирект http→https поважає TLS-проксі (X-Forwarded-Proto)

Рядок ROADMAP (Claude review 2026-11-19), ключове дослівно:

> `nginx/10-https-redirect.sh` renders `if ($scheme = http) { return 301 https://$host:<port>$request_uri; }`,
> while `nginx.conf` already trusts an upstream proxy's `X-Forwarded-Proto`
> (`map $http_x_forwarded_proto $vl_forwarded_proto`, sent to the API). An admin whose own TLS proxy
> terminates TLS and forwards plain http to :8044 … gets a 301 to itself on every request — an endless
> loop … Fix: render `if ($vl_forwarded_proto = http)` (a direct :80 client that claims https only
> skips its own redirect, the same trust D4 already accepts); in `docs/self-host.md` say the proxy must
> send `X-Forwarded-Proto: https` with `TRUST_PROXY=2`, and that under the overlay the update check
> `curl http://localhost:8044/api/health` answers 301 (use
> `curl -k https://127.0.0.1:${HTTPS_PORT:-8443}/api/health`). Tests in
> `scripts/test/https-redirect.test.mjs`: the rendered include tests `$vl_forwarded_proto`, not
> `$scheme`; an nginx-config test (or the selfhost-check https leg) where a request to :80 with
> `X-Forwarded-Proto: https` gets 200, without it 301.

Рядок дозволяє замість живого запиту nginx-config-тест, тож Docker не потрібен.

## Код

`nginx/10-https-redirect.sh` — рендер: `if ($vl_forwarded_proto = http)`. Заголовок файла
переписано: умова читає той самий `map $http_x_forwarded_proto $vl_forwarded_proto`, що вже
живить API, із тим самим обґрунтуванням (дослідження D4; прямий клієнт :80, що заявить https,
лише пропускає власний редирект).

`nginx/nginx.conf` — коментар біля `include /etc/nginx/https-redirect.conf;` оновлено на нову
умову з поясненням P5d. Сам `map` не змінювався (він уже коректний, і `backend/test/unit/
nginx-forwarded-proto.test.js` його пінить).

## Документація

`docs/self-host.md`:

- новий підрозділ «Власний TLS-проксі попереду стека»: проксі мусить надсилати
  `X-Forwarded-Proto: https` (приклад `proxy_set_header` для nginx), `TRUST_PROXY=2` у `.env`
  (два проксі: свій + nginx стека), пояснення нескінченного циклу без заголовка;
- у розділі «HTTPS» — абзац, що під оверлеєм простий `curl http://localhost:8044/api/health`
  відповідає **301**, перевіряти треба `curl -k https://127.0.0.1:${HTTPS_PORT:-8443}/api/health`;
- крок 4 «Як оновитися» отримав те саме уточнення (це і є «update check» з рядка);
- «Що нового» — запис 2026-11-22 (P5d).

## Тести

`scripts/test/https-redirect.test.mjs`:

- наявний тест рендера посилено: include мусить містити `if ($vl_forwarded_proto = http)` і **не**
  містити `$scheme` (коментар-шапку файла теж приведено до нової умови);
- новий `redirect decision: X-Forwarded-Proto https is served, absent/plain http redirects` —
  читає `map` з `nginx.conf`, рендерить include і перевіряє чотири випадки: `X-Forwarded-Proto:
  https` на :80 → **200** (не редirekt), без заголовка → 301, `http` → 301, https-з'єднання → 200.
  Це заміна живого запиту, який рядок дозволяє замінити конфіг-тестом (Docker на машині не
  запущений: `docker version` → «failed to connect to the docker API … dockerDesktopLinuxEngine»).

`scripts/test/selfhost-doc.test.mjs` — 2 нові: розділ «HTTPS» називає `X-Forwarded-Proto`,
`TRUST_PROXY=2` і 301; і TLS-проба здоров'я є і в «HTTPS», і в «Оновленні».

## Перевірка (запущене)

- RED на старому скрипті (`git show origin/main:nginx/10-https-redirect.sh`, рендер у temp):
  include `if ($scheme = http) …` → `tests $vl_forwarded_proto: FAIL`, `must not test $scheme: FAIL`,
  модель рішення: заголовок `https` на :80 → **FAIL — 301 на самого себе (нескінченний цикл)**.
- `bash -n nginx/10-https-redirect.sh` → **OK (rc=0)**; `sh -n …` → **OK (rc=0)**.
- Ручний рендер з `HTTPS_REDIRECT_PORT=8443`:
  `if ($vl_forwarded_proto = http) { return 301 https://$host:8443$request_uri; }`.
- `node --test scripts/test/https-redirect.test.mjs scripts/test/selfhost-doc.test.mjs` →
  **18 tests, 18 pass, 0 fail**.
- `npm run test:scripts` → **106 tests, 106 pass, 0 fail, duration_ms 10647** (було 103).
- `cd backend && npm run test:unit` → **308 tests, 308 pass, 0 fail** (nginx-конфіг піни
  `nginx-forwarded-proto.test.js` + `nginx-lti-frame.test.js`: 8/8 окремо).
- Живий прогін `selfhost-check --https` не виконано: Docker daemon недоступний на цій машині
  (`docker version` → npipe … dockerDesktopLinuxEngine not found). Рядок це передбачає —
  конфіг-тест замість нього.

Коміт virtual-lab: `fb1e944 fix(nginx): http->https redirect reads X-Forwarded-Proto, not $scheme (P5d)`.