# P5e — оновлення через P5c не втрачає бекап при власному BACKUP_DIR

Рядок ROADMAP (Claude review 2026-11-21), скорочено дослівно в ключовій частині:

> `docs/self-host.md` «Як оновитися» step 1 (`docker compose run --rm -e BACKUP_RUN_ONCE=1 backup`, :91)
> runs **before** `git pull`, i.e. on the pre-P5c compose whose container env is still
> `BACKUP_DIR: ${BACKUP_DIR:-/backups}` — with `BACKUP_DIR=/mnt/offsite` the dump lands in
> `/mnt/offsite` inside the `--rm` container and is deleted with it, and :92
> (`verify-backup.mjs backup/out/<…>`) then has nothing to verify … step 3's `up -d --build` then
> recreates `VirtualLabBackup` (its environment changed) and drops every nightly backup the old
> container kept in its own layer … Fix: step 1 as
> `docker compose run --rm -e BACKUP_DIR=/backups -e BACKUP_RUN_ONCE=1 backup` … and verify under
> `${BACKUP_DIR:-backup/out}/<…>` until HO1b's in-container verify lands; in «Що нового», for this one
> update, before step 3: `docker cp VirtualLabBackup:<old BACKUP_DIR>/. <old BACKUP_DIR>/` to keep the
> old container's backups. Optional: drop the hard-coded `-v "$PWD/backup/out:/backups"` from the
> rollback restore (:167) and the `docker-compose.restore.yml` header (:11) … (keep `-e`).
> Test in `scripts/test/selfhost-doc.test.mjs`: the update's step-1 backup command carries
> `-e BACKUP_DIR=/backups`. Files: docs/self-host.md, docker-compose.restore.yml,
> scripts/test/selfhost-doc.test.mjs.

## Що зроблено

`docs/self-host.md`:

1. Крок 1 «Як оновитися»: `docker compose run --rm -e BACKUP_DIR=/backups -e BACKUP_RUN_ONCE=1 backup`;
   перевірка — `node scripts/lib/verify-backup.mjs "${BACKUP_DIR:-backup/out}/<каталог-бекапу>"`.
   Абзац пояснює, що прапорець задає шлях **усередині** контейнера, правильний і до, і після P5c,
   і що перевірка читає каталог **хоста**.
2. У кроці 1, перед кроком 3 — блок «Оновлення через P5c (листопад 2026) — ще один крок»:
   `docker cp VirtualLabBackup:<старий BACKUP_DIR>/. <старий BACKUP_DIR>/` з поясненням, що
   підставити (старе значення з `.env`), і що крок пропускається, якщо контейнера вже немає.
3. «Що нового» — запис **2026-11-22 (P5e)** з тією ж командою `docker cp` і згадкою про `-v`.
4. Відкат, крок 3: прибрано `-v "$PWD/backup/out:/backups"` (опційний пункт рядка); `-e BACKUP_DIR=/backups`
   лишився. Абзац пояснює, чому `-v` більше не потрібен (монтування сервісу саме читає `BACKUP_DIR`).

`docker-compose.restore.yml` — лише заголовок-коментар (:11): прибрано `-v` з прикладу, додано
пояснення P5e (монтування слідує `BACKUP_DIR`; `-e` лишається, бо фіксує шлях усередині контейнера).
Тіло YAML не змінено (перевірено: не закоментовані рядки ідентичні).

## Тести (4 нові у `scripts/test/selfhost-doc.test.mjs`)

- `update step 1 pins BACKUP_DIR=/backups in the backup command` — саме той тест, що його вимагає рядок;
- `update step 1 verifies the HOST folder (${BACKUP_DIR:-backup/out}), not /backups`;
- `the P5c update keeps the old container backups with docker cp before the rebuild` — команда стоїть
  до кроку 3 і дублюється в «Що нового»;
- `the rollback restore keeps -e BACKUP_DIR=/backups but no hard-coded backup/out -v`.

## Перевірка

- RED на документі до правки (`git show origin/main:docs/self-host.md`, ті самі 4 предикати):
  **усі 4 FAIL** — `docker compose run --rm -e BACKUP_RUN_ONCE=1 backup` (без піна),
  `verify-backup.mjs backup/out/<…>` (не слідує BACKUP_DIR), `no docker cp in update section`,
  `restore still carries a hard-coded -v`.
- GREEN: `node --test scripts/test/selfhost-doc.test.mjs` → **11 tests, 11 pass, 0 fail**.
- `npm run test:scripts` → **103 tests, 103 pass, 0 fail, duration_ms 11766** (без Docker; було 99).
- `docker-compose.restore.yml`: не закоментовані рядки ідентичні до правки — зміна суто коментарна.
- `git status --porcelain` порожній після коміту; diff лише 3 файли рядка:
  `docs/self-host.md` (+45/−?), `docker-compose.restore.yml` (+8), `scripts/test/selfhost-doc.test.mjs` (+48).

Коміт virtual-lab: `bb41356 docs(self-host): pre-update backup pins BACKUP_DIR=/backups, host verify + P5c rescue (P5e)`.