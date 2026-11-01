// Перевірка відсутності ключів і секретів у файлах репозиторію (SEC-102). Використовує `git grep`.
// Локально перевіряє також нові файли, ще не додані до git (крім ігнорованих). Код виходу 1, якщо щось знайдено.
import { execFileSync } from 'node:child_process'

const PATTERNS = [
  ['Ключ Google / Gemini API', 'AIza[0-9A-Za-z_\\-]{35}'],
  ['Присвоєння GEMINI_API_KEY', 'GEMINI_API_KEY[[:space:]]*=[[:space:]]*[A-Za-z0-9_\\-]{20,}'],
  ['Присвоєння PLANTNET_API_KEY', 'PLANTNET_API_KEY[[:space:]]*=[[:space:]]*[A-Za-z0-9]{10,}'],
  ['api-key у URL', 'api-key=[A-Za-z0-9]{20,}'],
  ['Токен GitHub', '(ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{20,}'],
  ['Приватний ключ', '-----BEGIN ([A-Z]+ )?PRIVATE KEY-----'],
  ['Токен Cloudflare в коді', 'CLOUDFLARE_API_TOKEN[[:space:]]*=[[:space:]]*[A-Za-z0-9_\\-]{20,}'],
]
const untracked = !process.env.CI

let found = 0
for (const [name, re] of PATTERNS) {
  const args = ['grep', '-n', '-I', '-E', ...(untracked ? ['--untracked'] : []), '-e', re, '--', '.', ':!scripts/check-secrets.mjs', ':!package-lock.json']
  let out = ''
  try { out = execFileSync('git', args, { encoding: 'utf8' }) } catch (e) { if (e.status !== 1) throw e } // 1 = нічого не знайдено
  for (const line of out.split('\n').filter(Boolean)) {
    found++
    // Не друкуємо сам збіг, лише місце
    console.error(`✖ ${name}: ${line.split(':').slice(0, 2).join(':')}`)
  }
}
if (found) { console.error(`✖ Знайдено можливих секретів: ${found}`); process.exit(1) }
console.log(`✔ Секретів не знайдено (${PATTERNS.length} шаблонів, ${untracked ? 'включно з неіндексованими файлами' : 'файли в git'})`)
