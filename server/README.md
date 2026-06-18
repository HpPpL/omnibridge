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
# Создай Standalone-приложение на https://dev.vk.com → возьми его ID
npm run vk-token -- --app <APP_ID> --manual   # надёжно: вставить URL из адресной строки
npm run vk-token -- --app <APP_ID>            # авто: localhost-ловец (нужен redirect URI)
```

- `--manual` — после входа ВК перекинет на `oauth.vk.com/blank.html`, копируешь URL
  из адресной строки и вставляешь в терминал. **Настройка redirect URI не нужна.**
- Авто-режим ловит токен сам, но требует прописать в настройках приложения
  Trusted redirect URI `http://localhost:8790/callback`. Это поле в кабинете VK
  бывает спрятано (показывается только у типа «Веб-сайт»/VK ID) — если не находишь,
  бери `--manual`.

> ⚠️ Новым приложениям VK обычно не выдаёт scope `messages` — тогда токен получишь,
> но доступа к личке не будет (`vk-token` сразу это покажет). Это ограничение
> политики VK, а не скрипта; обходные пути с чужим `client_id` нарушают ToS VK.

Реализуется по стадиям:

| Стадия | Что | Статус |
|---|---|---|
| 1. Discovery | список диалогов → SQLite (`npm run dialogs`) | ✅ |
| 2. Backfill | постраничная выгрузка истории выбранных (`npm run backfill`) | ✅ |
| 3. Live | User Long Poll, новые сообщения → доставка (`npm run live`) | ✅ |

### Мок-режим (отладка без токена)

Доступ к личным сообщениям ВК официально не выдаёт (`messages` → `invalid scope`),
поэтому стадии 2–3 отлаживаются на фейковых данных: `VK_MOCK=1` подменяет источник.

```bash
VK_MOCK=1 npm run dialogs                          # 3 мок-диалога → БД
VK_MOCK=1 VK_DIALOGS=2001,2000000001 npm run dialogs   # выбрать
VK_MOCK=1 npm run backfill                         # выгрузить историю в SQLite
npm run export -- --dialog 2001                    # NDJSON в stdout
npm run export -- --dialog 2001 --format json --out chat.json
VK_MOCK=1 npm run deliver                          # выгрузить сохранённую историю в бота
VK_MOCK=1 npm run deliver -- --dialog 2002         # только один собеседник
VK_MOCK=1 npm run live                             # эмуляция новых → сохранение + доставка
```

### Доставка в Telegram-бота

Чтобы слать в реального бота (а не в консоль), задай в `.env`:

```bash
# 1. Создай бота у @BotFather → получишь TELEGRAM_BOT_TOKEN
# 2. Узнай id чата: напиши боту, открой
#    https://api.telegram.org/bot<TOKEN>/getUpdates → возьми chat.id
TELEGRAM_BOT_TOKEN=123456:ABC-...
TELEGRAM_CHAT_ID=123456789
```

После этого `npm run deliver` и `npm run live` шлют в Telegram. Полный тест без
реального VK-токена: `VK_MOCK=1 npm run dialogs/backfill/deliver` — фейковая
переписка приедет в твоего бота. Выбор собеседников — через `VK_DIALOGS`.

### Управляющий бот (меню)

```bash
VK_MOCK=1 npm run bot      # держит бота: меню, список диалогов, переключение отслеживания
```

Команды (видны в меню «/»): `/dialogs` — список диалогов с переключателями
отслеживания (✅/⬜) и просмотром переписки (👁), `/tracked` — кто отслеживается.
Нажатие на имя включает/выключает диалог (тот же флаг, что читают `deliver`/`live`).
Управление разрешено только владельцу — `TELEGRAM_CHAT_ID`.

`npm run live` держит сессию и на каждое новое сообщение из выбранных диалогов:
сохраняет в хранилище (идемпотентно) и доставляет в назначения. Если Telegram не
настроен (`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`) — доставка идёт в консоль, отметки
`delivered_to` всё равно проставляются. В мок-режиме источник эмитит несколько
тестовых сообщений (`VK_MOCK_LIVE_COUNT`, `VK_MOCK_LIVE_INTERVAL_MS`) и завершается.

Бэкфилл идемпотентен и возобновляем (курсор `backfill_cursor`): повторный запуск
добавит только новое. Экспорт читает из SQLite офлайн; формат записи — нормализованный
`StoredMessage` (направление, автор, текст, вложения, время, отметки доставки).

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
  core/backfill.ts     постраничная выгрузка истории (курсор, идемпотентность)
  storage/db.ts        схема SQLite
  storage/repo.ts      доступ к данным (диалоги, сообщения, курсоры)
  sources/vk-user/     личный аккаунт ВК: api, client, mock, live (long poll + мок)
  sources/vk.ts        сообщество ВК (bots long poll)
  destinations/        Telegram, Console (далее Slack, Discord)
  telegram/client.ts   Bot API: long polling, кнопки (для управляющего бота)
  commands/            CLI: list-dialogs, backfill, export, deliver, live, bot, vk-auth, vk-token
```

## TODO

- Стадии 2–3 источника личных сообщений (backfill + live `VkUserSession`).
- Привязка выбора диалогов к UI (сейчас через `VK_DIALOGS`).
- Источники: Instagram, WhatsApp. Назначения: Slack, Discord.
- Передача вложений (сейчас считается только количество), очередь и ретраи доставки.
- Хранение токенов зашифрованными.
