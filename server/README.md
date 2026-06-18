# OmniBridge · server

Бэкенд-пайплайн: держит сессию аккаунта, выгружает/слушает сообщения, нормализует
и доставляет в выбранный канал.

```
Источник ──▶ UnifiedMessage ──▶ хранилище (SQLite) ──▶ Назначение
                core/types.ts        storage/             destinations/
                              core/pipeline.ts (роутинг)
```

Два источника:

- **Личный аккаунт ВК** (`sources/vk-user/`) — личные сообщения по user-токену:
  список диалогов → бэкфилл истории выбранных → live-приём новых. **В работе.**
- **Сообщество ВК** (`sources/vk.ts`) — сообщения сообщества через bots long poll.

## Личные сообщения ВК (основной сценарий)

Доступ — по **user-токену** с правами `messages`. Получить помогает ловец токена
(вход на стороне vk.com, пароль в скрипт не попадает):

```bash
# 1. Создай Standalone-приложение на https://dev.vk.com → возьми его ID
# 2. В настройках приложения добавь Trusted redirect URI: http://localhost:8790/callback
npm run vk-token -- --app <APP_ID>     # откроет vk.com, поймает токен, сохранит в .env
```

> ⚠️ Новым приложениям VK обычно не выдаёт scope `messages` — тогда токен получишь,
> но доступа к личке не будет (`vk-token` сразу это покажет). Это ограничение
> политики VK, а не скрипта; обходные пути с чужим `client_id` нарушают ToS VK.

Реализуется по стадиям:

| Стадия | Что | Статус |
|---|---|---|
| 1. Discovery | список диалогов → SQLite (`npm run dialogs`) | ✅ готово |
| 2. Backfill | постраничная выгрузка истории выбранных диалогов | ⏳ |
| 3. Live | User Long Poll, новые сообщения → доставка | ⏳ |

```bash
cd server && npm install
cp .env.example .env                    # вставить VK_USER_TOKEN
npm run vk-auth -- <token>              # проверить: токен валиден? есть доступ к личке?
npm run dialogs                         # показать диалоги и их peer_id, записать в БД
VK_DIALOGS=12345,-678 npm run dialogs   # отметить выбранные
```

`vk-auth` сообщает три исхода: токен недействителен · валиден, но без прав
`messages` · валиден и доступ к личке есть (тогда `dialogs` заработает).

Хранилище — SQLite через встроенный `node:sqlite` (флаг `--experimental-sqlite`
уже в npm-скриптах), без внешних зависимостей. Путь — `DB_PATH` (по умолч. `omnibridge.db`).

## Сообщество ВК → Telegram

```bash
cp .env.example .env          # VK_GROUP_ID, VK_TOKEN, TELEGRAM_*
npm run dev                   # health: curl localhost:8787/health
```

> Для сообщества: включи **Long Poll API** и событие «Входящее сообщение», токен —
> с правами на сообщения. Telegram-бот должен состоять в целевом чате/канале.

## Структура

```
src/
  core/types.ts        UnifiedMessage, Dialog
  core/pipeline.ts     роутинг источник→назначение
  storage/db.ts        схема SQLite
  storage/repo.ts      доступ к данным (диалоги, сообщения, курсоры)
  sources/vk-user/     личный аккаунт ВК (client.ts + session — в работе)
  sources/vk.ts        сообщество ВК (bots long poll)
  destinations/        Telegram (далее Slack, Discord)
  commands/            CLI: list-dialogs
```

## TODO

- Стадии 2–3 источника личных сообщений (backfill + live `VkUserSession`).
- Привязка выбора диалогов к UI (сейчас через `VK_DIALOGS`).
- Источники: Instagram, WhatsApp. Назначения: Slack, Discord.
- Передача вложений (сейчас считается только количество), очередь и ретраи доставки.
- Хранение токенов зашифрованными.
