import { useCallback, useEffect, useState } from 'react'
import type { City } from './types'

export interface WeatherData {
  temp: number
  humidity?: number
  precipNow?: number
  /** сума опадів, мм: [позавчора, вчора, сьогодні, завтра, післязавтра] */
  precipDaily: (number | null)[]
  tmaxToday: number | null
  fetchedAt: string
}
export type WeatherStatus = 'loading' | 'live' | 'cached' | 'unavailable'

const key = (id: string) => `weather:${id}`
const readCache = (id: string): WeatherData | null => {
  try { return JSON.parse(localStorage.getItem(key(id)) ?? 'null') } catch { return null }
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Відсутні/некоректні значення лишаються null (ніколи не підміняються нулем); непридатна відповідь — помилка. */
export function parseWeather(j: any): WeatherData {
  const cur = j?.current
  const daily = j?.daily
  const temp = num(cur?.temperature_2m)
  if (temp === null) throw new Error('bad current')
  if (!Array.isArray(daily?.precipitation_sum) || !Array.isArray(daily?.temperature_2m_max) || daily.precipitation_sum.length < 3 || daily.temperature_2m_max.length < 3)
    throw new Error('bad daily')
  return {
    temp,
    humidity: num(cur.relative_humidity_2m) ?? undefined,
    precipNow: num(cur.precipitation) ?? undefined,
    precipDaily: daily.precipitation_sum.map(num),
    tmaxToday: num(daily.temperature_2m_max[2]),
    fetchedAt: new Date().toISOString(),
  }
}

async function fetchWeather(city: City): Promise<WeatherData> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}` +
    `&current=temperature_2m,relative_humidity_2m,precipitation&daily=precipitation_sum,temperature_2m_max` +
    `&timezone=auto&past_days=2&forecast_days=3`
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 8000)
  try {
    const r = await fetch(url, { signal: ctrl.signal })
    if (!r.ok) throw new Error(String(r.status))
    return parseWeather(await r.json())
  } finally { clearTimeout(t) }
}

export function useWeather(city: City) {
  const [state, setState] = useState<{ status: WeatherStatus; data: WeatherData | null }>({ status: 'loading', data: null })
  const [n, setN] = useState(0)
  useEffect(() => {
    let alive = true
    setState({ status: 'loading', data: null })
    fetchWeather(city)
      .then((d) => {
        try { localStorage.setItem(key(city.id), JSON.stringify(d)) } catch { /* ignore */ }
        if (alive) setState({ status: 'live', data: d })
      })
      .catch(() => {
        const c = readCache(city.id)
        if (alive) setState(c ? { status: 'cached', data: c } : { status: 'unavailable', data: null })
      })
    return () => { alive = false }
  }, [city, n])
  const reload = useCallback(() => setN((x) => x + 1), [])
  return { ...state, reload }
}
