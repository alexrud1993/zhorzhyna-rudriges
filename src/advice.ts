import { catalogById } from './catalog'
import type { CareEvent, Mode, UserPlant } from './types'
import type { WeatherData } from './weather'

export interface Advice {
  next: Date
  status: 'overdue' | 'today' | 'upcoming'
  priority: 'high' | 'normal' | 'low'
  intervalDays: number
  reasons: string[]
  lastCare: Date
}

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
export const dayDiff = (a: Date, b: Date) => Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86400000)
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }

/** Детермінований шаблон: орієнтовний час ПЕРЕВІРКИ вологості ґрунту, не гарантований полив. */
export function adviseFor(plant: UserPlant, events: CareEvent[], weather: WeatherData | null, mode: Mode, now = new Date()): Advice {
  const cat = catalogById(plant.catalogId)
  let interval = cat?.checkEveryDays ?? 7
  const reasons = [`Базовий загальний інтервал для «${cat?.commonNameUk ?? 'рослини'}» — приблизно ${interval} дн. (демо-значення).`]
  let priority: Advice['priority'] = 'normal'

  const mine = events.filter((e) => e.plantId === plant.id).map((e) => new Date(e.timestamp).getTime())
  const lastCare = new Date(mine.length ? Math.max(...mine) : new Date(plant.addedAt).getTime())
  reasons.push(mine.length ? `Відлік від останнього догляду: ${lastCare.toLocaleDateString('uk-UA')}.` : 'Записів догляду ще немає — відлік від дати додавання.')

  if (plant.potOrGround === 'pot') { interval -= 1; reasons.push('Горщик швидше підсихає → інтервал трохи коротший.') }
  if (plant.sunExposure === 'sun') { interval -= 1; reasons.push('Сонячне місце → ґрунт підсихає швидше.') }
  if (plant.sunExposure === 'shade') { interval += 1; reasons.push('Тінь → ґрунт підсихає повільніше.') }
  if (plant.soilType === 'sandy') { interval -= 1; reasons.push('Піщаний ґрунт погано тримає воду.') }
  if (plant.soilType === 'clay') { interval += 1; reasons.push('Глинистий ґрунт довше тримає вологу.') }
  if (mode === 'simple' && (plant.potOrGround || plant.sunExposure || plant.soilType)) reasons.push('Додаткові поля враховано, бо вони заповнені.')

  const outdoors = plant.placement !== 'indoor'
  if (!outdoors) {
    reasons.push('Рослина в приміщенні — погода надворі майже не впливає.')
  } else if (!weather) {
    reasons.push('Дані про погоду недоступні — використано лише загальні правила.')
  } else {
    const known = (xs: (number | null)[]) => xs.filter((v): v is number => v !== null)
    const recent = known(weather.precipDaily.slice(0, 3))
    const soon = known(weather.precipDaily.slice(3))
    const rainRecent = recent.reduce((a, b) => a + b, 0)
    const rainSoon = soon.reduce((a, b) => a + b, 0)
    if (recent.length < 3) reasons.push('Дані про опади за останні дні неповні — їх не враховано повністю.')
    if (plant.placement !== 'greenhouse' && rainRecent >= 5) { interval += 2; reasons.push(`За останні дні було ~${rainRecent.toFixed(1)} мм опадів → перевірка може зачекати.`) }
    if (plant.placement !== 'greenhouse' && rainSoon >= 5) { interval += 1; reasons.push(`Очікується ~${rainSoon.toFixed(1)} мм опадів → можна зачекати.`) }
    if (weather.tmaxToday === null) reasons.push('Немає даних про максимальну температуру сьогодні — спеку не враховано.')
    else if (weather.tmaxToday >= 32) { interval -= 2; priority = 'high'; reasons.push(`Сьогодні до ${Math.round(weather.tmaxToday)}°C → спека, перевіряйте ґрунт раніше.`) }
    else if (weather.tmaxToday >= 28) { interval -= 1; priority = 'high'; reasons.push(`Сьогодні до ${Math.round(weather.tmaxToday)}°C → тепло, ґрунт підсихає швидше.`) }
  }
  const lastEv = events.filter((e) => e.plantId === plant.id).sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0]
  if (lastEv?.type === 'soil_checked' && lastEv.moisture === 'dry') { interval = 1; reasons.push('Ви оцінили ґрунт як сухий → перевірте ще раз наступного дня (ваша оцінка перекриває розрахунок).') }
  else if (lastEv?.type === 'soil_checked' && lastEv.moisture === 'wet') { interval += 2; reasons.push('Ви оцінили ґрунт як мокрий → наступну перевірку відкладено.') }
  else if (lastEv?.type === 'soil_checked' && lastEv.moisture === 'moist') reasons.push('Ви оцінили ґрунт як помірно вологий → застосовано звичайний інтервал.')
  interval = Math.max(1, interval)
  const next = addDays(startOfDay(lastCare), interval)
  const d = dayDiff(next, now)
  const status = d < 0 ? 'overdue' : d === 0 ? 'today' : 'upcoming'
  if (status === 'upcoming' && priority !== 'high') priority = d > 3 ? 'low' : 'normal'
  if (status === 'overdue') priority = 'high'
  return { next, status, priority, intervalDays: interval, reasons, lastCare }
}
