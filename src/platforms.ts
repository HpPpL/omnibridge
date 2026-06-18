import type { PlatformId, PlatformMeta } from './types'

/**
 * Каталог поддерживаемых платформ. Добавить новую интеграцию = добавить запись
 * сюда (и позже — адаптер на бэкенде).
 */
export const PLATFORMS: Record<PlatformId, PlatformMeta> = {
  vk: {
    id: 'vk',
    name: 'ВКонтакте',
    color: '#0077ff',
    tagline: 'Сообщения сообщества',
    roles: ['source'],
    fields: [
      { key: 'groupId', label: 'ID сообщества', placeholder: '123456789' },
      { key: 'token', label: 'Access token', type: 'password', placeholder: 'vk1.a.…', hint: 'Ключ доступа сообщества с правами на сообщения.' },
    ],
  },
  instagram: {
    id: 'instagram',
    name: 'Instagram',
    color: '#e1306c',
    tagline: 'Direct и комментарии',
    roles: ['source'],
    fields: [
      { key: 'pageId', label: 'ID страницы', placeholder: '178414…' },
      { key: 'token', label: 'Graph API token', type: 'password', placeholder: 'EAAG…', hint: 'Долгоживущий токен страницы (Meta Graph API).' },
    ],
  },
  whatsapp: {
    id: 'whatsapp',
    name: 'WhatsApp',
    color: '#25d366',
    tagline: 'Business Cloud API',
    roles: ['source', 'destination'],
    fields: [
      { key: 'phoneId', label: 'Phone number ID', placeholder: '109…' },
      { key: 'token', label: 'API token', type: 'password', placeholder: 'EAAG…' },
    ],
  },
  telegram: {
    id: 'telegram',
    name: 'Telegram',
    color: '#229ed9',
    tagline: 'Бот / канал',
    roles: ['source', 'destination'],
    fields: [
      { key: 'botToken', label: 'Bot token', type: 'password', placeholder: '123456:ABC-…', hint: 'Получить у @BotFather.' },
      { key: 'chatId', label: 'Chat ID', placeholder: '-1001234567890', hint: 'Куда пересылать сообщения.' },
    ],
  },
  slack: {
    id: 'slack',
    name: 'Slack',
    color: '#611f69',
    tagline: 'Канал рабочего пространства',
    roles: ['destination'],
    fields: [
      { key: 'webhook', label: 'Incoming webhook URL', type: 'password', placeholder: 'https://hooks.slack.com/…' },
      { key: 'channel', label: 'Канал', placeholder: '#inbox' },
    ],
  },
  discord: {
    id: 'discord',
    name: 'Discord',
    color: '#5865f2',
    tagline: 'Канал сервера',
    roles: ['destination'],
    fields: [
      { key: 'webhook', label: 'Webhook URL', type: 'password', placeholder: 'https://discord.com/api/webhooks/…' },
    ],
  },
}

export const ALL_PLATFORMS = Object.values(PLATFORMS)

/** Первая буква названия — для аватара-заглушки блока. */
export function platformInitial(id: PlatformId): string {
  return PLATFORMS[id].name.charAt(0).toUpperCase()
}
