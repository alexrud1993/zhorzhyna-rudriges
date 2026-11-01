// Повна перевірка картки догляду: JSON Schema + жорсткі діапазони (AI-CARE-005)
// + прив'язка полів до джерел (AI-CARE-003) + заборона дослівного копіювання (AI-CARE-003a).
import { schemaErrors } from './schemas.mjs'
import { allowedSourceFor } from './sources-registry.mjs'

/** Атрибути, кожне заповнене значення яких мусить мати джерело. water.model похідне від scope — без джерела. */
export const BOUND_FIELDS = [
  'light', 'water.baseIntervalDays', 'water.seasonFactors', 'water.rootDepthM', 'soil',
  'phMin', 'phMax', 'tempMin', 'tempMax', 'frostHardinessC', 'dormancyMonths', 'activeMonths',
  'toxicity.cats', 'toxicity.dogs', 'toxicity.humans', 'text_uk',
]

export const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj)

const isFilled = (v) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0) &&
  !(typeof v === 'object' && !Array.isArray(v) && Object.values(v).every((x) => x === null))

/** Жорсткі діапазони. Повертає масив помилок (порожній — усе гаразд). */
export function rangeErrors(c) {
  const e = []
  const num = (v) => typeof v === 'number' && Number.isFinite(v)
  if (num(c.tempMin) && num(c.tempMax) && !(c.tempMin < c.tempMax)) e.push(`tempMin (${c.tempMin}) має бути строго менше за tempMax (${c.tempMax})`)
  for (const k of ['tempMin', 'tempMax']) if (num(c[k]) && (c[k] < -50 || c[k] > 50)) e.push(`${k} поза межами −50…50 °C`)
  for (const k of ['phMin', 'phMax']) if (num(c[k]) && (c[k] < 3 || c[k] > 9)) e.push(`${k} (${c[k]}) поза межами 3–9`)
  if (num(c.phMin) && num(c.phMax) && c.phMin > c.phMax) e.push(`phMin (${c.phMin}) більший за phMax (${c.phMax})`)
  const iv = c.water?.baseIntervalDays
  if (iv !== null && iv !== undefined && !(Number.isInteger(iv) && iv >= 1 && iv <= 30)) e.push(`water.baseIntervalDays (${iv}) має бути цілим 1–30`)
  if (num(c.frostHardinessC) && (c.frostHardinessC < -50 || c.frostHardinessC > 20)) e.push('frostHardinessC поза межами −50…20 °C')
  if (num(c.water?.rootDepthM) && (c.water.rootDepthM < 0.05 || c.water.rootDepthM > 10)) e.push('water.rootDepthM поза межами 0,05–10 м')
  for (const [s, f] of Object.entries(c.water?.seasonFactors ?? {})) if (num(f) && (f < 0.25 || f > 4)) e.push(`water.seasonFactors.${s} (${f}) поза межами 0,25–4`)
  for (const k of ['dormancyMonths', 'activeMonths']) {
    const m = c[k]
    if (!Array.isArray(m)) continue
    if (m.some((x) => !Number.isInteger(x) || x < 1 || x > 12)) e.push(`${k}: місяці мають бути цілими 1–12`)
    if (new Set(m).size !== m.length) e.push(`${k}: місяці повторюються`)
  }
  if (Array.isArray(c.dormancyMonths) && c.dormancyMonths.length >= 12) e.push('dormancyMonths охоплює всі 12 місяців — це не період спокою')
  for (const k of ['soil', 'text_uk']) if (typeof c[k] === 'string' && !isUkrainian(c[k])) e.push(`${k} має бути українською`)
  if (Array.isArray(c.dormancyMonths) && Array.isArray(c.activeMonths)) {
    const both = c.dormancyMonths.filter((x) => c.activeMonths.includes(x))
    if (both.length) e.push(`місяці спокою й активності перетинаються: ${both.join(', ')}`)
  }
  return e
}

/** Текст вважається українським, якщо ≥ 60% літер — кирилиця (латинські наукові назви допускаються). */
export function isUkrainian(s) {
  const letters = s.match(/\p{L}/gu) ?? []
  if (!letters.length) return false
  return letters.filter((ch) => /[Ѐ-ӿ]/.test(ch)).length / letters.length >= 0.6
}

/** Прив'язка полів до джерел і коректність самих джерел. */
export function bindingErrors(c) {
  const e = []
  const ids = new Set((c.sources ?? []).map((s) => s.id))
  for (const s of c.sources ?? []) {
    if (!allowedSourceFor(s.url)) e.push(`джерело ${s.id}: домен ${safeHost(s.url)} не входить до реєстру дозволених (data/SOURCES.md)`)
  }
  if (ids.size !== (c.sources ?? []).length) e.push('id джерел повторюються')
  for (const [field, refs] of Object.entries(c.fieldSources ?? {})) {
    for (const r of refs) if (!ids.has(r)) e.push(`fieldSources.${field}: посилання на неіснуюче джерело ${r}`)
  }
  for (const field of BOUND_FIELDS) {
    if (isFilled(getPath(c, field)) && !(c.fieldSources?.[field]?.length)) e.push(`поле ${field} заповнене без джерела (має бути null)`)
  }
  return e
}

const safeHost = (u) => { try { return new URL(u).hostname } catch { return String(u) } }

const words = (t) => t.toLowerCase().normalize('NFKC').replace(/[’'ʼ`]/g, '').match(/[\p{L}\p{N}]+/gu) ?? []

/** Шукає збіги з N слів поспіль між текстом картки й текстами джерел. */
export function verbatimErrors(text, sourceTexts, n = 8) {
  if (!text || !sourceTexts?.length) return []
  const grams = new Set()
  for (const s of sourceTexts) {
    const w = words(s)
    for (let i = 0; i + n <= w.length; i++) grams.add(w.slice(i, i + n).join(' '))
  }
  const w = words(text)
  for (let i = 0; i + n <= w.length; i++) {
    const g = w.slice(i, i + n).join(' ')
    if (grams.has(g)) return [`text_uk містить дослівний фрагмент джерела (${n} слів): «${g}»`]
  }
  return []
}

/** Повна перевірка. sourceTexts — тексти джерел для перевірки дослівного копіювання (необов'язково). */
export function validateCare(card, { sourceTexts } = {}) {
  const schema = schemaErrors('careProfile', card)
  if (schema.length) return schema // діапазони без коректної структури не мають сенсу
  return [...rangeErrors(card), ...bindingErrors(card), ...verbatimErrors(card.text_uk, sourceTexts)]
}
