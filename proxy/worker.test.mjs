// Модульні тести проксі без мережі: fetch Pl@ntNet підмінено. Запуск: node proxy/worker.test.mjs
import assert from 'node:assert/strict'
import worker from './worker.mjs'

const SITE = 'https://alexrud1993.github.io'
const env = { ALLOWED_ORIGINS: `${SITE},http://localhost:5173`, PLANTNET_API_KEY: 'test-key' }
let upstream = { status: 200, body: {} }
let lastUrl = ''
globalThis.fetch = async (u, init) => {
  lastUrl = String(u)
  assert.ok(init.body instanceof FormData)
  return new Response(JSON.stringify(upstream.body), { status: upstream.status })
}
const jpeg = () => new File([new Uint8Array(1000)], 'p.jpg', { type: 'image/jpeg' })
const req = (fd, { origin = SITE, method = 'POST', path = '/identify', ip = '1.1.1.1' } = {}) =>
  new Request(`https://proxy.example${path}`, { method, body: method === 'POST' ? fd : undefined, headers: { origin, 'cf-connecting-ip': ip } })
const form = (image = jpeg(), organ = 'auto') => { const f = new FormData(); if (image) f.append('image', image); f.append('organ', organ); return f }
let pass = 0
const t = async (name, fn) => { await fn(); pass++; console.log('PASS', name) }

await t('чужий origin відхиляється', async () => {
  const r = await worker.fetch(req(form(), { origin: 'https://evil.example' }), env)
  assert.equal(r.status, 403); assert.equal(r.headers.get('access-control-allow-origin'), null)
})
await t('preflight для дозволеного origin', async () => {
  const r = await worker.fetch(req(null, { method: 'OPTIONS' }), env)
  assert.equal(r.status, 204); assert.equal(r.headers.get('access-control-allow-origin'), SITE)
})
await t('немає ключа -> 503, без виклику сервісу', async () => {
  lastUrl = ''
  const r = await worker.fetch(req(form(), { ip: '2.2.2.2' }), { ...env, PLANTNET_API_KEY: '' })
  assert.equal(r.status, 503); assert.equal(lastUrl, '')
})
await t('невірний тип файлу -> 415', async () => {
  const r = await worker.fetch(req(form(new File(['x'], 'a.gif', { type: 'image/gif' })), { ip: '3.3.3.3' }), env)
  assert.equal(r.status, 415)
})
await t('завеликий файл -> 413', async () => {
  const big = new File([new Uint8Array(4 * 1024 * 1024 + 1)], 'b.jpg', { type: 'image/jpeg' })
  const r = await worker.fetch(req(form(big), { ip: '4.4.4.4' }), env)
  assert.equal(r.status, 413)
})
await t('невідомий organ -> 400', async () => {
  const r = await worker.fetch(req(form(jpeg(), 'root'), { ip: '5.5.5.5' }), env)
  assert.equal(r.status, 400)
})
await t('успіх: нормалізована відповідь, ключ не повертається', async () => {
  upstream = { status: 200, body: { results: [{ score: 0.91, species: { scientificNameWithoutAuthor: 'Monstera deliciosa', genus: { scientificNameWithoutAuthor: 'Monstera' }, family: { scientificNameWithoutAuthor: 'Araceae' }, commonNames: ['Swiss cheese plant'] } }, { score: 'x', species: {} }] } }
  const r = await worker.fetch(req(form(), { ip: '6.6.6.6' }), env)
  assert.equal(r.status, 200)
  const text = await r.text()
  assert.ok(!text.includes('test-key'))
  const j = JSON.parse(text)
  assert.equal(j.results.length, 1)
  assert.deepEqual(j.results[0], { scientificName: 'Monstera deliciosa', genus: 'Monstera', family: 'Araceae', commonNames: ['Swiss cheese plant'], score: 0.91 })
  assert.ok(lastUrl.includes('api-key=test-key') && lastUrl.includes('nb-results=5'))
})
await t('вид не знайдено (404 сервісу) -> порожній список', async () => {
  upstream = { status: 404, body: { message: 'Species not found' } }
  const j = await (await worker.fetch(req(form(), { ip: '7.7.7.7' }), env)).json()
  assert.deepEqual(j.results, [])
})
await t('квота сервісу -> 429', async () => {
  upstream = { status: 429, body: {} }
  assert.equal((await worker.fetch(req(form(), { ip: '8.8.8.8' }), env)).status, 429)
})
await t('ліміт частоти: 11-й запит за хвилину -> 429', async () => {
  upstream = { status: 200, body: { results: [] } }
  let last
  for (let i = 0; i < 11; i++) last = await worker.fetch(req(form(), { ip: '9.9.9.9' }), env)
  assert.equal(last.status, 429)
})
await t('binding RATE_LIMITER має пріоритет', async () => {
  const r = await worker.fetch(req(form(), { ip: '10.0.0.1' }), { ...env, RATE_LIMITER: { limit: async () => ({ success: false }) } })
  assert.equal(r.status, 429)
})
await t('додаткові origin з ALLOWED_ORIGINS_EXTRA', async () => {
  const r = await worker.fetch(req(null, { method: 'OPTIONS', origin: 'http://10.1.2.3:8080' }), { ...env, ALLOWED_ORIGINS_EXTRA: 'http://10.1.2.3:8080' })
  assert.equal(r.status, 204); assert.equal(r.headers.get('access-control-allow-origin'), 'http://10.1.2.3:8080')
})
await t('інші шляхи -> 404', async () => {
  assert.equal((await worker.fetch(req(form(), { path: '/' }), env)).status, 404)
})
console.log(`\nALL PASSED: ${pass}`)
