import { createContext, useContext, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, CloudRain, Download, Droplets, Droplet, Plus, Search, Sparkles, Thermometer, Trash2, Upload, Undo2, Pencil, Sprout, RefreshCw, WifiOff } from 'lucide-react'
import { CATALOG, CATEGORY_LABEL, catalogById } from './catalog'
import { CITIES, cityById } from './cities'
import { adviseFor, dayDiff, startOfDay, type Advice } from './advice'
import { buildBackup, defaultPlacement, parseBackup, shrinkImage, uid, useStore } from './store'
import { Confirm, PlantImage, Toast, fmtDate, fmtDateTime, go, plantName, relDay, useObjectUrl } from './ui'
import type { CareEvent, Category, Placement, UserPlant } from './types'
import type { WeatherData, WeatherStatus } from './weather'

export const WxCtx = createContext<{ status: WeatherStatus; data: WeatherData | null; reload(): void }>({ status: 'loading', data: null, reload() {} })

const PLACEMENT_LABEL: Record<Placement, string> = { indoor: 'У приміщенні', balcony: 'Балкон', outdoor: 'Відкритий ґрунт', greenhouse: 'Теплиця' }

function useAdvice() {
  const { plants, events, settings } = useStore()
  const wx = useContext(WxCtx)
  return useMemo(() => {
    const m = new Map<string, Advice>()
    for (const p of plants) m.set(p.id, adviseFor(p, events, wx.data, settings.mode))
    return m
  }, [plants, events, wx.data, settings.mode])
}

function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <header className="mb-5">
      <h1 className="font-display text-3xl font-bold leading-tight md:text-4xl">{children}</h1>
      {sub && <p className="mt-1 text-leaf-800/75">{sub}</p>}
    </header>
  )
}

function StatusChip({ a }: { a: Advice }) {
  const d = dayDiff(a.next, new Date())
  const cls = a.status === 'overdue' ? 'bg-clay/15 text-[#8f3f18]' : a.status === 'today' ? 'bg-leaf-700 text-white' : 'bg-leaf-100 text-leaf-800'
  const t = a.status === 'overdue' ? `Прострочено · ${relDay(d)}` : a.status === 'today' ? 'Перевірити сьогодні' : `Перевірка ${relDay(d)}`
  return <span className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${cls}`}>{t}</span>
}

/* ======================= Головна ======================= */
function WeatherCard() {
  const { status, data, reload } = useContext(WxCtx)
  const { settings, setCity } = useStore()
  const city = cityById(settings.selectedCityId)
  return (
    <section className="card bg-gradient-to-br from-leaf-700 to-leaf-800 p-5 text-white" aria-label="Погода">
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 font-semibold">
          <span className="sr-only">Населений пункт</span>
          <select aria-label="Населений пункт" value={city.id} onChange={(e) => setCity(e.target.value)} className="min-h-11 rounded-xl border-0 bg-white/15 px-3 font-display text-xl font-bold text-white">
            {CITIES.map((c) => <option key={c.id} value={c.id} className="text-black">{c.name}</option>)}
          </select>
        </label>
        <button onClick={reload} aria-label="Оновити погоду" className="grid size-11 place-items-center rounded-xl bg-white/15 hover:bg-white/25"><RefreshCw size={20} className={status === 'loading' ? 'animate-spin' : ''} /></button>
      </div>
      {status === 'loading' && <p className="mt-4" role="status">Завантажую погоду…</p>}
      {status === 'unavailable' && (
        <p className="mt-4 flex items-start gap-2" role="status"><WifiOff size={20} className="mt-0.5 shrink-0" /> Погода недоступна (немає мережі або сервіс не відповідає). Підказки працюють за загальними правилами без даних про погоду.</p>
      )}
      {data && (
        <>
          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-2xl bg-white/10 p-3"><Thermometer className="mx-auto" size={20} /><div className="text-2xl font-bold">{Math.round(data.temp)}°C</div><div className="text-xs opacity-80">температура</div></div>
            <div className="rounded-2xl bg-white/10 p-3"><CloudRain className="mx-auto" size={20} /><div className="text-2xl font-bold">{data.precipDaily[2] != null ? `${data.precipDaily[2].toFixed(1)} мм` : '—'}</div><div className="text-xs opacity-80">опади сьогодні</div></div>
            <div className="rounded-2xl bg-white/10 p-3"><Droplets className="mx-auto" size={20} /><div className="text-2xl font-bold">{data.humidity != null ? `${Math.round(data.humidity)}%` : '—'}</div><div className="text-xs opacity-80">вологість повітря</div></div>
          </div>
          <p className="mt-3 text-sm opacity-90">
            {status === 'cached' ? '⚠ Показано збережені дані (немає мережі). ' : 'Open-Meteo. '}
            Оновлено: {fmtDateTime(data.fetchedAt)}
          </p>
        </>
      )}
    </section>
  )
}

export function Home() {
  const { plants, loadDemo, addEvent, removeEvent } = useStore()
  const adv = useAdvice()
  const [toast, setToast] = useState<{ msg: string; undo?: () => void } | null>(null)
  const due = [...plants].map((p) => ({ p, a: adv.get(p.id)! })).filter((x) => x.a && x.a.status !== 'upcoming' || (x.a && dayDiff(x.a.next, new Date()) <= 2))
    .sort((x, y) => x.a.next.getTime() - y.a.next.getTime()).slice(0, 5)
  const counts = (Object.keys(CATEGORY_LABEL) as Category[]).map((c) => ({ c, n: plants.filter((p) => p.category === c).length }))

  async function check(p: UserPlant) {
    const ev = await addEvent(p.id, 'soil_checked')
    if (!ev) return
    setToast({ msg: `Ґрунт «${plantName(p)}» перевірено`, undo: () => { removeEvent(ev.id) } })
  }

  return (
    <div className="space-y-6">
      <PageTitle sub="Ваші рослини та найближчий догляд">Вітаю в саду 🌿</PageTitle>
      <WeatherCard />

      <button onClick={() => go('/plants/new')} className="btn btn-primary w-full text-lg" style={{ minHeight: 56 }}><Plus /> Додати рослину</button>

      {plants.length === 0 ? (
        <section className="card p-6 text-center">
          <Sprout className="mx-auto text-leaf-500" size={44} />
          <h2 className="mt-2 font-display text-xl font-bold">Колекція порожня</h2>
          <p className="mt-1 text-leaf-800/75">Додайте першу рослину або подивіться, як це працює, на демо-даних.</p>
          <button onClick={loadDemo} className="btn btn-soft mt-4">Завантажити демо-рослини</button>
        </section>
      ) : (
        <>
          <section aria-label="Огляд колекції" className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {counts.map(({ c, n }) => (
              <button key={c} onClick={() => go(`/plants?cat=${c}`)} className="card p-4 text-left hover:shadow-lg">
                <div className="text-3xl font-bold">{n}</div><div className="text-leaf-800/75">{CATEGORY_LABEL[c]}</div>
              </button>
            ))}
          </section>
          <section aria-labelledby="soon">
            <h2 id="soon" className="mb-3 font-display text-2xl font-bold">Найближчі завдання</h2>
            {due.length === 0 ? <p className="card p-5 text-leaf-800/75">Найближчими днями перевірок немає 🎉</p> : (
              <ul className="space-y-3">
                {due.map(({ p, a }) => (
                  <li key={p.id} className="card flex items-center gap-3 p-3">
                    <button onClick={() => go(`/plants/${p.id}`)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <PlantImage plant={p} className="size-16 shrink-0 rounded-2xl text-3xl" />
                      <span className="min-w-0"><span className="block truncate font-bold">{plantName(p)}</span><StatusChip a={a} /></span>
                    </button>
                    <button onClick={() => check(p)} className="btn btn-soft shrink-0" aria-label={`Перевірив ґрунт: ${plantName(p)}`}><CheckCircle2 size={20} /><span className="hidden sm:inline">Перевірив</span></button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
      {toast && <Toast msg={toast.msg} action={toast.undo ? { label: 'Скасувати', run: toast.undo } : undefined} onClose={() => setToast(null)} />}
    </div>
  )
}

/* ======================= Мої рослини ======================= */
export function PlantsPage({ query }: { query: URLSearchParams }) {
  const { plants } = useStore()
  const adv = useAdvice()
  const [cat, setCat] = useState<Category | 'all'>((query.get('cat') as Category) || 'all')
  const [q, setQ] = useState('')
  const list = plants.filter((p) => (cat === 'all' || p.category === cat) && plantName(p).toLowerCase().includes(q.trim().toLowerCase()))
  const tabs: { id: Category | 'all'; label: string }[] = [{ id: 'all', label: 'Усі' }, { id: 'indoor', label: 'Кімнатні' }, { id: 'garden', label: 'Сад' }, { id: 'vegetable', label: 'Город' }, { id: 'tree', label: 'Дерева й кущі' }]
  return (
    <div>
      <PageTitle sub={`${plants.length} рослин у колекції`}>Мої рослини</PageTitle>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-3.5 text-leaf-500" size={20} />
        <input aria-label="Пошук рослин" type="search" placeholder="Пошук за назвою" value={q} onChange={(e) => setQ(e.target.value)} className="field pl-10" />
      </div>
      <div role="tablist" aria-label="Категорії" className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={cat === t.id} onClick={() => setCat(t.id)}
            className={`btn shrink-0 ${cat === t.id ? 'btn-primary' : 'btn-soft'}`}>{t.label}</button>
        ))}
      </div>
      {list.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-leaf-800/75">{plants.length === 0 ? 'Тут поки порожньо.' : 'Нічого не знайдено за цими фільтрами.'}</p>
          <button onClick={() => go('/plants/new')} className="btn btn-primary mt-4"><Plus /> Додати рослину</button>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((p) => (
            <li key={p.id}>
              <button onClick={() => go(`/plants/${p.id}`)} className="card block w-full overflow-hidden text-left transition hover:shadow-lg">
                <PlantImage plant={p} className="h-40 w-full text-6xl" />
                <div className="space-y-2 p-4">
                  <div className="font-display text-xl font-bold">{plantName(p)}</div>
                  <div className="text-sm text-leaf-800/70">{CATEGORY_LABEL[p.category]} · {PLACEMENT_LABEL[p.placement]}</div>
                  {adv.get(p.id) && <StatusChip a={adv.get(p.id)!} />}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button onClick={() => go('/plants/new')} className="btn btn-primary fixed bottom-24 right-4 z-30 shadow-lg md:bottom-8 md:right-8" aria-label="Додати рослину"><Plus /> <span>Додати</span></button>
    </div>
  )
}

/* ======================= Форма ======================= */
export function PlantForm({ id }: { id?: string }) {
  const { plants, settings, setMode, addPlant, updatePlant } = useStore()
  const existing = id ? plants.find((p) => p.id === id) : undefined
  const [catalogId, setCatalogId] = useState(existing?.catalogId ?? '')
  const [category, setCategory] = useState<Category | 'all'>(existing?.category ?? 'all')
  const [search, setSearch] = useState('')
  const [customName, setCustomName] = useState(existing?.customName ?? '')
  const [placement, setPlacement] = useState<Placement>(existing?.placement ?? 'indoor')
  const [blob, setBlob] = useState<Blob | undefined>(existing?.imageBlob)
  const [lastWatered, setLastWatered] = useState('')
  const [soilType, setSoilType] = useState(existing?.soilType ?? '')
  const [sun, setSun] = useState(existing?.sunExposure ?? '')
  const [pot, setPot] = useState(existing?.potOrGround ?? '')
  const [err, setErr] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const camRef = useRef<HTMLInputElement>(null)
  const preview = useObjectUrl(blob)
  const today = new Date().toISOString().slice(0, 10)

  if (id && !existing) return <NotFound />

  const filtered = CATALOG.filter((c) => (category === 'all' || c.category === category) && c.commonNameUk.toLowerCase().includes(search.trim().toLowerCase()))

  function choose(cid: string) {
    setCatalogId(cid)
    const c = catalogById(cid)!
    if (!existing) setPlacement(defaultPlacement(c.category))
    setErr((e) => ({ ...e, catalog: '' }))
  }
  async function onFile(f?: File) {
    if (!f) return
    setBusy(true)
    try { setBlob(await shrinkImage(f)); setErr((e) => ({ ...e, photo: '' })) }
    catch (x) { setErr((e) => ({ ...e, photo: (x as Error).message })) }
    finally { setBusy(false) }
  }
  async function submit(ev: FormEvent) {
    ev.preventDefault()
    if (busy) return
    const e: Record<string, string> = {}
    if (!catalogId) e.catalog = 'Оберіть рослину зі списку.'
    if (customName.length > 40) e.name = 'Назва не довша за 40 символів.'
    if (lastWatered && lastWatered > today) e.date = 'Дата поливу не може бути в майбутньому.'
    setErr(e)
    if (Object.keys(e).length) return
    const c = catalogById(catalogId)!
    const p: UserPlant = {
      id: existing?.id ?? uid(), catalogId, customName: customName.trim() || undefined, category: c.category, placement,
      cityId: existing?.cityId ?? settings.selectedCityId, imageBlob: blob, addedAt: existing?.addedAt ?? new Date().toISOString(),
      soilType: (soilType || undefined) as UserPlant['soilType'], sunExposure: (sun || undefined) as UserPlant['sunExposure'], potOrGround: (pot || undefined) as UserPlant['potOrGround'],
    }
    const saved = existing ? await updatePlant(p) : await addPlant(p, lastWatered ? new Date(`${lastWatered}T12:00:00`).toISOString() : undefined)
    if (saved) go(`/plants/${p.id}`)
  }

  return (
    <form onSubmit={submit} noValidate className="mx-auto max-w-2xl space-y-6">
      <PageTitle>{existing ? 'Редагувати рослину' : 'Додати рослину'}</PageTitle>

      <fieldset className="card space-y-3 p-5">
        <legend className="px-1 font-display text-lg font-bold">1. Що це за рослина?</legend>
        <div className="flex items-center gap-2 rounded-xl bg-leaf-50 p-3 text-sm">
          <Sparkles size={18} className="shrink-0 text-leaf-600" />
          <span><b className="rounded-full bg-leaf-200 px-2 py-0.5">AI-розпізнавання — незабаром</b> Поки що оберіть рослину вручну з каталогу.</span>
        </div>
        <input aria-label="Пошук у каталозі" type="search" placeholder="Пошук у каталозі" className="field" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="flex flex-wrap gap-2" role="group" aria-label="Фільтр категорії">
          {(['all', 'indoor', 'garden', 'vegetable', 'tree'] as const).map((c) => (
            <button type="button" key={c} aria-pressed={category === c} onClick={() => setCategory(c)} className={`btn min-h-10 text-sm ${category === c ? 'btn-primary' : 'btn-soft'}`}>{c === 'all' ? 'Усі' : CATEGORY_LABEL[c]}</button>
          ))}
        </div>
        <div role="radiogroup" aria-label="Каталог рослин" aria-describedby={err.catalog ? 'e-cat' : undefined} className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto">
          {filtered.map((c) => (
            <button type="button" role="radio" aria-checked={catalogId === c.id} key={c.id} onClick={() => choose(c.id)}
              className={`flex min-h-14 items-center gap-2 rounded-2xl border-2 p-2 text-left ${catalogId === c.id ? 'border-leaf-700 bg-leaf-50' : 'border-transparent bg-cream'}`}>
              <span className="text-2xl" aria-hidden>{c.emoji}</span><span className="text-sm font-semibold">{c.commonNameUk}</span>
            </button>
          ))}
          {filtered.length === 0 && <p className="col-span-2 p-3 text-leaf-800/70">Нічого не знайдено.</p>}
        </div>
        {err.catalog && <p id="e-cat" role="alert" className="font-semibold text-[#a63a1d]">{err.catalog}</p>}
      </fieldset>

      <fieldset className="card space-y-4 p-5">
        <legend className="px-1 font-display text-lg font-bold">2. Деталі</legend>
        <div>
          <label className="label" htmlFor="cn">Своя назва (необов’язково)</label>
          <input id="cn" className="field" value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Напр. «Монстера у вітальні»" aria-invalid={!!err.name} />
          {err.name && <p role="alert" className="mt-1 text-[#a63a1d]">{err.name}</p>}
        </div>
        <div>
          <label className="label" htmlFor="pl">Де росте</label>
          <select id="pl" className="field" value={placement} onChange={(e) => setPlacement(e.target.value as Placement)}>
            {(Object.keys(PLACEMENT_LABEL) as Placement[]).map((k) => <option key={k} value={k}>{PLACEMENT_LABEL[k]}</option>)}
          </select>
        </div>
        {!existing && (
          <div>
            <label className="label" htmlFor="lw">Дата останнього поливу (необов’язково)</label>
            <input id="lw" type="date" max={today} className="field" value={lastWatered} onChange={(e) => setLastWatered(e.target.value)} aria-invalid={!!err.date} />
            {err.date && <p role="alert" className="mt-1 text-[#a63a1d]">{err.date}</p>}
          </div>
        )}
        <div>
          <span className="label">Фото (необов’язково)</span>
          <div className="flex items-center gap-3">
            {preview ? <img src={preview} alt="Попередній перегляд" className="size-20 rounded-2xl object-cover" /> : <div className="grid size-20 place-items-center rounded-2xl bg-leaf-50 text-3xl" aria-hidden>📷</div>}
            <div className="flex flex-col gap-2">
              <input ref={fileRef} type="file" accept="image/*" className="sr-only" id="photo-file" disabled={busy} onChange={(e) => onFile(e.target.files?.[0])} />
              <input ref={camRef} type="file" accept="image/*" capture="environment" className="sr-only" id="photo-cam" disabled={busy} onChange={(e) => onFile(e.target.files?.[0])} />
              <label htmlFor="photo-cam" className="btn btn-primary cursor-pointer">{busy ? 'Обробка…' : '📷 Сфотографувати'}</label>
              <label htmlFor="photo-file" className="btn btn-soft cursor-pointer">{busy ? 'Обробка…' : blob ? 'Змінити з галереї / файлу' : '🖼 Завантажити з галереї / файлу'}</label>
              {blob && <button type="button" className="text-sm font-semibold underline" onClick={() => { setBlob(undefined); if (fileRef.current) fileRef.current.value = ''; if (camRef.current) camRef.current.value = '' }}>Прибрати фото</button>}
            </div>
          </div>
          <p className="mt-1 text-sm text-leaf-800/70">Фото лишається на вашому пристрої й зменшується до 800 px. Воно не використовується для розпізнавання.</p>
          {err.photo && <p role="alert" className="mt-1 text-[#a63a1d]">{err.photo}</p>}
        </div>
      </fieldset>

      <fieldset className="card space-y-4 p-5">
        <legend className="px-1 font-display text-lg font-bold">3. Режим</legend>
        <div role="radiogroup" aria-label="Режим використання" className="grid grid-cols-2 gap-2">
          {(['simple', 'smart'] as const).map((m) => (
            <button type="button" role="radio" aria-checked={settings.mode === m} key={m} onClick={() => setMode(m)}
              className={`btn ${settings.mode === m ? 'btn-primary' : 'btn-soft'}`}>{m === 'simple' ? 'Простий' : 'Розумний'}</button>
          ))}
        </div>
        {settings.mode === 'smart' && (
          <div className="grid gap-4 sm:grid-cols-3">
            <div><label className="label" htmlFor="pg">Горщик / ґрунт</label>
              <select id="pg" className="field" value={pot} onChange={(e) => setPot(e.target.value as typeof pot)}><option value="">Не вказано</option><option value="pot">Горщик</option><option value="ground">Відкритий ґрунт</option></select></div>
            <div><label className="label" htmlFor="sx">Сонячність</label>
              <select id="sx" className="field" value={sun} onChange={(e) => setSun(e.target.value as typeof sun)}><option value="">Не вказано</option><option value="shade">Тінь</option><option value="partial">Півтінь</option><option value="sun">Сонце</option></select></div>
            <div><label className="label" htmlFor="st">Тип ґрунту</label>
              <select id="st" className="field" value={soilType} onChange={(e) => setSoilType(e.target.value as typeof soilType)}><option value="">Не вказано</option><option value="sandy">Піщаний</option><option value="loam">Суглинок</option><option value="clay">Глинистий</option></select></div>
          </div>
        )}
        {settings.mode === 'simple' && <p className="text-sm text-leaf-800/70">Простий режим — мінімум полів. Перемкніть на «Розумний», щоб уточнити умови.</p>}
      </fieldset>

      <div className="flex gap-3">
        <button type="button" className="btn btn-soft flex-1" onClick={() => history.back()}>Скасувати</button>
        <button type="submit" disabled={busy} className="btn btn-primary flex-[2] disabled:cursor-wait disabled:opacity-60">{existing ? 'Зберегти' : 'Додати рослину'}</button>
      </div>
    </form>
  )
}

function NotFound() {
  return (
    <div className="card p-8 text-center">
      <h1 className="font-display text-2xl font-bold">Рослину не знайдено</h1>
      <button className="btn btn-primary mt-4" onClick={() => go('/plants')}>До колекції</button>
    </div>
  )
}

/* ======================= Деталі ======================= */
export function PlantDetail({ id }: { id: string }) {
  const { plants, events, settings, addEvent, removeEvent, removePlant } = useStore()
  const adv = useAdvice()
  const plant = plants.find((p) => p.id === id)
  const [confirm, setConfirm] = useState(false)
  const [asking, setAsking] = useState(false)
  const [toast, setToast] = useState<{ msg: string; undo(): void } | null>(null)
  if (!plant) return <NotFound />
  const c = catalogById(plant.catalogId)
  const a = adv.get(plant.id)!
  const hist = events.filter((e) => e.plantId === id).sort((x, y) => y.timestamp.localeCompare(x.timestamp))

  async function log(type: 'watered' | 'soil_checked', moisture?: CareEvent['moisture']) {
    setAsking(false)
    const ev = await addEvent(id, type, undefined, moisture)
    if (!ev) return
    setToast({ msg: type === 'watered' ? 'Полив записано' : 'Перевірку ґрунту записано', undo: () => { removeEvent(ev.id) } })
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <button onClick={() => go('/plants')} className="font-semibold underline">← Мої рослини</button>
      <div className="card overflow-hidden">
        <PlantImage plant={plant} className="h-56 w-full text-8xl md:h-72" />
        <div className="space-y-2 p-5">
          <h1 className="font-display text-3xl font-bold">{plantName(plant)}</h1>
          <p className="text-leaf-800/75">{c?.commonNameUk} · {CATEGORY_LABEL[plant.category]} · {PLACEMENT_LABEL[plant.placement]} · {cityById(plant.cityId).name}</p>
          <div className="flex gap-2 pt-2">
            <button className="btn btn-soft" onClick={() => go(`/plants/${id}/edit`)}><Pencil size={18} /> Редагувати</button>
            <button className="btn btn-danger" onClick={() => setConfirm(true)}><Trash2 size={18} /> Видалити</button>
          </div>
        </div>
      </div>

      <section className="card space-y-3 p-5" aria-labelledby="chk">
        <h2 id="chk" className="font-display text-xl font-bold">Перевірте вологість ґрунту</h2>
        <StatusChip a={a} />
        <p>Орієнтовна наступна перевірка: <b>{fmtDate(a.next)}</b> <span className="text-leaf-800/70">(інтервал ≈ {a.intervalDays} дн.)</span></p>
        <details open>
          <summary className="cursor-pointer font-semibold">Чому така підказка?</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-leaf-800/85">{a.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
        </details>
        <p className="rounded-xl bg-leaf-50 p-3 text-sm">Це орієнтир, а не гарантія. Торкніться ґрунту на глибину 2–3 см: поливайте лише якщо він сухий.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <button className="btn btn-primary" onClick={() => log('watered')}><Droplet size={20} /> Полив виконано</button>
          <button className="btn btn-soft" aria-expanded={settings.mode === 'smart' ? asking : undefined} onClick={() => (settings.mode === 'smart' ? setAsking((x) => !x) : log('soil_checked'))}><CheckCircle2 size={20} /> Перевірив ґрунт</button>
        </div>
        {asking && (
          <div role="group" aria-label="Оцінка вологості ґрунту" className="space-y-2 rounded-2xl bg-leaf-50 p-3">
            <p className="font-semibold">Який ґрунт на дотик? (необов’язково)</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <button className="btn btn-soft" onClick={() => log('soil_checked', 'dry')}>Сухий</button>
              <button className="btn btn-soft" onClick={() => log('soil_checked', 'moist')}>Вологий</button>
              <button className="btn btn-soft" onClick={() => log('soil_checked', 'wet')}>Мокрий</button>
              <button className="btn btn-soft" onClick={() => log('soil_checked')}>Без оцінки</button>
            </div>
          </div>
        )}
      </section>

      {c && (
        <section className="card space-y-2 p-5" aria-labelledby="cond">
          <h2 id="cond" className="font-display text-xl font-bold">Умови (загальні, демо)</h2>
          <p>{c.careSummary}</p>
          <dl className="grid gap-2 text-sm sm:grid-cols-3">
            <div><dt className="font-bold">☀️ Світло</dt><dd>{c.lightHint}</dd></div>
            <div><dt className="font-bold">🪴 Ґрунт</dt><dd>{c.soilHint}</dd></div>
            <div><dt className="font-bold">💧 Полив</dt><dd>{c.wateringHint}</dd></div>
          </dl>
        </section>
      )}

      <section className="card p-5" aria-labelledby="hist">
        <h2 id="hist" className="mb-3 font-display text-xl font-bold">Журнал догляду</h2>
        {hist.length === 0 ? <p className="text-leaf-800/70">Записів ще немає.</p> : (
          <ul className="divide-y divide-leaf-100">
            {hist.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                <span>{e.type === 'watered' ? '💧 Полив' : '👆 Перевірка ґрунту'}{e.moisture && ` (${{ dry: 'сухий', moist: 'вологий', wet: 'мокрий' }[e.moisture]})`} · {fmtDateTime(e.timestamp)}{e.note && <span className="text-leaf-800/60"> · {e.note}</span>}</span>
                <button className="btn btn-soft min-h-10 text-sm" onClick={() => removeEvent(e.id)} aria-label={`Скасувати запис ${fmtDateTime(e.timestamp)}`}><Undo2 size={16} /> Скасувати</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {confirm && (
        <Confirm title="Видалити рослину?" confirmLabel="Видалити" danger onNo={() => setConfirm(false)} onYes={async () => { await removePlant(id); go('/plants') }}>
          «{plantName(plant)}» та її журнал буде видалено з цього пристрою.
        </Confirm>
      )}
      {toast && <Toast msg={toast.msg} action={{ label: 'Скасувати', run: toast.undo }} onClose={() => setToast(null)} />}
    </div>
  )
}

/* ======================= Календар ======================= */
export function CalendarPage() {
  const { plants, events, addEvent } = useStore()
  const adv = useAdvice()
  const items = plants.map((p) => ({ p, a: adv.get(p.id)! })).filter((x) => x.a).sort((x, y) => x.a.next.getTime() - y.a.next.getTime())
  const now = new Date()
  const todayList = items.filter((x) => x.a.status !== 'upcoming')
  const week = items.filter((x) => { const d = dayDiff(x.a.next, now); return d > 0 && d <= 7 })
  const later = items.filter((x) => dayDiff(x.a.next, now) > 7)
  const doneToday = events.filter((e) => startOfDay(new Date(e.timestamp)).getTime() === startOfDay(now).getTime())

  const Row = ({ p, a, actionable }: { p: UserPlant; a: Advice; actionable?: boolean }) => (
    <li className="card flex items-center gap-3 p-3">
      <button onClick={() => go(`/plants/${p.id}`)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <PlantImage plant={p} className="size-14 shrink-0 rounded-2xl text-2xl" />
        <span className="min-w-0"><span className="block truncate font-bold">{plantName(p)}</span><span className="text-sm text-leaf-800/70">{fmtDate(a.next)}</span> <StatusChip a={a} /></span>
      </button>
      {actionable && <button className="btn btn-primary shrink-0" onClick={() => addEvent(p.id, 'soil_checked')} aria-label={`Позначити виконаним: ${plantName(p)}`}><CheckCircle2 size={20} /><span className="hidden sm:inline">Виконано</span></button>}
    </li>
  )
  const Section = ({ title, list, actionable }: { title: string; list: typeof items; actionable?: boolean }) => list.length === 0 ? null : (
    <section><h2 className="mb-3 font-display text-2xl font-bold">{title}</h2><ul className="space-y-3">{list.map((x) => <Row key={x.p.id} {...x} actionable={actionable} />)}</ul></section>
  )
  const name = (id: string) => { const p = plants.find((x) => x.id === id); return p ? plantName(p) : '—' }

  return (
    <div className="space-y-6">
      <PageTitle sub="Завдання — це перевірка вологості ґрунту, а не обов’язковий полив">Календар</PageTitle>
      {plants.length === 0 && <p className="card p-6 text-center text-leaf-800/75">Додайте рослини, щоб побачити завдання.</p>}
      {plants.length > 0 && todayList.length === 0 && <p className="card p-5">На сьогодні завдань немає 🎉</p>}
      <Section title="Сьогодні та прострочені" list={todayList} actionable />
      <Section title="Найближчі 7 днів" list={week} />
      <Section title="Пізніше" list={later} />
      {doneToday.length > 0 && (
        <section><h2 className="mb-3 font-display text-2xl font-bold">Виконано сьогодні</h2>
          <ul className="space-y-2">{doneToday.map((e) => <li key={e.id} className="card flex items-center gap-2 p-3"><CheckCircle2 className="text-leaf-600" size={20} /> {name(e.plantId)} — {e.type === 'watered' ? 'полив' : 'ґрунт перевірено'}, {fmtDateTime(e.timestamp)}</li>)}</ul>
        </section>
      )}
    </div>
  )
}

/* ======================= Налаштування ======================= */
export function SettingsPage() {
  const { plants, events, settings, setCity, setMode, replaceAll, loadDemo } = useStore()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, setPending] = useState<ReturnType<typeof parseBackup> | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function exportData() {
    const text = await buildBackup(plants, events, settings)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    a.download = `plant-care-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click(); URL.revokeObjectURL(a.href)
    setMsg({ ok: true, text: `Експортовано: ${plants.length} рослин, ${events.length} записів журналу (з фото).` })
  }
  async function onImport(f?: File) {
    if (!f) return
    try {
      if (f.size > 50 * 1024 * 1024) throw new Error('Файл завеликий.')
      setPending(parseBackup(await f.text())); setMsg(null)
    } catch (x) { setMsg({ ok: false, text: `Імпорт скасовано: ${(x as Error).message} Ваші дані не змінено.` }) }
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageTitle>Налаштування</PageTitle>
      <section className="card space-y-3 p-5">
        <h2 className="font-display text-xl font-bold">Населений пункт</h2>
        <label className="label" htmlFor="city">Місто для погоди</label>
        <select id="city" className="field" value={settings.selectedCityId} onChange={(e) => setCity(e.target.value)}>
          {CITIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <p className="text-sm text-leaf-800/70">Координати задані наперед, геолокація не потрібна.</p>
        <h2 className="pt-2 font-display text-xl font-bold">Режим</h2>
        <div role="radiogroup" aria-label="Режим" className="grid grid-cols-2 gap-2">
          {(['simple', 'smart'] as const).map((m) => (
            <button key={m} role="radio" aria-checked={settings.mode === m} onClick={() => setMode(m)} className={`btn ${settings.mode === m ? 'btn-primary' : 'btn-soft'}`}>{m === 'simple' ? 'Простий' : 'Розумний'}</button>
          ))}
        </div>
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="font-display text-xl font-bold">Резервна копія</h2>
        <p className="text-sm text-leaf-800/75">Усі дані зберігаються лише на цьому пристрої. Копія містить рослини, журнал, налаштування та зменшені фото.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <button className="btn btn-soft" onClick={exportData}><Download size={20} /> Експорт у JSON</button>
          <label className="btn btn-soft cursor-pointer" htmlFor="imp"><Upload size={20} /> Імпорт з JSON</label>
          <input id="imp" ref={fileRef} type="file" accept="application/json,.json" className="sr-only" onChange={(e) => onImport(e.target.files?.[0])} />
        </div>
        {msg && <p role="alert" className={`flex items-start gap-2 rounded-xl p-3 ${msg.ok ? 'bg-leaf-50' : 'bg-clay/15 text-[#8f3f18]'}`}>{msg.ok ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />} {msg.text}</p>}
        <button className="btn btn-soft w-full" onClick={loadDemo}>Додати демо-рослини</button>
      </section>

      <section className="card space-y-2 p-5">
        <h2 className="font-display text-xl font-bold">Про застосунок</h2>
        <p>Жоржина Рудрігес · версія <span data-testid="app-version">{__APP_VERSION__}</span></p>
      </section>

      <section className="card space-y-2 p-5">
        <h2 className="font-display text-xl font-bold">Як працюють підказки</h2>
        <ul className="list-disc space-y-1 pl-5 text-leaf-800/85">
          <li>Це прототип, а не агрономічний сервіс: інтервали — загальні демо-значення.</li>
          <li>Ми показуємо <b>орієнтовний час перевірки вологості ґрунту</b>, а не обов’язковий полив і не кількість води.</li>
          <li>Для кімнатних рослин погода майже не враховується.</li>
          <li>Для вуличних: спека скорочує інтервал, а нещодавні або очікувані опади (від 5 мм) подовжують його.</li>
          <li>У «Розумному» режимі додатково враховуються горщик, сонячність і тип ґрунту, якщо вказані, а також ваша ручна оцінка вологості при перевірці (вона перекриває розрахунок до наступного запису).</li>
          <li>Погода — Open-Meteo без ключа. Без мережі показуємо збережені дані або працюємо без погоди.</li>
          <li>AI-розпізнавання фото поки не підключене: оберіть рослину вручну.</li>
        </ul>
      </section>

      {pending && (
        <Confirm title="Замінити поточні дані?" confirmLabel="Замінити" danger onNo={() => setPending(null)}
          onYes={async () => { const ok = await replaceAll(pending.plants, pending.events, pending.settings); if (ok) setMsg({ ok: true, text: `Імпортовано: ${pending.plants.length} рослин, ${pending.events.length} записів.` }); setPending(null) }}>
          У файлі: {pending.plants.length} рослин, {pending.events.length} записів журналу. Поточна колекція ({plants.length} рослин) буде повністю замінена.
        </Confirm>
      )}
    </div>
  )
}
