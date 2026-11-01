// Пакетна ШІ-генерація карток догляду з рецензентом (AI-CARE-001…005, 007, 010).
// Запуск: node scripts/data/generate.mjs [--pilot | --taxa <id,id>] [--force]
// Результат: data/v2/care.json (картки) і data/reports/generate-<дата>.json (журнал прогону).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { PILOT } from './seed.mjs'
import { getSources } from './lib/sources-fetch.mjs'
import { readKey, pickModel, generateJson } from './lib/gemini.mjs'
import { GEN_SYSTEM, GEN_VERSION, REVIEW_SYSTEM, REVIEW_VERSION, genUser, reviewUser } from './lib/prompts.mjs'
import { validateCare, BOUND_FIELDS, getPath } from './lib/validate-care.mjs'

const DATA = new URL('../../data/v2/', import.meta.url)
const REPORTS = new URL('../../data/reports/', import.meta.url)
const args = process.argv.slice(2)
const force = args.includes('--force')
const ids = args.includes('--taxa') ? args[args.indexOf('--taxa') + 1].split(',') : PILOT
const MAX_ATTEMPTS = 3 // 1 спроба + 2 повтори (AI-CARE-004)

const taxa = JSON.parse(readFileSync(new URL('taxa.json', DATA), 'utf8'))
const careFile = new URL('care.json', DATA)
const care = existsSync(careFile) ? JSON.parse(readFileSync(careFile, 'utf8')) : []

const key = readKey()
const model = await pickModel(key)
const reviewerModel = process.env.GEMINI_REVIEW_MODEL || model
console.log(`Модель: ${model}, рецензент: ${reviewerModel}`)

const nullish = (v) => v === null || v === undefined || (Array.isArray(v) && v.length === 0)
const pick = (v) => (nullish(v) ? null : v)

/** Збирає картку зі схеми моделі; невідомі ключі відкидаються, метадані ставить конвеєр. */
function assemble(out, taxon, scope, sources, now) {
  const w = out?.water ?? {}
  const sf = w.seasonFactors && Object.values(w.seasonFactors).some((x) => x !== null) ? w.seasonFactors : null
  const tox = out?.toxicity ?? {}
  return {
    taxonId: taxon.id,
    version: (care.find((c) => c.taxonId === taxon.id)?.version ?? 0) + 1,
    scope,
    light: pick(out?.light),
    water: { model: scope === 'indoor' ? 'pot-interval' : 'outdoor-interval', baseIntervalDays: pick(w.baseIntervalDays), seasonFactors: sf, rootDepthM: pick(w.rootDepthM) },
    soil: pick(out?.soil),
    phMin: pick(out?.phMin), phMax: pick(out?.phMax),
    tempMin: pick(out?.tempMin), tempMax: pick(out?.tempMax),
    frostHardinessC: pick(out?.frostHardinessC),
    dormancyMonths: pick(out?.dormancyMonths), activeMonths: pick(out?.activeMonths),
    toxicity: { cats: pick(tox.cats), dogs: pick(tox.dogs), humans: pick(tox.humans) },
    text_uk: pick(out?.text_uk),
    sources: sources.map(({ id, url, title, license, accessed }) => ({ id, url, title, license, accessed })),
    fieldSources: Object.fromEntries(Object.entries(out?.fieldSources ?? {}).filter(([k]) => BOUND_FIELDS.includes(k))),
    reviewNotes: [],
    status: 'ai-draft',
    generatedBy: { model, reviewerModel, promptVersion: `${GEN_VERSION}+${REVIEW_VERSION}`, generatedAt: now },
    textLicense: 'CC BY-SA 4.0',
    updatedAt: now,
  }
}

const rows = []
for (const id of ids) {
  const taxon = taxa.find((t) => t.id === id)
  if (!taxon) throw new Error(`Невідомий taxonId ${id}`)
  if (!force && care.some((c) => c.taxonId === id && c.status !== 'ai-failed')) { console.log(`— ${taxon.acceptedName}: картка вже є (--force для перегенерації)`); continue }
  const scope = taxon.category === 'indoor' ? 'indoor' : 'outdoor'
  const sources = await getSources(taxon)
  const sourceTexts = sources.map((s) => s.text)
  const now = new Date().toISOString()
  console.log(`\n▶ ${taxon.acceptedName} (${taxon.nameUk ?? '—'}): джерел ${sources.length} [${sources.map((s) => s.title).join('; ')}]`)

  let card = null
  let errors = []
  let attempts = 0
  while (attempts < MAX_ATTEMPTS) {
    attempts++
    try {
      const { json } = await generateJson(key, model, { system: GEN_SYSTEM, user: genUser(taxon, scope, sources, errors) })
      const candidate = assemble(json, taxon, scope, sources, now)
      errors = validateCare(candidate, { sourceTexts })
      if (!errors.length) { card = candidate; break }
    } catch (e) {
      if (e.fatal) throw e // недоступна модель / ключ / квота — зупиняємо прогін, а не пишемо фальшиві ai-failed
      errors = [e.message]
    }
    console.log(`  спроба ${attempts}: ${errors.length} помилок — ${errors.slice(0, 3).join(' | ')}`)
  }

  let reviewIssues = []
  if (!card) {
    // AI-CARE-004: після 2 повторів — ai-failed, усі поля null, помилки в reviewNotes
    card = assemble({}, taxon, scope, sources, now)
    card.status = 'ai-failed'
    card.reviewNotes = errors.slice(0, 10).map((e) => ({ field: '*', issue: e.slice(0, 300), severity: 'high' }))
  } else {
    try {
      const { json } = await generateJson(key, reviewerModel, { system: REVIEW_SYSTEM, user: reviewUser(card, sources), temperature: 0 })
      reviewIssues = (json.issues ?? []).filter((x) => x && typeof x.issue === 'string' && ['high', 'low', 'info'].includes(x.severity))
        .map((x) => ({ field: String(x.field ?? '*').slice(0, 60), issue: x.issue.slice(0, 300), severity: x.severity }))
      card.reviewNotes = reviewIssues
      card.status = reviewIssues.some((x) => x.severity === 'high') ? 'ai-draft' : 'ai-checked'
    } catch (e) {
      if (e.fatal) throw e
      card.reviewNotes = [{ field: '*', issue: `Рецензент не відпрацював: ${e.message.slice(0, 200)}`, severity: 'high' }]
      card.status = 'ai-draft'
    }
  }
  const final = validateCare(card, { sourceTexts })
  if (final.length) throw new Error(`Внутрішня помилка: картка ${id} невалідна після збирання: ${final.join('; ')}`)

  const nullFields = BOUND_FIELDS.filter((f) => f !== 'text_uk' && nullish(getPath(card, f)) || (f === 'text_uk' && card.text_uk === null)).length
  const filled = BOUND_FIELDS.length - nullFields
  rows.push({ taxonId: id, name: taxon.acceptedName, nameUk: taxon.nameUk, status: card.status, attempts, sources: sources.length, filled, nullFields,
    reviewer: card.reviewNotes.map((n) => `[${n.severity}] ${n.field}: ${n.issue}`) })
  console.log(`  ✔ ${card.status}; спроб ${attempts}; заповнено ${filled}/${BOUND_FIELDS.length}, null ${nullFields}; зауважень ${card.reviewNotes.length}`)

  const i = care.findIndex((c) => c.taxonId === id)
  if (i >= 0) care[i] = card; else care.push(card)
  writeFileSync(careFile, JSON.stringify(care, null, 2) + '\n') // зберігаємо після кожного виду
}

mkdirSync(REPORTS, { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
writeFileSync(new URL(`generate-${stamp}.json`, REPORTS), JSON.stringify({ model, reviewerModel, promptVersion: `${GEN_VERSION}+${REVIEW_VERSION}`, rows }, null, 2) + '\n')
console.log('\nПідсумок:')
console.table(rows.map(({ name, status, attempts, filled, nullFields, reviewer }) => ({ name, status, attempts, filled, nullFields, notes: reviewer.length })))
