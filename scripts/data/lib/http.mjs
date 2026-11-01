// HTTP для конвеєра: User-Agent з адресою проєкту (без особистих даних), timeout, повтори на 429/5xx.
export const UA = 'zhorzhyna-rudriges-data-pipeline/0.1 (+https://github.com/alexrud1993/zhorzhyna-rudriges)'

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function fetchJson(url, { headers = {}, tries = 3, timeoutMs = 30000 } = {}) {
  let last
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json', ...headers }, signal: AbortSignal.timeout(timeoutMs) })
      if (r.status === 429 || r.status >= 500) { last = new Error(`HTTP ${r.status} ${url}`); await sleep(2000 * (i + 1)); continue }
      if (r.status === 404) return null
      if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`)
      return await r.json()
    } catch (e) { last = e; await sleep(1000 * (i + 1)) }
  }
  throw last
}

export async function sparql(query) {
  const url = 'https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(query)
  const j = await fetchJson(url, { headers: { accept: 'application/sparql-results+json' } })
  return j.results.bindings.map((b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value])))
}
