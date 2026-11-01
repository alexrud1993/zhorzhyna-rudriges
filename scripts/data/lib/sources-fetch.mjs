// Збір текстів дозволених джерел для таксона (AI-CARE-002/003): Вікіпедія uk/en (CC BY-SA 4.0) + таксономія GBIF (CC BY 4.0).
// Кеш — data/cache/sources/<taxonId>.json (поза git: тексти Вікіпедії не поширюємо в репозиторії).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fetchJson } from './http.mjs'

const CACHE = new URL('../../../data/cache/sources/', import.meta.url)
const CARE = {
  en: /cultivat|care|growing|growth|grow |horticult|propagat|agronom|toxic|pests? and diseases|climate|water|soil|requirement|ecology|habitat|dormanc|houseplant|planting|sowing|seedling/i,
  uk: /вирощ|догляд|культив|агротех|розмнож|розсад|посів|посад|висадж|отру|токсич|умов|ґрунт|грунт|полив|клімат|біологічн|екологі|поширенн|ареал|хвороб|спокою/i,
}
const MAX_TOTAL = 14000
const INTRO = 4000

/** Залишає вступ і розділи, що стосуються вирощування/догляду. */
export function selectSections(text, lang) {
  const parts = text.split(/\n(?===+ [^=]+ ==+)/)
  const intro = parts.shift().slice(0, INTRO)
  let out = intro
  for (const p of parts) {
    const heading = (p.match(/^=+ ([^=]+) =+/) ?? [])[1] ?? ''
    if (!CARE[lang].test(heading)) continue
    if (out.length + p.length > MAX_TOTAL) { out += '\n' + p.slice(0, MAX_TOTAL - out.length); break }
    out += '\n' + p
  }
  return out.trim()
}

async function wiki(lang, title) {
  const api = `https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&format=json&formatversion=2&titles=${encodeURIComponent(title)}`
  const j = await fetchJson(api)
  const page = j?.query?.pages?.[0]
  if (!page?.extract) return null
  return {
    url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
    title: `${page.title} — Вікіпедія (${lang})`,
    license: 'CC BY-SA 4.0',
    text: selectSections(page.extract, lang),
  }
}

function gbifSource(t) {
  return {
    url: `https://www.gbif.org/species/${t.ids.gbif}`,
    title: `${t.acceptedName} — GBIF Backbone Taxonomy`,
    license: 'CC BY 4.0',
    text: `Таксон: ${t.acceptedName}. Ранг: ${t.rank}. Рід: ${t.genus ?? '—'}. Родина: ${t.family ?? '—'}.` +
      (t.synonyms.length ? ` Синоніми: ${t.synonyms.join(', ')}.` : '') + ' Відомостей про догляд, полив чи умови вирощування в цьому джерелі немає.',
  }
}

/** Повертає [{id, url, title, license, accessed, text}] з кешу або з мережі. */
export async function getSources(taxon, { refresh = false } = {}) {
  mkdirSync(CACHE, { recursive: true })
  const file = new URL(`${taxon.id}.json`, CACHE)
  if (!refresh && existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'))
  const accessed = new Date().toISOString().slice(0, 10)
  const list = []
  if (taxon.wikiTitles.uk) { const s = await wiki('uk', taxon.wikiTitles.uk); if (s) list.push(s) }
  if (taxon.wikiTitles.en) { const s = await wiki('en', taxon.wikiTitles.en); if (s) list.push(s) }
  if (taxon.ids.gbif) list.push(gbifSource(taxon))
  const sources = list.map((s, i) => ({ id: `s${i + 1}`, ...s, accessed }))
  writeFileSync(file, JSON.stringify(sources, null, 2))
  return sources
}
