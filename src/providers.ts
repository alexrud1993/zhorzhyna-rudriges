import { CATALOG, SCIENTIFIC, catalogById } from './catalog'
import type { PlantCatalogEntry } from './types'

export type Organ = 'auto' | 'leaf' | 'flower' | 'fruit' | 'bark'

/** Варіант розпізнавання. Це лише ПРОПОЗИЦІЯ — її завжди підтверджує користувач. */
export interface Suggestion {
  scientificName: string
  commonNames: string[]
  /** Оцінка сервісу 0…1 — не гарантія правильності */
  score: number
  /** Запис каталогу, якщо вид або рід є в демо-каталозі */
  entry?: PlantCatalogEntry
  match: 'species' | 'genus' | 'none'
}

export interface PlantIdentificationProvider {
  mode: 'manual' | 'remote'
  available: boolean
  identify(image: Blob, organ: Organ): Promise<{ source: string; results: Suggestion[] }>
}

/** Ручний вибір завжди доступний: пошук у каталозі за назвою. */
export const searchCatalog = (query: string) => {
  const q = query.trim().toLowerCase()
  return CATALOG.filter((c) => c.commonNameUk.toLowerCase().includes(q))
}

const normalize = (name: string) =>
  name.toLowerCase().replace(/[×x]\s+/g, '').split(/\s+/).filter(Boolean).slice(0, 2).join(' ')

export function matchCatalog(scientificName: string, genus?: string): Pick<Suggestion, 'entry' | 'match'> {
  const sp = normalize(scientificName)
  const gen = (genus || sp.split(' ')[0] || '').toLowerCase()
  for (const [id, s] of Object.entries(SCIENTIFIC)) if (s.species.includes(sp)) return { entry: catalogById(id), match: 'species' }
  for (const [id, s] of Object.entries(SCIENTIFIC)) if (s.genus?.includes(gen)) return { entry: catalogById(id), match: 'genus' }
  return { match: 'none' }
}

export class IdentifyError extends Error {}

/** Адреса захищеного проксі (публічна URL, НЕ ключ). Ключ сервісу зберігається лише на проксі. */
export const identifyUrl = (): string => {
  // Тестовий перемикач: __IDENTIFY_URL__ = 'off' вимикає розпізнавання, інший рядок — підміняє адресу
  const o = (globalThis as { __IDENTIFY_URL__?: string }).__IDENTIFY_URL__
  if (o === 'off') return ''
  return o || import.meta.env.VITE_IDENTIFY_URL || ''
}

export const remoteProvider: PlantIdentificationProvider = {
  mode: 'remote',
  get available() { return !!identifyUrl() },
  async identify(image, organ) {
    const url = identifyUrl()
    if (!url) throw new IdentifyError('Розпізнавання не підключено.')
    const fd = new FormData()
    fd.append('image', image, 'photo.jpg')
    fd.append('organ', organ)
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 30000)
    let r: Response
    try { r = await fetch(url, { method: 'POST', body: fd, signal: ctrl.signal }) }
    catch { throw new IdentifyError(ctrl.signal.aborted ? 'Сервіс розпізнавання не відповів вчасно. Спробуйте ще раз.' : 'Немає зʼєднання із сервісом розпізнавання. Перевірте інтернет.') }
    finally { clearTimeout(t) }
    if (r.status === 429) throw new IdentifyError('Ліміт розпізнавань на зараз вичерпано. Спробуйте пізніше або оберіть рослину вручну.')
    if (r.status === 413) throw new IdentifyError('Фото завелике для розпізнавання.')
    if (!r.ok) throw new IdentifyError('Сервіс розпізнавання тимчасово недоступний. Оберіть рослину вручну.')
    let j: any
    try { j = await r.json() } catch { throw new IdentifyError('Сервіс розпізнавання повернув некоректну відповідь.') }
    if (!Array.isArray(j?.results)) throw new IdentifyError('Сервіс розпізнавання повернув некоректну відповідь.')
    const results: Suggestion[] = j.results
      .filter((x: any) => typeof x?.scientificName === 'string' && typeof x?.score === 'number')
      .slice(0, 5)
      .map((x: any) => ({
        scientificName: x.scientificName,
        commonNames: Array.isArray(x.commonNames) ? x.commonNames.filter((n: unknown) => typeof n === 'string').slice(0, 3) : [],
        score: Math.max(0, Math.min(1, x.score)),
        ...matchCatalog(x.scientificName, typeof x.genus === 'string' ? x.genus : undefined),
      }))
    return { source: typeof j.source === 'string' ? j.source : 'сервіс розпізнавання', results }
  },
}
