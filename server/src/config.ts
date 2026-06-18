/** Конфигурация приложения из переменных окружения (.env). */
export interface AppConfig {
  vk: { groupId: string; token: string }
  telegram: { botToken: string; chatId: string }
  port: number
}

function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(`✖ Не задана переменная окружения ${name}.`)
    console.error('  Скопируй server/.env.example → server/.env и заполни значения.')
    process.exit(1)
  }
  return value
}

export function loadConfig(): AppConfig {
  return {
    vk: {
      groupId: required('VK_GROUP_ID'),
      token: required('VK_TOKEN'),
    },
    telegram: {
      botToken: required('TELEGRAM_BOT_TOKEN'),
      chatId: required('TELEGRAM_CHAT_ID'),
    },
    port: Number(process.env.PORT ?? 8787),
  }
}
