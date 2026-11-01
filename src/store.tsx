import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as db from './db'
import { SCHEMA_VERSION } from './db'
import { CATALOG, catalogById } from './catalog'
import { cityById } from './cities'
import type { CareEvent, Category, Mode, Placement, Settings, UserPlant } from './types'

interface Store {
  ready: boolean
  plants: UserPlant[]
  events: CareEvent[]
  settings: Settings
  storageError: string | null
  clearStorageError(): void
  /** Повертає false, якщо запис у сховище не вдався (помилка показується користувачу). */
  addPlant(p: UserPlant, lastWatered?: string): Promise<boolean>
  updatePlant(p: UserPlant): Promise<boolean>
  removePlant(id: string): Promise<boolean>
  /** Повторний виклик для тієї ж рослини й типу протягом 2 с повертає наявний запис (захист від подвійного кліку). */
  addEvent(plantId: string, type: CareEvent['type'], timestamp?: string, moisture?: CareEvent['moisture']): Promise<CareEvent | undefined>
  removeEvent(id: string): Promise<void>
  setCity(id: string): Promise<void>
  setMode(m: Mode): Promise<void>
  loadDemo(): Promise<void>
  replaceAll(plants: UserPlant[], events: CareEvent[], settings: Settings): Promise<boolean>
}

const Ctx = createContext<Store | null>(null)
export const useStore = () => {
  const s = useContext(Ctx)
  if (!s) throw new Error('Store missing')
  return s
}
export const uid = () => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  // LAN HTTP is not a secure context, but getRandomValues remains available.
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const DEFAULT_PLACEMENT: Record<Category, Placement> = { indoor: 'indoor', garden: 'outdoor', vegetable: 'outdoor', tree: 'outdoor' }
export const defaultPlacement = (c: Category) => DEFAULT_PLACEMENT[c]

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [plants, setPlants] = useState<UserPlant[]>([])
  const [events, setEvents] = useState<CareEvent[]>([])
  const [settings, setSettings] = useState<Settings>(db.DEFAULT_SETTINGS)
  const [storageError, setStorageError] = useState<string | null>(null)
  const recent = useRef(new Map<string, { at: number; ev: CareEvent }>())

  const guard = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    try { return await fn() } catch (e) {
      const quota = (e as DOMException)?.name === 'QuotaExceededError'
      setStorageError(quota
        ? 'Недостатньо місця у сховищі браузера. Зміни не збережено. Видаліть непотрібні фото або дані.'
        : 'Не вдалося зберегти зміни у сховищі браузера (можливо, вимкнено сховище або приватний режим). Зміни не збережено.')
      return undefined
    }
  }, [])

  useEffect(() => {
    db.loadAll().then((d) => {
      setPlants(d.plants); setEvents(d.events); setSettings(d.settings); setReady(true)
    }).catch(() => {
      setStorageError('Не вдалося відкрити сховище браузера. Дані не завантажено, нові записи можуть не зберегтися.')
      setReady(true)
    })
  }, [])

  const addEvent = useCallback(async (plantId: string, type: CareEvent['type'], timestamp?: string, moisture?: CareEvent['moisture']) => {
    const k = `${plantId}:${type}`
    const prev = recent.current.get(k)
    if (!timestamp && prev && Date.now() - prev.at < 2000) return prev.ev
    const ev: CareEvent = { id: uid(), plantId, type, timestamp: timestamp ?? new Date().toISOString(), ...(moisture && type === 'soil_checked' ? { moisture } : {}) }
    if (!timestamp) recent.current.set(k, { at: Date.now(), ev })
    const ok = await guard(async () => { await db.putEvent(ev); return true })
    if (!ok) { recent.current.delete(k); return undefined }
    setEvents((e) => [...e, ev])
    return ev
  }, [guard])

  const value = useMemo<Store>(() => ({
    ready, plants, events, settings, addEvent, storageError, clearStorageError: () => setStorageError(null),
    async addPlant(p, lastWatered) {
      const ok = await guard(async () => { await db.putPlant(p); return true })
      if (!ok) return false
      setPlants((x) => [...x, p])
      if (lastWatered) await addEvent(p.id, 'watered', lastWatered)
      return true
    },
    async updatePlant(p) {
      const ok = await guard(async () => { await db.putPlant(p); return true })
      if (ok) setPlants((x) => x.map((y) => (y.id === p.id ? p : y)))
      return !!ok
    },
    async removePlant(id) {
      const ok = await guard(async () => { await db.delPlant(id); return true })
      if (!ok) return false
      setPlants((x) => x.filter((y) => y.id !== id))
      setEvents((x) => x.filter((y) => y.plantId !== id))
      return true
    },
    async removeEvent(id) {
      const ok = await guard(async () => { await db.delEvent(id); return true })
      if (!ok) return
      for (const [k, v] of recent.current) if (v.ev.id === id) recent.current.delete(k)
      setEvents((x) => x.filter((y) => y.id !== id))
    },
    async setCity(id) {
      const s = { ...settings, selectedCityId: id }
      if (await guard(async () => { await db.putSettings(s); return true })) setSettings(s)
    },
    async setMode(m) {
      const s = { ...settings, mode: m }
      if (await guard(async () => { await db.putSettings(s); return true })) setSettings(s)
    },
    async loadDemo() {
      const mk = (catalogId: string, placement?: Placement, daysAgo = 3, extra: Partial<UserPlant> = {}) => {
        const c = catalogById(catalogId)!
        const p: UserPlant = {
          id: uid(), catalogId, category: c.category, placement: placement ?? DEFAULT_PLACEMENT[c.category],
          cityId: settings.selectedCityId, addedAt: new Date(Date.now() - 20 * 86400000).toISOString(), ...extra,
        }
        return { p, ts: new Date(Date.now() - daysAgo * 86400000).toISOString() }
      }
      const demo = [mk('monstera', undefined, 6), mk('orchid', undefined, 2), mk('tomato', undefined, 3, { sunExposure: 'sun' }),
        mk('rose', undefined, 4), mk('apple', undefined, 5), mk('strawberry', 'balcony', 1, { potOrGround: 'pot' })]
      const newEvents: CareEvent[] = demo.map(({ p, ts }) => ({ id: uid(), plantId: p.id, type: 'watered', timestamp: ts, note: 'Демо-запис' }))
      const ps = demo.map((d) => d.p)
      const saved = await guard(async () => {
        for (const p of ps) await db.putPlant(p)
        for (const e of newEvents) await db.putEvent(e)
        return true
      })
      if (!saved) return
      setPlants((x) => [...x, ...ps]); setEvents((x) => [...x, ...newEvents])
    },
    async replaceAll(p, e, s) {
      if (!(await guard(async () => { await db.replaceAll(p, e, s); return true }))) return false
      recent.current.clear()
      setPlants(p); setEvents(e); setSettings(s)
      return true
    },
  }), [ready, plants, events, settings, addEvent, guard, storageError])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/* ---------- Зображення ---------- */
export async function shrinkImage(file: Blob, max = 800): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Оберіть файл зображення.')
  if (file.size > 15 * 1024 * 1024) throw new Error('Файл завеликий (макс. 15 МБ).')
  const bmp = await createImageBitmap(file).catch(() => { throw new Error('Не вдалося прочитати зображення.') })
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Не вдалося стиснути'))), 'image/jpeg', 0.8))
}
const blobToDataUrl = (b: Blob) => new Promise<string>((res, rej) => {
  const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = () => rej(r.error); r.readAsDataURL(b)
})

/* ---------- Резервна копія ---------- */
export async function buildBackup(plants: UserPlant[], events: CareEvent[], settings: Settings) {
  const out = []
  for (const p of plants) {
    const { imageBlob, ...rest } = p
    out.push({ ...rest, imageDataUrl: imageBlob ? await blobToDataUrl(imageBlob) : undefined })
  }
  return JSON.stringify({ app: 'plant-care-ua', schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), settings, plants: out, events }, null, 2)
}

export function parseBackup(text: string): { plants: UserPlant[]; events: CareEvent[]; settings: Settings } {
  let j: any
  try { j = JSON.parse(text) } catch { throw new Error('Файл не є коректним JSON.') }
  if (!j || j.app !== 'plant-care-ua') throw new Error('Це не резервна копія цього застосунку.')
  if (j.schemaVersion !== SCHEMA_VERSION) throw new Error(`Непідтримувана версія схеми: ${j.schemaVersion}.`)
  if (!Array.isArray(j.plants) || !Array.isArray(j.events)) throw new Error('Пошкоджена структура файлу.')
  const cats = ['indoor', 'garden', 'vegetable', 'tree']
  const places = ['indoor', 'balcony', 'outdoor', 'greenhouse']
  const ids = new Set<string>()
  const plants: UserPlant[] = j.plants.map((p: any) => {
    if (typeof p?.id !== 'string' || !catalogById(p.catalogId) || !cats.includes(p.category) || !places.includes(p.placement) || isNaN(Date.parse(p.addedAt)))
      throw new Error('Некоректний запис рослини у файлі.')
    ids.add(p.id)
    const { imageDataUrl, ...rest } = p
    const out: UserPlant = { ...rest, cityId: cityById(p.cityId).id, scientificName: typeof p.scientificName === 'string' ? p.scientificName.slice(0, 120) : undefined }
    if (typeof imageDataUrl === 'string' && imageDataUrl.startsWith('data:image/')) {
      const [h, b64] = imageDataUrl.split(',')
      const bin = atob(b64); const arr = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
      out.imageBlob = new Blob([arr], { type: h.slice(5, h.indexOf(';')) })
    }
    return out
  })
  const events: CareEvent[] = j.events.map((e: any) => {
    if (typeof e?.id !== 'string' || !ids.has(e.plantId) || !['watered', 'soil_checked'].includes(e.type) || isNaN(Date.parse(e.timestamp)) || (e.moisture !== undefined && !['dry', 'moist', 'wet'].includes(e.moisture)))
      throw new Error('Некоректний запис журналу у файлі.')
    return e
  })
  const s = j.settings ?? {}
  const settings: Settings = { schemaVersion: SCHEMA_VERSION, selectedCityId: cityById(s.selectedCityId).id, mode: s.mode === 'smart' ? 'smart' : 'simple' }
  return { plants, events, settings }
}
export { CATALOG }
