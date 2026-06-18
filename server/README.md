# OmniBridge · server

Бэкенд-пайплайн: опрашивает источники, нормализует сообщения и доставляет в
назначения. Сейчас собран сквозной маршрут **ВКонтакте → Telegram**.

```
Источник (VK Long Poll) ──▶ UnifiedMessage ──▶ Назначение (Telegram Bot API)
        sources/vk.ts          core/types.ts        destinations/telegram.ts
                              core/pipeline.ts (роутинг по маршрутам)
```

## Запуск

```bash
cd server
npm install
cp .env.example .env      # заполнить токены VK и Telegram
npm run dev               # авто-перезапуск при правках
```

Проверка живости: `curl localhost:8787/health`.

## Переменные окружения

См. `.env.example`. Нужны: `VK_GROUP_ID`, `VK_TOKEN` (источник),
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (назначение).

> Чтобы VK слал события, в сообществе включи **Long Poll API** (последняя версия)
> и тип события «Входящее сообщение», а у токена должны быть права на сообщения.
> Telegram-бот должен состоять в целевом чате/канале.

## Как добавить платформу

- **Источник** — класс в `src/sources/`, реализующий `Source` (`start`/`stop`),
  приводящий сырой объект к `UnifiedMessage`.
- **Назначение** — класс в `src/destinations/`, реализующий `Destination.send`.
- Зарегистрировать экземпляр и маршрут в `src/index.ts`.

## TODO

- Сборка пайплайна из конфига UI (а не из env).
- Источники: Instagram, WhatsApp. Назначения: Slack, Discord.
- Передача вложений (сейчас считается только их количество).
- Очередь и ретраи доставки, хранение секретов в БД зашифрованными.
