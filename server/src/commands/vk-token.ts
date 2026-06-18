import http from 'node:http'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { exec } from 'node:child_process'
import * as readline from 'node:readline/promises'
import { VkClient, VkApiError } from '../sources/vk-user/client.js'

/**
 * Ловец VK-токена через implicit-flow ТВОЕГО Standalone-приложения.
 * Пароль вводится только на vk.com; скрипт лишь забирает токен из редиректа.
 *
 *   npm run vk-token -- --app <APP_ID>            # авто: localhost-ловец
 *   npm run vk-token -- --app <APP_ID> --manual   # ручной: вставить URL из адресной строки
 *
 * Авто-режим требует добавить в настройках приложения Trusted redirect URI
 *   http://localhost:8790/callback
 * Если такого поля в кабинете нет — используй --manual (redirect URI не нужен).
 *
 * Замечание: scope messages новым приложениям VK обычно не выдаёт — тогда токен
 * получишь, но доступа к личке не будет (проверка это покажет).
 */
const API_VERSION = '5.199'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const appId = arg('app') ?? process.env.VK_APP_ID
if (!appId) {
  console.error('✖ Нужен id твоего Standalone-приложения VK:')
  console.error('  npm run vk-token -- --app <APP_ID>   (или VK_APP_ID в .env)')
  process.exit(1)
}

const manual = process.argv.includes('--manual')
const port = Number(arg('port') ?? process.env.VK_AUTH_PORT ?? 8790)
const scope = arg('scope') ?? 'messages,offline'
const envPath = arg('env') ?? '.env'
// В ручном режиме редирект на стандартный blank.html — он не требует настройки в кабинете.
const redirectUri = manual ? 'https://oauth.vk.com/blank.html' : `http://localhost:${port}/callback`

const authorizeUrl =
  'https://oauth.vk.com/authorize?' +
  new URLSearchParams({
    client_id: appId,
    display: 'page',
    redirect_uri: redirectUri,
    scope,
    response_type: 'token',
    v: API_VERSION,
    revoke: '1',
  }).toString()

/** JS-страница: достаёт токен из location.hash и шлёт на /token. */
const CALLBACK_PAGE = `<!doctype html><meta charset="utf-8">
<body style="font-family:system-ui;padding:40px;max-width:640px">
<h2 id="s">Обработка…</h2><pre id="m" style="color:#888"></pre>
<script>
  const h = new URLSearchParams(location.hash.slice(1));
  const q = new URLSearchParams(location.search);
  const token = h.get('access_token');
  const err = q.get('error_description') || q.get('error') || h.get('error');
  const post = (b) => fetch('/token', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});
  if (token) {
    post({token, user_id:h.get('user_id'), expires_in:h.get('expires_in')})
      .then(()=>{document.getElementById('s').textContent='✓ Токен получен — вернись в терминал, вкладку можно закрыть.';});
  } else {
    document.getElementById('s').textContent='✗ Токен не получен';
    document.getElementById('m').textContent = err || location.href;
    post({error: err || 'no token in redirect'});
  }
</script>`

interface CaptureResult {
  token?: string
  user_id?: string
  expires_in?: string
  error?: string
}

function waitForToken(): Promise<CaptureResult> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.method === 'GET' && req.url?.startsWith('/callback')) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end(CALLBACK_PAGE)
        return
      }
      if (req.method === 'POST' && req.url === '/token') {
        let body = ''
        req.on('data', (c) => (body += c))
        req.on('end', () => {
          res.writeHead(204)
          res.end()
          server.close()
          try {
            resolve(JSON.parse(body) as CaptureResult)
          } catch {
            resolve({ error: 'не разобрал ответ браузера' })
          }
        })
        return
      }
      res.writeHead(404)
      res.end()
    })
    server.listen(port, () => console.log(`Ловец слушает ${redirectUri}\n`))
  })
}

/** Обновляет/добавляет ключ в .env, не трогая остальное. */
function upsertEnv(path: string, key: string, value: string): void {
  let content = existsSync(path) ? readFileSync(path, 'utf8') : ''
  const line = `${key}=${value}`
  const re = new RegExp(`^${key}=.*$`, 'm')
  if (re.test(content)) content = content.replace(re, line)
  else content += (content && !content.endsWith('\n') ? '\n' : '') + line + '\n'
  writeFileSync(path, content)
}

/** Достаёт токен из вставленного URL (после #access_token=) или принимает голый токен. */
function extractToken(input: string): string | undefined {
  const s = input.trim()
  const m = s.match(/access_token=([^&\s]+)/)
  if (m) return m[1]
  // Похоже на сам токен, а не на URL/мусор.
  if (s && !s.includes('://') && !s.includes('=') && !/\s/.test(s)) return s
  return undefined
}

/** Ручной режим: пользователь логинится, копирует URL из адресной строки и вставляет. */
async function captureManually(): Promise<string | undefined> {
  console.log('После подтверждения тебя перекинет на страницу oauth.vk.com/blank.html.')
  console.log('Скопируй URL из адресной строки целиком и вставь сюда.\n')
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question('URL (или сам токен): ')
  rl.close()
  return extractToken(answer)
}

async function validate(token: string): Promise<void> {
  const client = new VkClient(token)
  try {
    const users = await client.api<Array<{ id: number; first_name: string; last_name: string }>>(
      'users.get',
      { fields: 'first_name,last_name' },
    )
    const me = users[0]!
    console.log(`  аккаунт: ${me.first_name} ${me.last_name} (vk:${me.id})`)
    try {
      const { total } = await client.getConversations(`vk:${me.id}`, { count: 1 })
      console.log(`  ✔ доступ к личным сообщениям есть (диалогов: ${total})`)
    } catch (err) {
      if (err instanceof VkApiError) console.log(`  ⚠ без прав messages: ${err.message}`)
      else throw err
    }
  } catch (err) {
    console.log(`  ⚠ токен не прошёл проверку: ${(err as Error).message}`)
  }
}

async function main(): Promise<void> {
  let token: string | undefined

  if (manual) {
    console.log('Открой ссылку и подтверди доступ (откроется автоматически):')
    console.log(`     ${authorizeUrl}\n`)
    if (process.platform === 'darwin') exec(`open "${authorizeUrl}"`)
    token = await captureManually()
  } else {
    console.log('1) Добавь в настройках приложения Trusted redirect URI:')
    console.log(`     ${redirectUri}`)
    console.log('   (если такого поля в кабинете нет — перезапусти с флагом --manual)')
    console.log('2) Открой ссылку и подтверди доступ (откроется автоматически):')
    console.log(`     ${authorizeUrl}\n`)
    if (process.platform === 'darwin') exec(`open "${authorizeUrl}"`)
    token = (await waitForToken()).token
  }

  if (!token) {
    console.error('\n✖ Токен не получен (не нашёл access_token во вставленном тексте).')
    process.exit(2)
  }

  console.log('\n✔ Токен получен. Проверяю доступ…')
  await validate(token)

  upsertEnv(envPath, 'VK_USER_TOKEN', token)
  console.log(`\n✔ Сохранено в ${envPath} (VK_USER_TOKEN). Дальше: npm run dialogs`)
  process.exit(0)
}

main().catch((err) => {
  console.error('✖ Ошибка:', (err as Error).message)
  process.exit(1)
})
