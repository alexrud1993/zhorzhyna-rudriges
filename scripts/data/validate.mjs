// Валідація пакетів data/v2 (DB-008): JSON Schema + посилальна цілісність + жорсткі перевірки карток.
// Запуск: node scripts/data/validate.mjs   (код виходу 1 при помилках — для CI)
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { schemaErrors } from './lib/schemas.mjs'
import { validateCare } from './lib/validate-care.mjs'
import { SEED } from './seed.mjs'

const DIR = new URL('../../data/v2/', import.meta.url)
const CACHE = new URL('../../data/cache/sources/', import.meta.url)
const read = (f) => JSON.parse(readFileSync(new URL(f, DIR), 'utf8'))
const errors = []
const err = (file, msg) => errors.push(`${file}: ${msg}`)

const taxa = read('taxa.json')
const taxonIds = new Set()
taxa.forEach((t, i) => {
  for (const e of schemaErrors('taxon', t)) err('taxa.json', `[${i}] ${e}`)
  if (taxonIds.has(t.id)) err('taxa.json', `дубль id ${t.id}`)
  taxonIds.add(t.id)
})

read('common-names.json').forEach((n, i) => {
  for (const e of schemaErrors('commonName', n)) err('common-names.json', `[${i}] ${e}`)
  if (!taxonIds.has(n.taxonId)) err('common-names.json', `[${i}] невідомий taxonId ${n.taxonId}`)
})

// DB-007: відповідність каталогу v1 повна, незмінна й узгоджена з taxa.json
const cmap = read('catalog-map.json')
for (const e of schemaErrors('catalogMap', cmap)) err('catalog-map.json', e)
for (const s of SEED.filter((x) => x.legacy)) {
  if (cmap.map[s.legacy] !== s.id) err('catalog-map.json', `${s.legacy} → ${cmap.map[s.legacy]}, очікувався зафіксований ${s.id}`)
  const t = taxa.find((x) => x.id === s.id)
  if (!t || t.legacyCatalogId !== s.legacy) err('catalog-map.json', `таксон ${s.id} не має legacyCatalogId ${s.legacy}`)
}

read('places-legacy.json').forEach((p, i) => { for (const e of schemaErrors('place', p)) err('places-legacy.json', `[${i}] ${e}`) })

// Картки догляду: усі файли care*.json
let cards = 0
for (const f of readdirSync(DIR).filter((x) => /^care.*\.json$/.test(x))) {
  const list = read(f)
  const seen = new Set()
  list.forEach((c, i) => {
    cards++
    if (!taxonIds.has(c.taxonId)) err(f, `[${i}] невідомий taxonId ${c.taxonId}`)
    if (seen.has(c.taxonId)) err(f, `[${i}] дубль картки для ${c.taxonId}`)
    seen.add(c.taxonId)
    // Тексти джерел (кеш) потрібні лише для перевірки дослівного копіювання; у CI кешу немає — її виконує генератор
    const cacheFile = new URL(`${c.taxonId}.json`, CACHE)
    const sourceTexts = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')).map((s) => s.text) : undefined
    for (const e of validateCare(c, { sourceTexts })) err(f, `[${i}] ${c.taxonId}: ${e}`)
  })
}

if (errors.length) {
  console.error(`✖ data/v2: ${errors.length} помилок`)
  for (const e of errors) console.error('  ' + e)
  process.exit(1)
}
console.log(`✔ data/v2 валідне: таксонів ${taxa.length}, карток ${cards}, міст ${read('places-legacy.json').length}, catalog-map ${Object.keys(cmap.map).length}`)
