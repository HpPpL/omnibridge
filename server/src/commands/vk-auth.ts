import { VkClient, VkApiError } from '../sources/vk-user/client.js'

/**
 * Проверка VK user-токена: валиден ли и есть ли доступ к личным сообщениям.
 *
 *   npm run vk-auth -- <token>      # токен аргументом
 *   npm run vk-auth                 # токен из VK_USER_TOKEN (.env)
 */
async function main(): Promise<void> {
  const token = process.argv[2] || process.env.VK_USER_TOKEN
  if (!token) {
    console.error('✖ Передай токен: npm run vk-auth -- <token>')
    console.error('  (или задай VK_USER_TOKEN в server/.env)')
    process.exit(1)
  }

  const client = new VkClient(token)

  // 1) Токен вообще валиден? users.get — самый дешёвый метод.
  let me: { id: number; first_name: string; last_name: string }
  try {
    const users = await client.api<Array<typeof me>>('users.get', {
      fields: 'first_name,last_name',
    })
    me = users[0]!
  } catch (err) {
    if (err instanceof VkApiError && err.code === 5) {
      console.error('✖ Токен недействителен или истёк.')
      process.exit(2)
    }
    throw err
  }
  console.log(`✔ Токен валиден. Аккаунт: ${me.first_name} ${me.last_name} (vk:${me.id})`)

  // 2) Есть ли доступ к личке? Пробуем прочитать один диалог.
  try {
    const { total } = await client.getConversations(`vk:${me.id}`, { count: 1 })
    console.log(`✔ Доступ к личным сообщениям есть. Диалогов всего: ${total}`)
    console.log('\nГотово — можно запускать `npm run dialogs`.')
  } catch (err) {
    if (err instanceof VkApiError) {
      console.error(`✖ ${err.message}`)
      console.error('  Токен рабочий, но без прав messages — личные сообщения им не получить.')
      console.error('  Нужен токен со scope messages (см. server/README.md).')
      process.exit(3)
    }
    throw err
  }
}

main().catch((err) => {
  console.error('✖ Ошибка:', (err as Error).message)
  process.exit(1)
})
