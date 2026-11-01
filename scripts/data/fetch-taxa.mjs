// Крок конвеєра: таксони, народні назви, відповідність catalogId → taxonId, міста v1.
// Джерела: GBIF Backbone (CC BY 4.0) — назви, ранг, синоніми; Wikidata (CC0) — uk-назви, ID, статті Вікіпедії, GeoNames ID.
// Запуск: node scripts/data/fetch-taxa.mjs  → data/v2/{taxa,common-names,catalog-map,places-legacy}.json
import { writeFileSync, mkdirSync } from 'node:fs'
import { SEED, LEGACY_PLACES } from './seed.mjs'
import { fetchJson, sparql, sleep } from './lib/http.mjs'

const OUT = new URL('../../data/v2/', import.meta.url)
mkdirSync(OUT, { recursive: true })
const now = new Date().toISOString()
const titleFromUrl = (u) => (u ? decodeURIComponent(u.split('/wiki/')[1]).replace(/_/g, ' ') : null)
const plain = (s) => s.replace('×', '').replace(/\s+/g, ' ').trim()

// Якість назв: у Wikidata трапляються латинські літери всередині кириличних слів (напр. «гiпеаструм» з латинською i)
const LOOKALIKE = { a: 'а', c: 'с', e: 'е', i: 'і', o: 'о', p: 'р', x: 'х', y: 'у', A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', I: 'І', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х' }
const CYR = /[Ѐ-ӿ]/
let fixedNames = 0
/** Повертає нормалізовану українську назву або null, якщо це не кирилична назва (напр. латинська мітка). */
function ukName(s) {
  if (!s || !CYR.test(s)) return null
  const fixed = s.replace(/[A-Za-z]/g, (ch) => LOOKALIKE[ch] ?? ch)
  if (/[A-Za-z]/.test(fixed)) return null
  if (fixed !== s) fixedNames++
  const clean = fixed.replace(/\s*\([^)]*\)\s*$/, '').trim() // «Назва (рослина)» → «Назва»
  return clean ? clean[0].toUpperCase() + clean.slice(1) : null
}

async function gbif(name) {
  const m = await fetchJson(`https://api.gbif.org/v1/species/match?name=${encodeURIComponent(plain(name))}&kingdom=Plantae`)
  if (!m || m.matchType === 'NONE') return null
  const key = m.acceptedUsageKey ?? m.usageKey
  const sp = await fetchJson(`https://api.gbif.org/v1/species/${key}`)
  const syn = await fetchJson(`https://api.gbif.org/v1/species/${key}/synonyms?limit=50`)
  const synonyms = [...new Set((syn?.results ?? []).map((s) => s.canonicalName).filter(Boolean))].filter((s) => s !== sp.canonicalName).slice(0, 15)
  return { key, canonical: sp.canonicalName, genus: sp.genus ?? null, family: sp.family ?? null, rank: sp.rank, matchType: m.matchType, synonyms }
}

const taxa = []
const names = []
const report = []
const gbifKeys = {}
for (const s of SEED) {
  let g = null
  if (s.name) { g = await gbif(s.name); await sleep(200) }
  if (s.name && !g) throw new Error(`GBIF не знайшов ${s.name}`)
  if (g) gbifKeys[s.id] = String(g.key)
  report.push({ id: s.id, name: s.name, gbif: g ? `${g.key} ${g.canonical} (${g.rank}, ${g.matchType})` : 'group' })
  // Ранг — за GBIF (напр. Pulsatilla ucrainica GBIF вважає підвидом); гібриди й групи — із seed
  const gbifRank = g ? ({ SPECIES: 'species', SUBSPECIES: 'subspecies', VARIETY: 'variety', GENUS: 'genus' })[g.rank] : null
  taxa.push({
    id: s.id,
    rank: s.rank === 'hybrid' || s.rank === 'group' ? s.rank : (gbifRank ?? s.rank),
    // Гібрид лишаємо в записі зі знаком ×; інакше — прийнята назва GBIF
    acceptedName: s.rank === 'group' ? null : s.rank === 'hybrid' ? s.name : g.canonical,
    nameUk: s.nameUk,
    genus: s.rank === 'group' ? null : g.genus,
    family: s.rank === 'group' ? null : g.family,
    category: s.category,
    synonyms: g?.synonyms ?? [],
    ids: { gbif: g ? g.key : null, wikidata: null, powo: null, ipni: null, wcvp: null, plantnet: null },
    wikiTitles: { uk: null, en: null },
    legacyCatalogId: s.legacy,
    retrievedAt: now,
  })
  if (s.legacy && s.nameUk) names.push({ taxonId: s.id, lang: 'uk', name: s.nameUk, preferred: true, source: 'legacy-catalog' })
}

// Wikidata: за GBIF ID (P846) — uk-назва, синоніми uk, POWO (P5037), IPNI (P961), статті uk/en
const values = Object.values(gbifKeys).map((k) => `"${k}"`).join(' ')
const rows = await sparql(`SELECT ?item ?gbif ?ukLabel ?enLabel ?powo ?ipni ?ukwiki ?enwiki WHERE {
  VALUES ?gbif { ${values} } ?item wdt:P846 ?gbif .
  OPTIONAL { ?item rdfs:label ?ukLabel FILTER(LANG(?ukLabel) = "uk") }
  OPTIONAL { ?item rdfs:label ?enLabel FILTER(LANG(?enLabel) = "en") }
  OPTIONAL { ?item wdt:P5037 ?powo } OPTIONAL { ?item wdt:P961 ?ipni }
  OPTIONAL { ?ukwiki schema:about ?item ; schema:isPartOf <https://uk.wikipedia.org/> }
  OPTIONAL { ?enwiki schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> } }`)
const aliasRows = await sparql(`SELECT ?gbif ?alias WHERE { VALUES ?gbif { ${values} } ?item wdt:P846 ?gbif ; skos:altLabel ?alias FILTER(LANG(?alias) = "uk") }`)

// Запасний пошук за науковою назвою (P225) для таксонів, яких немає за GBIF ID
const missing = taxa.filter((t) => gbifKeys[t.id] && !rows.some((x) => x.gbif === gbifKeys[t.id]))
const seedName = (t) => SEED.find((s) => s.id === t.id).name
if (missing.length) {
  const byName = await sparql(`SELECT ?item ?name ?ukLabel ?enLabel ?powo ?ipni ?ukwiki ?enwiki WHERE {
    VALUES ?name { ${missing.flatMap((t) => [seedName(t), t.acceptedName]).map((n) => JSON.stringify(n)).join(' ')} } ?item wdt:P225 ?name .
    OPTIONAL { ?item rdfs:label ?ukLabel FILTER(LANG(?ukLabel) = "uk") }
    OPTIONAL { ?item rdfs:label ?enLabel FILTER(LANG(?enLabel) = "en") }
    OPTIONAL { ?item wdt:P5037 ?powo } OPTIONAL { ?item wdt:P961 ?ipni }
    OPTIONAL { ?ukwiki schema:about ?item ; schema:isPartOf <https://uk.wikipedia.org/> }
    OPTIONAL { ?enwiki schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> } }`)
  for (const t of missing) {
    const r = byName.find((x) => x.name === seedName(t)) ?? byName.find((x) => x.name === t.acceptedName)
    if (r) rows.push({ ...r, gbif: gbifKeys[t.id], viaName: true })
  }
}

for (const t of taxa) {
  const key = gbifKeys[t.id]
  if (!key) continue
  const r = rows.find((x) => x.gbif === key)
  if (!r) { report.find((x) => x.id === t.id).wikidata = 'не знайдено'; continue }
  t.ids.wikidata = r.item.split('/').pop()
  t.ids.powo = r.powo ?? null
  t.ids.ipni = r.ipni ?? null
  t.wikiTitles = { uk: titleFromUrl(r.ukwiki), en: titleFromUrl(r.enwiki) }
  // Народні назви: лише кириличні uk-назви (латинські мітки відкидаються), en — якщо не дублює наукову назву
  const sci = new Set([t.acceptedName, seedName(t), ...t.synonyms].filter(Boolean).map((x) => plain(x).toLowerCase()))
  const label = ukName(r.ukLabel)
  if (!t.nameUk) t.nameUk = ukName(t.wikiTitles.uk) ?? label
  const addUk = (name, preferred) => {
    if (name && !names.some((n) => n.taxonId === t.id && n.lang === 'uk' && n.name.toLowerCase() === name.toLowerCase()))
      names.push({ taxonId: t.id, lang: 'uk', name, preferred: preferred && !names.some((n) => n.taxonId === t.id && n.lang === 'uk'), source: 'wikidata' })
  }
  addUk(label, true)
  for (const a of aliasRows.filter((x) => x.gbif === key).map((x) => ukName(x.alias))) addUk(a, false)
  if (r.enLabel && !sci.has(plain(r.enLabel).toLowerCase())) names.push({ taxonId: t.id, lang: 'en', name: r.enLabel, preferred: true, source: 'wikidata' })
  report.find((x) => x.id === t.id).wikidata = `${r.viaName ? '(за назвою) ' : ''}${t.ids.wikidata} uk:${t.wikiTitles.uk ?? '—'} en:${t.wikiTitles.en ?? '—'}`
}

// Міста v1 → GeoNames ID (Wikidata P1566) з перевіркою, що QID відповідає назві
const placeRows = await sparql(`SELECT ?item ?label ?gn WHERE { VALUES ?item { ${LEGACY_PLACES.map((p) => 'wd:' + p.wikidata).join(' ')} }
  ?item rdfs:label ?label FILTER(LANG(?label) = "uk") OPTIONAL { ?item wdt:P1566 ?gn } }`)
const places = LEGACY_PLACES.map((p) => {
  const r = placeRows.find((x) => x.item.endsWith('/' + p.wikidata))
  if (!r || r.label !== p.name) throw new Error(`Wikidata ${p.wikidata}: очікувалось «${p.name}», отримано «${r?.label}»`)
  return { ...p, geonamesId: r.gn ? Number(r.gn) : null }
})

const catalogMap = { schemaVersion: 2, map: Object.fromEntries(SEED.filter((s) => s.legacy).map((s) => [s.legacy, s.id])) }
const w = (f, v) => writeFileSync(new URL(f, OUT), JSON.stringify(v, null, 2) + '\n')
w('taxa.json', taxa)
w('common-names.json', names)
w('catalog-map.json', catalogMap)
w('places-legacy.json', places)
console.table(report)
console.log(`taxa: ${taxa.length}, common names: ${names.length}, places: ${places.length}, виправлено змішаних назв: ${fixedNames}`)
