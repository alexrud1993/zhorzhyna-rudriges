import { CATALOG } from './catalog'
import type { PlantCatalogEntry } from './types'

/** Результат — це лише ПРОПОЗИЦІЇ, їх завжди підтверджує користувач. */
export interface PlantIdentificationProvider {
  mode: 'manual' | 'gemini'
  available: boolean
  suggest(input: { query?: string; image?: Blob }): Promise<PlantCatalogEntry[]>
}

export const manualProvider: PlantIdentificationProvider = {
  mode: 'manual',
  available: true,
  async suggest({ query }) {
    const q = (query ?? '').trim().toLowerCase()
    return q ? CATALOG.filter((c) => c.commonNameUk.toLowerCase().includes(q)) : CATALOG
  },
}

/** Заглушка: Gemini підключається ЛИШЕ через захищений backend proxy (ключ ніколи не у фронтенді). */
export const geminiProvider: PlantIdentificationProvider = {
  mode: 'gemini',
  available: false,
  async suggest() { throw new Error('AI-розпізнавання ще не підключено') },
}
