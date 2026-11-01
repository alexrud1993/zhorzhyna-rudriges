// Мінімальний клієнт Gemini API для пакетної генерації (AI-CARE-001, SEC-102).
// Ключ: змінна GEMINI_API_KEY або файл поза репозиторієм (GEMINI_KEY_FILE, за замовчуванням ~/.config/zhorzhyna/gemini.env).
// Ключ передається лише заголовком x-goog-api-key і ніколи не друкується.
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sleep } from './http.mjs'

const API = 'https://generativelanguage.googleapis.com/v1beta'
const REPO = resolve(fileURLToPath(new URL('../../../', import.meta.url)))
export const DEFAULT_KEY_FILE = join(homedir(), '.config', 'zhorzhyna', 'gemini.env')

export function readKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim()
  const file = resolve(process.env.GEMINI_KEY_FILE || DEFAULT_KEY_FILE)
  if (file === REPO || file.startsWith(REPO + sep)) throw new Error('Файл ключа не може лежати в репозиторії (SEC-102). Вкажіть шлях поза ним.')
  if (!existsSync(file)) throw new Error(`Ключ Gemini не знайдено: задайте GEMINI_API_KEY або створіть ${file} (scripts/data/set-gemini-key.ps1)`)
  const raw = readFileSync(file, 'utf8').trim()
  const m = raw.match(/^GEMINI_API_KEY\s*=\s*(\S+)/m)
  const key = (m ? m[1] : raw).trim()
  if (key.length < 20) throw new Error(`Файл ${file} не містить ключа`)
  return key
}

const redact = (s, key) => String(s).split(key).join('***')

/** Помилка, яку повторами не виправити (модель недоступна, ключ недійсний, квота 0): прогін треба зупинити. */
export class FatalApiError extends Error { fatal = true }

let lastCall = 0
async function throttle() {
  const gap = Number(process.env.GEMINI_MIN_INTERVAL_MS ?? 6500) // безкоштовний рівень має низький ліміт запитів за хвилину
  const wait = lastCall + gap - Date.now()
  if (wait > 0) await sleep(wait)
  lastCall = Date.now()
}

async function call(key, path, body) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    await throttle()
    let r
    try {
      r = await fetch(`${API}/${path}`, {
        method: body ? 'POST' : 'GET',
        headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(120000),
      })
    } catch (e) {
      if (attempt === 5) throw new Error(redact(`Gemini: мережа — ${e.message}`, key))
      await sleep(5000 * attempt); continue
    }
    const text = await r.text()
    // Нульова квота безкоштовного рівня для моделі — повтори не допоможуть
    if (r.status === 429 && /limit:\s*0(?!\d)|"limit":\s*0(?!\d)/.test(text)) throw new FatalApiError(redact(`Gemini HTTP 429 (квота 0 для цієї моделі): ${text.slice(0, 300)}`, key))
    if (r.status === 429 || r.status >= 500) {
      const delay = Number((text.match(/"retryDelay":\s*"(\d+)s"/) ?? [])[1] ?? 20 * attempt)
      // Денна квота вичерпана (скидання через години) — зупиняємо прогін, зроблене вже збережено
      if (r.status === 429 && delay > 300) throw new FatalApiError(`Gemini: денну квоту моделі вичерпано, скидання приблизно через ${Math.round(delay / 3600)} год`)
      if (attempt === 5) throw new Error(redact(`Gemini HTTP ${r.status}: ${text.slice(0, 300)}`, key))
      console.warn(`  Gemini HTTP ${r.status}, повтор через ${delay} с`)
      await sleep(delay * 1000); continue
    }
    if ([400, 401, 403, 404].includes(r.status)) throw new FatalApiError(redact(`Gemini HTTP ${r.status}: ${text.slice(0, 500)}`, key))
    if (!r.ok) throw new Error(redact(`Gemini HTTP ${r.status}: ${text.slice(0, 500)}`, key))
    return JSON.parse(text)
  }
}

/**
 * Обирає модель: GEMINI_MODEL або перша з бажаних, що є в списку І реально відповідає на пробний виклик.
 * Список моделей може містити моделі, недоступні для нових ключів (так було з gemini-2.5-flash 01.11.2026).
 */
export async function pickModel(key, preferred = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash']) {
  const list = await call(key, 'models?pageSize=200')
  const available = (list.models ?? []).filter((m) => m.supportedGenerationMethods?.includes('generateContent')).map((m) => m.name.replace('models/', ''))
  // Явно задана модель не перевіряється пробним викликом: на безкоштовному рівні кожен запит рахується в денну квоту
  if (process.env.GEMINI_MODEL) {
    if (!available.includes(process.env.GEMINI_MODEL)) throw new FatalApiError(`Модель ${process.env.GEMINI_MODEL} відсутня в списку доступних`)
    return process.env.GEMINI_MODEL
  }
  const want = preferred
  const tried = []
  for (const model of want.filter((m) => available.includes(m))) {
    try {
      const { json } = await generateJson(key, model, { system: 'Відповідай лише JSON.', user: 'Поверни {"ok": true}' })
      if (json?.ok === true) return model
      tried.push(`${model}: неочікувана відповідь`)
    } catch (e) {
      if (!e.fatal) throw e
      tried.push(`${model}: ${e.message.slice(0, 120)}`)
    }
  }
  throw new FatalApiError(`Жодна з моделей не відповіла на пробний виклик. ${tried.join(' | ') || `Немає в списку: ${want.join(', ')}`}`)
}

/** Генерує JSON-відповідь. Повертає { json, raw } або кидає помилку з текстом відповіді (для повтору). */
export async function generateJson(key, model, { system, user, temperature = 0.2 }) {
  const res = await call(key, `models/${model}:generateContent`, {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { responseMimeType: 'application/json', temperature },
  })
  const raw = (res.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('')
  if (!raw) throw Object.assign(new Error(`Порожня відповідь моделі (${res.candidates?.[0]?.finishReason ?? res.promptFeedback?.blockReason ?? 'невідомо'})`), { raw })
  try { return { json: JSON.parse(raw), raw } } catch { throw Object.assign(new Error('Відповідь моделі — невалідний JSON'), { raw }) }
}
