# M1.2u — порядок COMPOSE_FILE у розділі «Редактор сценаріїв»

Рядок ROADMAP (Claude review 2026-11-21):

> Review of M1.2r (Claude, 2026-11-21): `docs/self-host.md` «Редактор сценаріїв» opens with
> `docker compose -f docker-compose.yml -f docker-compose.editor.yml up --build -d` and only
> afterwards tells the admin to put `COMPOSE_FILE` in `.env` — explicit `-f` replaces
> `COMPOSE_FILE`, so an admin who already runs the HTTPS overlay (as the HTTPS section now asks)
> and copies that first command recreates `frontend`/`backend` without `docker-compose.https.yml`:
> the 8443 listener and `REQUIRE_HTTPS` are gone, exactly the M1.2r failure. Fix: lead the section
> with the `COMPOSE_FILE` lines (https+editor variant first if HTTPS is on) and a plain
> `docker compose up --build -d`, keeping the explicit `-f` form only as "without HTTPS"; extend
> `scripts/test/selfhost-doc.test.mjs` so every `docker compose -f …` command in the doc either
> includes `docker-compose.https.yml` or is the documented restore pair / a section explicitly
> marked "without HTTPS".

## Що зроблено

`virtual-lab/docs/self-host.md`, розділ «Редактор сценаріїв» переписано у порядку, який не
ламає TLS-стек:

1. спершу блок `.env` з `COMPOSE_FILE=docker-compose.yml:docker-compose.https.yml:docker-compose.editor.yml`
   (варіант https+editor першим) і закоментований варіант без HTTPS; примітка про роздільник `;`
   на Windows;
2. далі проста `docker compose up --build -d`;
3. абзац «Чому не можна почати з явної пари `-f`» — явні `-f` замінюють `COMPOSE_FILE`, тож
   копія старої команди знімає 8443 і `REQUIRE_HTTPS`;
4. явна пара `-f … -f docker-compose.editor.yml` лишається лише під позначкою
   «лише без HTTPS-оверлея»;
5. текст про збірку з сусіднього `WebEngineTSEditor` і про сироту `editor` збережено.

## Тест (нові 2 у `scripts/test/selfhost-doc.test.mjs`)

- `every docker compose -f command keeps the https overlay, is the restore pair, or says "without HTTPS"` —
  іде по всьому документу: кожен рядок із `docker compose` та `-f docker-compose` мусить або містити
  `docker-compose.https.yml` (у межах команди + наступний рядок, бо команда переноситься), або бути
  парою base+restore, або стояти не далі ніж за 4 рядки під позначкою «без HTTPS».
- `the editor section leads with COMPOSE_FILE, not an explicit -f pair` — `COMPOSE_FILE=` мусить
  іти раніше за будь-яке `-f docker-compose` у розділі, і розділ мусить містити позначку «без HTTPS».

Гвард спершу хибно спрацював на `docker compose logs -f` (прапорець `-f` логов, не файл) —
регулярку звузено до `-f docker-compose`.

## Перевірка

- `node --test scripts/test/selfhost-doc.test.mjs` → **7/7 pass, 0 fail** (було 5 тестів).
- RED-доказ на документі до правки (`git show origin/main:docs/self-host.md`): новий гвард знаходить
  **1 порушення — рядок 414**, саме та стара перша команда розділу:
  `docker compose -f docker-compose.yml -f docker-compose.editor.yml up --build -d`.
- `npm run test:scripts` → **99 tests, 99 pass, 0 fail, duration_ms 12142** (без Docker;
  на `origin/main` було 97).
- `git status --porcelain` порожній після коміту; diff лише два файли рядка:
  `docs/self-host.md` (+38/−12) і `scripts/test/selfhost-doc.test.mjs` (+31).

Коміт virtual-lab: `7844d8d docs(self-host): editor section leads with COMPOSE_FILE, -f only without HTTPS (M1.2u)`.