// Юніт-тести валідатора карток і схем. Запуск: node --test scripts/data/test/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateCare, rangeErrors, bindingErrors, verbatimErrors } from '../lib/validate-care.mjs'
import { schemaErrors } from '../lib/schemas.mjs'
import { allowedSourceFor, excludedSourceFor } from '../lib/sources-registry.mjs'

const base = () => ({
  taxonId: 'd7965a19-f9ae-467a-bc6e-da6c2c94fd75',
  version: 1,
  scope: 'outdoor',
  light: 'full-sun',
  water: { model: 'outdoor-interval', baseIntervalDays: 3, seasonFactors: null, rootDepthM: null },
  soil: 'Родючий дренований ґрунт',
  phMin: 6, phMax: 6.8,
  tempMin: 10, tempMax: 30,
  frostHardinessC: null,
  dormancyMonths: [11, 12, 1, 2],
  activeMonths: [5, 6, 7, 8],
  toxicity: { cats: 'toxic', dogs: null, humans: null },
  text_uk: 'Теплолюбна культура, потребує сонця й рівномірної вологості.',
  sources: [{ id: 's1', url: 'https://en.wikipedia.org/wiki/Tomato', title: 'Tomato — Wikipedia', license: 'CC BY-SA 4.0', accessed: '2026-11-01' }],
  fieldSources: {
    light: ['s1'], 'water.baseIntervalDays': ['s1'], soil: ['s1'], phMin: ['s1'], phMax: ['s1'], tempMin: ['s1'], tempMax: ['s1'],
    dormancyMonths: ['s1'], activeMonths: ['s1'], 'toxicity.cats': ['s1'], text_uk: ['s1'],
  },
  reviewNotes: [],
  status: 'ai-checked',
  generatedBy: { model: 'test-model', reviewerModel: 'test-model', promptVersion: 'care-gen-1', generatedAt: '2026-11-01T10:00:00Z' },
  textLicense: 'CC BY-SA 4.0',
  updatedAt: '2026-11-01T10:00:00Z',
})

test('коректна картка проходить усі перевірки', () => {
  assert.deepEqual(validateCare(base()), [])
})

test('tempMin має бути строго менше за tempMax', () => {
  const c = base(); c.tempMin = 30
  assert.match(rangeErrors(c).join(), /строго менше/)
  c.tempMin = 31
  assert.equal(rangeErrors(c).length, 1)
})

test('pH у межах 3–9 і phMin ≤ phMax', () => {
  const c = base(); c.phMin = 2.5
  assert.match(rangeErrors(c).join(), /phMin \(2.5\) поза межами 3–9/)
  const d = base(); d.phMax = 9.5
  assert.match(rangeErrors(d).join(), /phMax/)
  const f = base(); f.phMin = 7; f.phMax = 6
  assert.match(rangeErrors(f).join(), /більший за phMax/)
})

test('інтервал поливу — ціле 1–30', () => {
  for (const bad of [0, 31, 2.5]) {
    const c = base(); c.water.baseIntervalDays = bad
    assert.match(validateCare(c).join(), /baseIntervalDays/, `значення ${bad}`)
  }
  for (const good of [1, 30]) {
    const c = base(); c.water.baseIntervalDays = good
    assert.deepEqual(rangeErrors(c), [])
  }
})

test('місяці 1–12, без повторів і без перетину спокою з активністю', () => {
  const a = base(); a.dormancyMonths = [0, 12]
  assert.match(rangeErrors(a).join(), /цілими 1–12/)
  const b = base(); b.activeMonths = [13]
  assert.match(rangeErrors(b).join(), /цілими 1–12/)
  const c = base(); c.activeMonths = [12, 5]
  assert.match(rangeErrors(c).join(), /перетинаються: 12/)
  const d = base(); d.dormancyMonths = [1, 1]
  assert.match(schemaErrors('careProfile', d).join(), /duplicate|identical/i)
})

test('спокій на всі 12 місяців і неукраїнські тексти відхиляються', () => {
  const a = base(); a.dormancyMonths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]; a.activeMonths = null
  assert.match(rangeErrors(a).join(), /всі 12 місяців/)
  const b = base(); b.soil = 'well-drained, organic mix'
  assert.match(rangeErrors(b).join(), /soil має бути українською/)
  const c = base(); c.text_uk = 'Monstera deliciosa любить яскраве розсіяне світло й помірний полив.'
  assert.deepEqual(rangeErrors(c), [])
})

test('заповнене поле без джерела — помилка; null без джерела — дозволено', () => {
  const c = base(); delete c.fieldSources.soil
  assert.match(bindingErrors(c).join(), /поле soil заповнене без джерела/)
  c.soil = null
  assert.deepEqual(bindingErrors(c), [])
})

test('посилання на неіснуюче джерело — помилка', () => {
  const c = base(); c.fieldSources.light = ['s9']
  assert.match(bindingErrors(c).join(), /неіснуюче джерело s9/)
})

test('виключені й незареєстровані домени відхиляються', () => {
  const c = base(); c.sources[0].url = 'https://powo.science.kew.org/taxon/123'
  assert.match(bindingErrors(c).join(), /не входить до реєстру/)
  assert.ok(excludedSourceFor('https://www.fao.org/3/x0490e/x0490e00.htm'))
  assert.equal(allowedSourceFor('https://uk.wikipedia.org/wiki/Томат')?.license, 'CC BY-SA 4.0')
  assert.equal(allowedSourceFor('https://example.com/'), null)
})

test('дослівне копіювання 8 слів поспіль виявляється, перефразування — ні', () => {
  const src = 'Томати вирощують на добре освітлених ділянках з родючим пухким ґрунтом і регулярним поливом.'
  assert.equal(verbatimErrors('Томати вирощують на добре освітлених ділянках з родючим пухким ґрунтом.', [src]).length, 1)
  assert.deepEqual(verbatimErrors('Культура любить сонце, родючий ґрунт і рівномірну вологість.', [src]), [])
})

test('статус ai-failed з усіма null і зауваженнями — валідний', () => {
  const c = base()
  Object.assign(c, { light: null, soil: null, phMin: null, phMax: null, tempMin: null, tempMax: null, dormancyMonths: null, activeMonths: null, text_uk: null })
  c.water.baseIntervalDays = null
  c.toxicity = { cats: null, dogs: null, humans: null }
  c.fieldSources = {}
  c.status = 'ai-failed'
  c.reviewNotes = [{ field: '*', issue: 'Невалідний JSON після 3 спроб', severity: 'high' }]
  assert.deepEqual(validateCare(c), [])
})

test('схема відхиляє зайві поля, невідомий light і поле без схеми', () => {
  const c = base(); c.light = 'moonlight'
  assert.ok(schemaErrors('careProfile', c).length)
  const d = base(); d.extra = 1
  assert.ok(schemaErrors('careProfile', d).length)
  const e = base(); e.fieldSources.unknownField = ['s1']
  assert.ok(schemaErrors('careProfile', e).length)
})

test('схема Taxon: group без наукової назви, species — з нею', () => {
  const t = { id: '178f127c-c59a-48dc-831b-7686007c0946', rank: 'group', acceptedName: null, nameUk: 'Інша кімнатна рослина', genus: null, family: null, category: 'indoor', synonyms: [], ids: { gbif: null, wikidata: null, powo: null, ipni: null, wcvp: null, plantnet: null }, wikiTitles: { uk: null, en: null }, legacyCatalogId: 'other-indoor', retrievedAt: '2026-11-01T10:00:00Z' }
  assert.deepEqual(schemaErrors('taxon', t), [])
  assert.ok(schemaErrors('taxon', { ...t, rank: 'species' }).length)
})
