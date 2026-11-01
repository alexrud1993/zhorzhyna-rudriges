// Машинна версія data/SOURCES.md: дозволені домени джерел карток і виключені джерела.
// Валідатор відхиляє картку, якщо sources[].url веде на домен поза ALLOWED.

export const ALLOWED = [
  { id: 'wikipedia-uk', domains: ['uk.wikipedia.org'], license: 'CC BY-SA 4.0' },
  { id: 'wikipedia-en', domains: ['en.wikipedia.org'], license: 'CC BY-SA 4.0' },
  { id: 'wikidata', domains: ['www.wikidata.org'], license: 'CC0 1.0' },
  { id: 'gbif', domains: ['www.gbif.org', 'api.gbif.org'], license: 'CC BY 4.0' },
  { id: 'geonames', domains: ['www.geonames.org', 'download.geonames.org'], license: 'CC BY 4.0' },
]

export const EXCLUDED = [
  { id: 'powo', domains: ['powo.science.kew.org'], reason: 'Ліцензія текстів залежить від постачальника; автоматичний доступ блокується (HTTP 403); комерційне використання похідних баз не підтверджене' },
  { id: 'fao-56', domains: ['www.fao.org', 'fao.org', 'openknowledge.fao.org'], reason: 'Комерційне відтворення публікацій FAO — лише за ліцензійним запитом' },
]

/** Повертає запис реєстру для URL або null, якщо домен не дозволений. */
export function allowedSourceFor(url) {
  let host
  try { host = new URL(url).hostname } catch { return null }
  return ALLOWED.find((s) => s.domains.includes(host)) ?? null
}

export function excludedSourceFor(url) {
  let host
  try { host = new URL(url).hostname } catch { return null }
  return EXCLUDED.find((s) => s.domains.includes(host)) ?? null
}
