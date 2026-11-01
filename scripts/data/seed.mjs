// Зафіксовані таксони: 16 + 4 записи каталогу v1 (DB-007) і нові види пілоту.
// UUID v4 згенеровано один раз 01.11.2026 і НЕ змінюються (на них посилаються дані користувачів).

export const SEED = [
  { id: '5d20761e-db52-43cb-b016-516213676ee4', legacy: 'monstera', name: 'Monstera deliciosa', rank: 'species', category: 'indoor', nameUk: 'Монстера' },
  { id: 'fe2936f9-0038-4005-91e6-024d7c967158', legacy: 'ficus', name: 'Ficus benjamina', rank: 'species', category: 'indoor', nameUk: 'Фікус Бенджаміна' },
  { id: 'd7bff865-a337-480e-8382-4cc6c0333ce3', legacy: 'sansevieria', name: 'Dracaena trifasciata', rank: 'species', category: 'indoor', nameUk: 'Сансев’єрія' },
  { id: 'b5f75ed4-7715-411f-9e49-83cdc91df160', legacy: 'zamioculcas', name: 'Zamioculcas zamiifolia', rank: 'species', category: 'indoor', nameUk: 'Замійокулькас' },
  { id: '1a594c6c-99c2-4ad9-b092-d4aa3cb51a87', legacy: 'orchid', name: 'Phalaenopsis', rank: 'genus', category: 'indoor', nameUk: 'Орхідея фаленопсис' },
  { id: '4ad89a82-78db-47f1-81db-690528d299cd', legacy: 'spathiphyllum', name: 'Spathiphyllum', rank: 'genus', category: 'indoor', nameUk: 'Спатифілум' },
  { id: 'b920fa9d-b6bb-4932-9371-68e36c69f483', legacy: 'rose', name: 'Rosa', rank: 'genus', category: 'garden', nameUk: 'Троянда садова' },
  { id: '0a308c0f-e7b3-48d7-81da-b28cdda4ae5f', legacy: 'hydrangea', name: 'Hydrangea', rank: 'genus', category: 'garden', nameUk: 'Гортензія' },
  { id: '559911f1-0e66-4ce9-9910-e9b56d3ae762', legacy: 'lavender', name: 'Lavandula angustifolia', rank: 'species', category: 'garden', nameUk: 'Лаванда' },
  { id: 'd7965a19-f9ae-467a-bc6e-da6c2c94fd75', legacy: 'tomato', name: 'Solanum lycopersicum', rank: 'species', category: 'vegetable', nameUk: 'Томат' },
  { id: '2bf4bfe2-8f80-437f-b166-18092cddef69', legacy: 'cucumber', name: 'Cucumis sativus', rank: 'species', category: 'vegetable', nameUk: 'Огірок' },
  { id: 'b6573b2b-a766-4ea6-90ff-b7cd1aaefc65', legacy: 'pepper', name: 'Capsicum annuum', rank: 'species', category: 'vegetable', nameUk: 'Перець солодкий' },
  { id: '888215da-57f6-4e3d-ad32-1919d131f540', legacy: 'strawberry', name: 'Fragaria × ananassa', rank: 'hybrid', category: 'vegetable', nameUk: 'Полуниця' },
  { id: '560f5e9c-354c-49ac-9709-5bba63c907a2', legacy: 'apple', name: 'Malus domestica', rank: 'species', category: 'tree', nameUk: 'Яблуня' },
  { id: '2018d08a-c8f3-4a05-a24f-078682a0712e', legacy: 'thuja', name: 'Thuja occidentalis', rank: 'species', category: 'tree', nameUk: 'Туя' },
  { id: 'c7f1af76-05f2-4580-9566-5eefb8fab3f7', legacy: 'currant', name: 'Ribes nigrum', rank: 'species', category: 'tree', nameUk: 'Смородина чорна' },
  { id: '178f127c-c59a-48dc-831b-7686007c0946', legacy: 'other-indoor', name: null, rank: 'group', category: 'indoor', nameUk: 'Інша кімнатна рослина' },
  { id: '181833ca-4390-49d8-9f55-778babe7a54f', legacy: 'other-garden', name: null, rank: 'group', category: 'garden', nameUk: 'Інша садова рослина' },
  { id: '013fdb63-d391-49ae-b6e8-e1b1fc9f0ecf', legacy: 'other-vegetable', name: null, rank: 'group', category: 'vegetable', nameUk: 'Інша городня культура' },
  { id: '57e93e8d-f4ed-4fd0-94c6-cff5e1759eac', legacy: 'other-tree', name: null, rank: 'group', category: 'tree', nameUk: 'Інше дерево чи кущ' },
  // Нові види пілоту
  { id: '79ad5928-7990-4f3c-a5a5-52b225a2c895', legacy: null, name: 'Schlumbergera truncata', rank: 'species', category: 'indoor', nameUk: null },
  { id: '16a62737-d3f9-4bf5-9161-b98e4d984da5', legacy: null, name: 'Hippeastrum', rank: 'genus', category: 'indoor', nameUk: null },
  { id: 'ffc0ba61-d6a6-4368-bcf1-e4b1ca9c342b', legacy: null, name: 'Pulsatilla ucrainica', rank: 'species', category: 'garden', nameUk: null },
]

/** Пілот пакета №1: 5 культур відкритого ґрунту, 4 кімнатні з різним спокоєм, 1 маловідомий вид. */
export const PILOT = [
  'd7965a19-f9ae-467a-bc6e-da6c2c94fd75', // томат (еталон RULE-107)
  '2bf4bfe2-8f80-437f-b166-18092cddef69', // огірок
  'b6573b2b-a766-4ea6-90ff-b7cd1aaefc65', // перець
  '888215da-57f6-4e3d-ad32-1919d131f540', // полуниця
  '560f5e9c-354c-49ac-9709-5bba63c907a2', // яблуня
  '5d20761e-db52-43cb-b016-516213676ee4', // монстера — вираженого спокою немає
  'd7bff865-a337-480e-8382-4cc6c0333ce3', // сансев'єрія — зимове сповільнення
  '79ad5928-7990-4f3c-a5a5-52b225a2c895', // шлюмбергера — спокій перед цвітінням
  '16a62737-d3f9-4bf5-9161-b98e4d984da5', // гіпеаструм — виражений спокій
  'ffc0ba61-d6a6-4368-bcf1-e4b1ca9c342b', // сон український — маловідомий
]

/** Міста v1 (src/cities.ts) із Wikidata-ідентифікаторами для пошуку GeoNames ID. Зони — попередні (GEO-003). */
export const LEGACY_PLACES = [
  { cityId: 'kyiv', name: 'Київ', lat: 50.45, lon: 30.52, wikidata: 'Q1899', zone: 'forest-steppe', zoneNote: 'Попередньо: Лісостеп, межа з Поліссям' },
  { cityId: 'lviv', name: 'Львів', lat: 49.84, lon: 24.03, wikidata: 'Q36036', zone: 'forest-steppe', zoneNote: 'Попередньо: Західний Лісостеп' },
  { cityId: 'odesa', name: 'Одеса', lat: 46.48, lon: 30.73, wikidata: 'Q1874', zone: 'steppe', zoneNote: 'Попередньо: Степ' },
  { cityId: 'kharkiv', name: 'Харків', lat: 49.99, lon: 36.23, wikidata: 'Q42308', zone: 'forest-steppe', zoneNote: 'Попередньо: Лісостеп' },
  { cityId: 'dnipro', name: 'Дніпро', lat: 48.46, lon: 35.05, wikidata: 'Q48256', zone: 'steppe', zoneNote: 'Попередньо: Степ' },
]
