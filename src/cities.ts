import type { City } from './types'

export const CITIES: City[] = [
  { id: 'kyiv', name: 'Київ', lat: 50.45, lon: 30.52 },
  { id: 'lviv', name: 'Львів', lat: 49.84, lon: 24.03 },
  { id: 'odesa', name: 'Одеса', lat: 46.48, lon: 30.73 },
  { id: 'kharkiv', name: 'Харків', lat: 49.99, lon: 36.23 },
  { id: 'dnipro', name: 'Дніпро', lat: 48.46, lon: 35.05 },
]
export const cityById = (id: string) => CITIES.find((c) => c.id === id) ?? CITIES[0]
