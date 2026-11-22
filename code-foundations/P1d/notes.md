# P1d — LTI: публічно довірений сертифікат на 443 (серверні запити Moodle)

Рядок ROADMAP (Claude review 2026-11-19), ключове дослівно:

> Moodle fetches the tool's `/api/lti/jwks` server-side for the deep-link return and the AGS token
> (`mod/lti` keyset verification), and by default allows only ports 443/80 (`curlsecurityallowedport`),
> blocks private IP ranges (`curlsecurityblockedhosts`) and rejects untrusted certificates — so with
> the guide's own example, launches work but «Select content» and every grade post fail. lti-demo works
> only because it runs on 443 with a CA Moodle trusts … Fix: state that LTI needs a publicly trusted
> certificate (P5b's «Власний (production) сертифікат» mount) on 443 — `HTTPS_PORT=443` in `.env`,
> `LTI_PUBLIC_URL` without a port — or list the Moodle settings to change (allowed cURL port, unblocked
> range, `curl.cainfo`); TLS terminated on the admin's own proxy → `TRUST_PROXY` (`.env.example`) so
> `/api/lti` rate limits are per client; mark accepting a self-signed certificate as demo-only.

Docs-only рядок (`P`), файли — `docs/self-host.md` (+ doc-тест).

## Що зроблено

`docs/self-host.md`, розділ «Робота як LTI-інструмент (Moodle)»:

1. Новий підрозділ передумови **«Сертифікат має бути публічно довіреним, і на 443»**:
   - Moodle звертається до платформи **сам, зі свого сервера**: `/api/lti/jwks` під час повернення
     з «Select content» і токен AGS перед кожною оцінкою; це PHP cURL;
   - три дефолтні обмеження Moodle названо з їхніми іменами: `curlsecurityallowedport` (443/80),
     `curlsecurityblockedhosts` (приватні діапазони), відмова від недовіреного сертифіката;
   - наслідок для прикладу з портом: запуск лабораторної працює (браузер студента), а «Select
     content» і оцінки не доходять; чому `lti-demo` працює (443 + довірений CA, `docs/lti-demo.md`);
   - правильний шлях: публічно довірений сертифікат (розділ «Власний (production) сертифікат»),
     `HTTPS_PORT=443` у `.env`, `LTI_PUBLIC_URL` без порту, досяжність з сервера Moodle;
   - альтернатива — перелік налаштувань Moodle (`curlsecurityallowedport`,
     `curlsecurityblockedhosts`, `curl.cainfo`) з посиланням на *Site administration → Security →
     HTTP security*;
   - самопідписаний сертифікат позначено як **режим демонстрації**;
   - TLS на власному проксі → `TRUST_PROXY=2`, щоб ліміти `/api/lti` були за адресою клієнта
     (посилання на підрозділ P5d).
2. Приклад кроку 1: `LTI_PUBLIC_URL=https://lab.example.edu` (без `:8443`); у поясненні поля
   додано «для Moodle без змін налаштувань — 443».
3. «Якщо щось пішло не так»: пункт про порожнє «Select content» розділено на причину
   `LTI_FRAME_ANCESTORS` і **серверну** причину; прийняття самопідписаного сертифіката
   позначено як демонстраційне, «для університету це не рішення». Додано пункт «оцінка не
   доходить до журналу Moodle» з тією ж серверною причиною.
4. «Що нового» — запис 2026-11-22 (P1d).

## Тести (2 нові у `scripts/test/selfhost-doc.test.mjs`)

- `the LTI prerequisite states Moodle's server-side fetches and the trusted-cert/443 requirement` —
  підрозділ передумови мусить називати `/api/lti/jwks`, AGS, `curlsecurityallowedport`,
  `curlsecurityblockedhosts`, `curl.cainfo`, `HTTPS_PORT=443`, `TRUST_PROXY=2`;
- `the LTI example URL carries no non-443 port and self-signed is demo-only` — жоден приклад
  `LTI_PUBLIC_URL=` не має порту; приклад — `https://lab.example.edu`; самопідписаний позначений
  як демонстрація.

## Перевірка

- RED на документі до правки (`git show origin/main:docs/self-host.md`): **усі 9 предикатів FAIL**
  (`/api/lti/jwks`, `AGS`, `curlsecurityallowedport`, `curlsecurityblockedhosts`, `curl.cainfo`,
  `HTTPS_PORT=443`, `TRUST_PROXY=2`, приклад без порту — «FAIL — example carries :8443»,
  самопідписаний як демо).
- GREEN: `node --test scripts/test/selfhost-doc.test.mjs` → **15 tests, 15 pass, 0 fail**.
- `npm run test:scripts` → **108 tests, 108 pass, 0 fail, duration_ms 11502** (було 106).
- `cd backend && npm run test:unit` → **308 tests, 308 pass, 0 fail**.
- Живий прогін на lti-demo не робився: Docker daemon недоступний
  (`docker version` → npipe … dockerDesktopLinuxEngine not found). Рядок P1d не вимагає живого
  прогону (на відміну від P1c); доказ — текст + doc-тести.

Коміти virtual-lab: `46dd0d9 docs(self-host): LTI prerequisite needs a publicly trusted cert on 443 (P1d)`,
`e180e9f docs(self-host): keep the (8443) pointer to the HTTPS section in the LTI prerequisite`.