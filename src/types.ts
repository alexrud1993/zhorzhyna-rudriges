export type Category = 'indoor' | 'garden' | 'vegetable' | 'tree'
export type Placement = 'indoor' | 'balcony' | 'outdoor' | 'greenhouse'
export type Mode = 'simple' | 'smart'

export interface PlantCatalogEntry {
  id: string
  commonNameUk: string
  category: Category
  careSummary: string
  lightHint: string
  soilHint: string
  wateringHint: string
  emoji: string
  /** Загальний орієнтовний інтервал перевірки ґрунту (діб) — лише для прототипу */
  checkEveryDays: number
}

export interface UserPlant {
  id: string
  catalogId: string
  customName?: string
  category: Category
  placement: Placement
  cityId: string
  imageBlob?: Blob
  addedAt: string
  soilType?: 'sandy' | 'loam' | 'clay'
  sunExposure?: 'shade' | 'partial' | 'sun'
  potOrGround?: 'pot' | 'ground'
}

export interface CareEvent {
  id: string
  plantId: string
  type: 'watered' | 'soil_checked'
  timestamp: string
  note?: string
  /** Ручна оцінка вологості ґрунту (лише для soil_checked, необов’язково) */
  moisture?: 'dry' | 'moist' | 'wet'
}

export interface Settings {
  schemaVersion: number
  selectedCityId: string
  mode: Mode
}

export interface City { id: string; name: string; lat: number; lon: number }
