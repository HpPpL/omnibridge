import http from 'node:http'
import { loadConfig } from './config.js'
import { VkSource } from './sources/vk.js'
import { TelegramDestination } from './destinations/telegram.js'
import { Pipeline } from './core/pipeline.js'

const cfg = loadConfig()

// Пока пайплайн собирается из env под единственный маршрут VK → Telegram.
// Архитектура (Source/Destination/Route) уже готова к сборке из конфига UI.
const sources = [
  new VkSource({ id: 'src_vk', groupId: cfg.vk.groupId, token: cfg.vk.token }),
]
const destinations = [
  new TelegramDestination({
    id: 'dst_tg',
    botToken: cfg.telegram.botToken,
    chatId: cfg.telegram.chatId,
  }),
]
const routes = [{ from: 'src_vk', to: 'dst_tg' }]

const pipeline = new Pipeline(sources, destinations, routes)
await pipeline.start()
console.log('✔ OmniBridge: пайплайн VK → Telegram запущен')

// Минимальный health-эндпоинт (пригодится для деплоя/мониторинга).
http
  .createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok', sources: sources.length, routes: routes.length }))
      return
    }
    res.writeHead(404)
    res.end()
  })
  .listen(cfg.port, () => console.log(`  health: http://localhost:${cfg.port}/health`))

async function shutdown(): Promise<void> {
  console.log('\nостановка пайплайна…')
  await pipeline.stop()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
