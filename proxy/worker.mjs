// Жоржина Рудрігес — захищений проксі розпізнавання рослин (Cloudflare Worker).
// Ключ Pl@ntNet зберігається ЛИШЕ як секрет воркера (PLANTNET_API_KEY), ніколи у фронтенді.
// Фото не зберігається і не логуються: воно лише пересилається на ідентифікацію.

const MAX_BYTES = 4 * 1024 * 1024 // клієнт стискає до 1280 px, тож 4 МБ — із запасом
const ORGANS = new Set(['auto', 'leaf', 'flower', 'fruit', 'bark'])
const TYPES = new Set(['image/jpeg', 'image/png'])
const PER_MINUTE = 10
const PLANTNET = 'https://my-api.plantnet.org/v2/identify/all'

// Запасний ліміт у пам'яті ізоляту (якщо не підключено binding RATE_LIMITER)
const hits = new Map()
function memoryLimited(key, now = Date.now()) {
  const list = (hits.get(key) || []).filter((t) => now - t < 60_000)
  list.push(now)
  hits.set(key, list)
  if (hits.size > 5000) hits.clear()
  return list.length > PER_MINUTE
}

const json = (body, status, cors) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...cors },
})

export default {
  async fetch(req, env) {
    const origin = req.headers.get('origin') || ''
    // ALLOWED_ORIGINS_EXTRA — приватні адреси (напр. LAN-сервер), задаються секретом, щоб не потрапляли в репозиторій
    const allowed = `${env.ALLOWED_ORIGINS || ''},${env.ALLOWED_ORIGINS_EXTRA || ''}`.split(',').map((s) => s.trim()).filter(Boolean)
    const ok = allowed.includes(origin)
    const cors = ok ? { 'access-control-allow-origin': origin, vary: 'origin' } : {}
    const url = new URL(req.url)

    if (url.pathname !== '/identify') return json({ error: 'not_found' }, 404, cors)
    if (req.method === 'OPTIONS') {
      if (!ok) return new Response(null, { status: 403 })
      return new Response(null, { status: 204, headers: { ...cors, 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400' } })
    }
    if (!ok) return json({ error: 'origin_not_allowed' }, 403, cors)
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors)
    if (!env.PLANTNET_API_KEY) return json({ error: 'not_configured' }, 503, cors)

    const ip = req.headers.get('cf-connecting-ip') || 'unknown'
    const limited = env.RATE_LIMITER ? !(await env.RATE_LIMITER.limit({ key: ip })).success : memoryLimited(ip)
    if (limited) return json({ error: 'rate_limited' }, 429, cors)

    const len = Number(req.headers.get('content-length') || 0)
    if (len > MAX_BYTES + 64 * 1024) return json({ error: 'too_large' }, 413, cors)
    if (!(req.headers.get('content-type') || '').startsWith('multipart/form-data')) return json({ error: 'bad_request' }, 400, cors)

    let form
    try { form = await req.formData() } catch { return json({ error: 'bad_request' }, 400, cors) }
    const image = form.get('image')
    const organ = String(form.get('organ') || 'auto')
    if (!image || typeof image === 'string') return json({ error: 'no_image' }, 400, cors)
    if (!TYPES.has(image.type)) return json({ error: 'bad_type' }, 415, cors)
    if (image.size > MAX_BYTES) return json({ error: 'too_large' }, 413, cors)
    if (!ORGANS.has(organ)) return json({ error: 'bad_organ' }, 400, cors)

    const out = new FormData()
    out.append('images', image, image.type === 'image/png' ? 'photo.png' : 'photo.jpg')
    out.append('organs', organ)
    const params = new URLSearchParams({ 'api-key': env.PLANTNET_API_KEY, 'nb-results': '5', lang: env.PLANTNET_LANG || 'en' })

    let r
    try {
      r = await fetch(`${PLANTNET}?${params}`, { method: 'POST', body: out, signal: AbortSignal.timeout(20_000) })
    } catch {
      return json({ error: 'upstream_unavailable' }, 502, cors)
    }
    if (r.status === 404) return json({ source: 'Pl@ntNet', results: [] }, 200, cors) // вид не знайдено
    if (r.status === 429) return json({ error: 'quota_exceeded' }, 429, cors)
    if (!r.ok) return json({ error: 'upstream_error' }, 502, cors)

    let j
    try { j = await r.json() } catch { return json({ error: 'upstream_error' }, 502, cors) }
    const results = (Array.isArray(j.results) ? j.results : []).slice(0, 5).map((x) => ({
      scientificName: x?.species?.scientificNameWithoutAuthor,
      genus: x?.species?.genus?.scientificNameWithoutAuthor,
      family: x?.species?.family?.scientificNameWithoutAuthor,
      commonNames: Array.isArray(x?.species?.commonNames) ? x.species.commonNames.slice(0, 3) : [],
      score: x?.score,
    })).filter((x) => typeof x.scientificName === 'string' && typeof x.score === 'number')
    return json({ source: 'Pl@ntNet', results }, 200, cors)
  },
}
