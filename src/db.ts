import { openDB, type DBSchema } from 'idb'
import type { CareEvent, Settings, UserPlant } from './types'

interface Schema extends DBSchema {
  plants: { key: string; value: UserPlant }
  events: { key: string; value: CareEvent; indexes: { byPlant: string } }
  meta: { key: string; value: Settings }
}

export const SCHEMA_VERSION = 1
export const DEFAULT_SETTINGS: Settings = { schemaVersion: SCHEMA_VERSION, selectedCityId: 'kyiv', mode: 'simple' }

const dbp = openDB<Schema>('plant-care-ua', 1, {
  upgrade(db) {
    db.createObjectStore('plants', { keyPath: 'id' })
    db.createObjectStore('events', { keyPath: 'id' }).createIndex('byPlant', 'plantId')
    db.createObjectStore('meta')
  },
})

export async function loadAll() {
  const db = await dbp
  const [plants, events, settings] = await Promise.all([
    db.getAll('plants'), db.getAll('events'), db.get('meta', 'settings'),
  ])
  return { plants, events, settings: { ...DEFAULT_SETTINGS, ...settings } }
}
export const putPlant = async (p: UserPlant) => { await (await dbp).put('plants', p) }
export const putEvent = async (ev: CareEvent) => { await (await dbp).put('events', ev) }
export const delEvent = async (id: string) => { await (await dbp).delete('events', id) }
export const putSettings = async (s: Settings) => { await (await dbp).put('meta', s, 'settings') }
export async function delPlant(id: string) {
  const db = await dbp
  const tx = db.transaction(['plants', 'events'], 'readwrite')
  await tx.objectStore('plants').delete(id)
  const evs = await tx.objectStore('events').index('byPlant').getAllKeys(id)
  await Promise.all(evs.map((k) => tx.objectStore('events').delete(k)))
  await tx.done
}
export async function replaceAll(plants: UserPlant[], events: CareEvent[], settings: Settings) {
  const db = await dbp
  const tx = db.transaction(['plants', 'events', 'meta'], 'readwrite')
  await tx.objectStore('plants').clear()
  await tx.objectStore('events').clear()
  await Promise.all([
    ...plants.map((p) => tx.objectStore('plants').put(p)),
    ...events.map((e) => tx.objectStore('events').put(e)),
    tx.objectStore('meta').put(settings, 'settings'),
  ])
  await tx.done
}
