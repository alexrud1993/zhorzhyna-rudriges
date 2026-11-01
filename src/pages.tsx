import { createContext, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { AlertTriangle, Camera, CheckCircle2, CloudRain, Download, Droplets, Droplet, ImageIcon, Loader2, Plus, Search, Sparkles, Thermometer, Trash2, Upload, Undo2, Pencil, Sprout, RefreshCw, WifiOff } from 'lucide-react'
import { CATALOG, CATEGORY_LABEL, catalogById } from './catalog'
import { CITIES, cityById } from './cities'
import { adviseFor, dayDiff, startOfDay, type Advice } from './advice'
import { buildBackup, defaultPlacement, parseBackup, shrinkImage, uid, useStore } from './store'
import { Confirm, PlantImage, Toast, fmtDate, fmtDateTime, go, localISODate, plantName, relDay, useObjectUrl } from './ui'
import { useCapture, peekIdentifyPhoto, clearIdentifyPhoto, setFormDraft, peekFormDraft, clearFormDraft } from './capture'
import { IdentifyError, remoteProvider, type Organ, type Suggestion } from './providers'
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

/* ======================= Розпізнавання: блок на головній ======================= */
function IdentifyHero() {
  const { openCamera, openGallery } = useCapture()
  return (
    <section className="card border-2 border-leaf-200 p-5" aria-labelledby="idh">
      <div className="flex items-start gap-4">
        <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-leaf-700 text-white" aria-hidden><Camera size={28} /></div>
        <div>
          <h2 id="idh" className="font-display text-xl font-bold leading-tight">Розпізнати рослину за фото</h2>
          <p className="mt-1 text-sm text-leaf-800/80">
            {remoteProvider.available
              ? 'Сфотографуйте листок або квітку — запропонуємо варіанти та створимо картку рослини.'
              : 'Сфотографуйте рослину — фото одразу потрапить у картку. Автоматичне розпізнавання ще не підключено, вид оберете зі списку.'}
          </p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button className="btn btn-primary" onClick={openCamera}><Camera size={20} /> Камера</button>
        <button className="btn btn-soft" onClick={openGallery}><ImageIcon size={20} /> Галерея</button>
      </div>
    </section>
  )
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
            <div className="rounded-2xl bg-white/10 p-3"><Thermometer className="mx-auto" size={20} /><div className="whitespace-nowrap text-xl font-bold sm:text-2xl">{Math.round(data.temp)}°C</div><div className="text-xs leading-tight opacity-80">температура</div></div>
            <div className="rounded-2xl bg-white/10 p-3"><CloudRain className="mx-auto" size={20} /><div className="whitespace-nowrap text-xl font-bold sm:text-2xl">{data.precipDaily[2] != null ? `${data.precipDaily[2].toFixed(1)} мм` : '—'}</div><div className="text-xs leading-tight opacity-80">опади сьогодні</div></div>
            <div className="rounded-2xl bg-white/10 p-3"><Droplets className="mx-auto" size={20} /><div className="whitespace-nowrap text-xl font-bold sm:text-2xl">{data.humidity != null ? `${Math.round(data.humidity)}%` : '—'}</div><div className="text-xs leading-tight opacity-80">вологість повітря</div></div>
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
      <IdentifyHero />
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
  const { openCamera } = useCapture()
  // Чернетка з екрана розпізнавання (фото, запропонована рослина)
  const [draft] = useState(() => (id ? null : peekFormDraft()))
  useEffect(() => { clearFormDraft() }, [])
  const draftEntry = draft?.catalogId ? catalogById(draft.catalogId) : undefined
  const [catalogId, setCatalogId] = useState(existing?.catalogId ?? draft?.catalogId ?? '')
  const [category, setCategory] = useState<Category | 'all'>(existing?.category ?? 'all')
  const [onlyGeneric, setOnlyGeneric] = useState(!!draft?.needsCategory)
  const [search, setSearch] = useState('')
  const [customName, setCustomName] = useState(existing?.customName ?? draft?.customName ?? '')
  const [placement, setPlacement] = useState<Placement>(existing?.placement ?? (draftEntry ? defaultPlacement(draftEntry.category) : 'indoor'))
  const [blob, setBlob] = useState<Blob | undefined>(existing?.imageBlob ?? draft?.photo)
  const scientificName = existing?.scientificName ?? draft?.scientificName
  const [lastWatered, setLastWatered] = useState('')
  const [soilType, setSoilType] = useState(existing?.soilType ?? '')
  const [sun, setSun] = useState(existing?.sunExposure ?? '')
  const [pot, setPot] = useState(existing?.potOrGround ?? '')
  const [err, setErr] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const camRef = useRef<HTMLInputElement>(null)
  const preview = useObjectUrl(blob)
  const today = localISODate(new Date())

  if (id && !existing) return <NotFound />

  const filtered = CATALOG.filter((c) => (!onlyGeneric || c.generic) && (category === 'all' || c.category === category) && c.commonNameUk.toLowerCase().includes(search.trim().toLowerCase()))

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
      cityId: existing?.cityId ?? settings.selectedCityId, imageBlob: blob, addedAt: existing?.addedAt ?? new Date().toISOString(), scientificName,
      soilType: (soilType || undefined) as UserPlant['soilType'], sunExposure: (sun || undefined) as UserPlant['sunExposure'], potOrGround: (pot || undefined) as UserPlant['potOrGround'],
    }
    // Полив «сьогодні» записуємо поточним часом, інші дні — локальним полуднем (не в майбутньому)
    const wateredAt = !lastWatered ? undefined : lastWatered === today ? new Date().toISOString() : new Date(`${lastWatered}T12:00:00`).toISOString()
    const saved = existing ? await updatePlant(p) : await addPlant(p, wateredAt)
    if (saved) go(`/plants/${p.id}`)
  }

  return (
    <form onSubmit={submit} noValidate className="mx-auto max-w-2xl space-y-6">
      <PageTitle>{existing ? 'Редагувати рослину' : 'Додати рослину'}</PageTitle>

      <fieldset className="card space-y-3 p-5">
        <legend className="px-1 font-display text-lg font-bold">1. Що це за рослина?</legend>
        {draft?.scientificName ? (
          <div role="status" className="flex items-start gap-2 rounded-xl bg-leaf-50 p-3 text-sm">
            <Sparkles size={18} className="mt-0.5 shrink-0 text-leaf-600" />
            <span>За фото запропоновано: <i>{draft.scientificName}</i>. {draft.needsCategory ? 'Цього виду немає в демо-каталозі — оберіть тип «Інша …», щоб отримати загальні підказки.' : 'Перевірте вибір нижче.'}</span>
          </div>
        ) : !existing && (
          <button type="button" onClick={openCamera} className="btn btn-soft w-full"><Camera size={20} /> Розпізнати за фото</button>
        )}
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
        {onlyGeneric && <button type="button" className="text-sm font-semibold underline" onClick={() => setOnlyGeneric(false)}>Показати весь каталог</button>}
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
              <input ref={fileRef} type="file" accept="image/*" className="sr-only" id="photo-file" tabIndex={-1} aria-hidden disabled={busy} onChange={(e) => onFile(e.target.files?.[0])} />
              <input ref={camRef} type="file" accept="image/*" capture="environment" className="sr-only" id="photo-cam" tabIndex={-1} aria-hidden disabled={busy} onChange={(e) => onFile(e.target.files?.[0])} />
              <button type="button" disabled={busy} onClick={() => camRef.current?.click()} className="btn btn-primary">{busy ? 'Обробка…' : '📷 Сфотографувати'}</button>
              <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="btn btn-soft">{busy ? 'Обробка…' : blob ? 'Змінити з галереї / файлу' : '🖼 Завантажити з галереї / файлу'}</button>
              {blob && <button type="button" className="text-sm font-semibold underline" onClick={() => { setBlob(undefined); if (fileRef.current) fileRef.current.value = ''; if (camRef.current) camRef.current.value = '' }}>Прибрати фото</button>}
            </div>
          </div>
          <p className="mt-1 text-sm text-leaf-800/70">Фото зберігається лише на цьому пристрої й зменшується до 800 px.</p>
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
          {plant.scientificName && <p className="italic text-leaf-800/80">{plant.scientificName}</p>}
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
  const { plants, events, addEvent, removeEvent } = useStore()
  const adv = useAdvice()
  const [toast, setToast] = useState<{ msg: string; undo(): void } | null>(null)
  async function done(p: UserPlant) {
    const ev = await addEvent(p.id, 'soil_checked')
    if (ev) setToast({ msg: `Ґрунт «${plantName(p)}» перевірено`, undo: () => { removeEvent(ev.id) } })
  }
  const items = plants.map((p) => ({ p, a: adv.get(p.id)! })).filter((x) => x.a).sort((x, y) => x.a.next.getTime() - y.a.next.getTime())
  const now = new Date()
  const todayList = items.filter((x) => x.a.status !== 'upcoming')
  const week = items.filter((x) => { const d = dayDiff(x.a.next, now); return d > 0 && d <= 7 })
  const later = items.filter((x) => dayDiff(x.a.next, now) > 7)
  const doneToday = events.filter((e) => startOfDay(new Date(e.timestamp)).getTime() === startOfDay(now).getTime())

  const name = (id: string) => { const p = plants.find((x) => x.id === id); return p ? plantName(p) : '—' }

  return (
    <div className="space-y-6">
      <PageTitle sub="Завдання — це перевірка вологості ґрунту, а не обов’язковий полив">Календар</PageTitle>
      {plants.length === 0 && <p className="card p-6 text-center text-leaf-800/75">Додайте рослини, щоб побачити завдання.</p>}
      {plants.length > 0 && todayList.length === 0 && <p className="card p-5">На сьогодні завдань немає 🎉</p>}
      <CalSection title="Сьогодні та прострочені" list={todayList} onDone={done} />
      <CalSection title="Найближчі 7 днів" list={week} />
      <CalSection title="Пізніше" list={later} />
      {doneToday.length > 0 && (
        <section><h2 className="mb-3 font-display text-2xl font-bold">Виконано сьогодні</h2>
          <ul className="space-y-2">{doneToday.map((e) => <li key={e.id} className="card flex items-center gap-2 p-3"><CheckCircle2 className="text-leaf-600" size={20} /> {name(e.plantId)} — {e.type === 'watered' ? 'полив' : 'ґрунт перевірено'}, {fmtDateTime(e.timestamp)}</li>)}</ul>
        </section>
      )}
      {toast && <Toast msg={toast.msg} action={{ label: 'Скасувати', run: toast.undo }} onClose={() => setToast(null)} />}
    </div>
  )
}

function CalSection({ title, list, onDone }: { title: string; list: { p: UserPlant; a: Advice }[]; onDone?: (p: UserPlant) => void }) {
  if (list.length === 0) return null
  return (
    <section>
      <h2 className="mb-3 font-display text-2xl font-bold">{title}</h2>
      <ul className="space-y-3">
        {list.map(({ p, a }) => (
          <li key={p.id} className="card flex items-center gap-3 p-3">
            <button onClick={() => go(`/plants/${p.id}`)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <PlantImage plant={p} className="size-14 shrink-0 rounded-2xl text-2xl" />
              <span className="min-w-0"><span className="block truncate font-bold">{plantName(p)}</span><span className="text-sm text-leaf-800/70">{fmtDate(a.next)}</span> <StatusChip a={a} /></span>
            </button>
            {onDone && <button className="btn btn-primary shrink-0" onClick={() => onDone(p)} aria-label={`Позначити виконаним: ${plantName(p)}`}><CheckCircle2 size={20} /><span className="hidden sm:inline">Виконано</span></button>}
          </li>
        ))}
      </ul>
    </section>
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
          <li>Розпізнавання за фото: {remoteProvider.available ? 'фото надсилається захищеному сервісу розпізнавання лише для визначення виду; результати — пропозиції, які ви підтверджуєте.' : 'ще не підключене (потрібен захищений сервер-посередник). Фото можна зробити й обрати рослину вручну.'}</li>
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

/* ======================= Розпізнавання за фото ======================= */
const ORGANS: { id: Organ; label: string }[] = [
  { id: 'auto', label: 'Авто' }, { id: 'leaf', label: 'Лист' }, { id: 'flower', label: 'Квітка' }, { id: 'fruit', label: 'Плід' }, { id: 'bark', label: 'Кора' },
]
type IdState = { kind: 'idle' } | { kind: 'loading' } | { kind: 'error'; msg: string } | { kind: 'done'; source: string; results: Suggestion[] }

export function IdentifyPage() {
  const { openCamera, openGallery } = useCapture()
  const [file, setFile] = useState<File | null>(() => peekIdentifyPhoto())
  const [organ, setOrgan] = useState<Organ>('auto')
  const [state, setState] = useState<IdState>({ kind: 'idle' })
  const [adding, setAdding] = useState(false)
  const preview = useObjectUrl(file ?? undefined)
  const available = remoteProvider.available

  useEffect(() => {
    clearIdentifyPhoto()
    const f = () => { const p = peekIdentifyPhoto(); clearIdentifyPhoto(); if (p) { setFile(p); setState({ kind: 'idle' }) } }
    addEventListener('identify-photo', f)
    return () => removeEventListener('identify-photo', f)
  }, [])

  async function run(o: Organ = organ) {
    if (!file) return
    setState({ kind: 'loading' })
    try {
      const img = await shrinkImage(file, 1280)
      const r = await remoteProvider.identify(img, o)
      setState({ kind: 'done', ...r })
    } catch (e) {
      setState({ kind: 'error', msg: e instanceof IdentifyError || e instanceof Error ? e.message : 'Не вдалося розпізнати.' })
    }
  }
  // Після результату — прокрутити до варіантів (на телефоні фото займає весь екран)
  const resRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => { if (state.kind === 'done' || state.kind === 'error') resRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, [state.kind])
  // Нове фото → одразу розпізнаємо (якщо сервіс підключено)
  useEffect(() => { if (file && available) run('auto') }, [file]) // eslint-disable-line react-hooks/exhaustive-deps

  async function add(s?: Suggestion) {
    if (!file) return
    setAdding(true)
    try {
      const photo = await shrinkImage(file, 800)
      if (!s) setFormDraft({ photo })
      else if (s.entry) setFormDraft({ photo, catalogId: s.entry.id, scientificName: s.scientificName, customName: s.match === 'genus' ? (s.commonNames[0] ?? s.scientificName).slice(0, 40) : undefined })
      else setFormDraft({ photo, scientificName: s.scientificName, customName: (s.commonNames[0] ?? s.scientificName).slice(0, 40), needsCategory: true })
      go('/plants/new')
    } catch (e) {
      setState({ kind: 'error', msg: (e as Error).message })
    } finally { setAdding(false) }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageTitle sub="Сфотографуйте листок, квітку або всю рослину при денному світлі">Розпізнати рослину</PageTitle>

      {!file ? (
        <section className="card space-y-4 p-6 text-center">
          <Camera className="mx-auto text-leaf-600" size={48} />
          <p className="text-leaf-800/80">Зробіть фото камерою або оберіть наявне з галереї.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <button className="btn btn-primary" onClick={openCamera}><Camera size={20} /> Сфотографувати</button>
            <button className="btn btn-soft" onClick={openGallery}><ImageIcon size={20} /> З галереї / файлу</button>
          </div>
        </section>
      ) : (
        <section className="card overflow-hidden">
          {preview && <img src={preview} alt="Фото для розпізнавання" className="max-h-80 w-full object-cover" />}
          <div className="grid grid-cols-2 gap-3 p-4">
            <button className="btn btn-soft" onClick={openCamera}><Camera size={20} /> Інше фото</button>
            <button className="btn btn-soft" onClick={openGallery}><ImageIcon size={20} /> З галереї</button>
          </div>
        </section>
      )}

      {file && !available && (
        <section className="card space-y-3 p-5" role="status">
          <h2 className="font-display text-xl font-bold">Автоматичне розпізнавання ще не підключено</h2>
          <p className="text-leaf-800/80">Для нього потрібен захищений сервер-посередник із ключем сервісу розпізнавання — ключ не можна зберігати на сайті. Поки що оберіть рослину вручну: фото вже буде в картці.</p>
          <button className="btn btn-primary w-full" disabled={adding} onClick={() => add()}>Обрати рослину вручну</button>
        </section>
      )}

      {file && available && (
        <section className="card space-y-4 p-5" aria-labelledby="res-h">
          <h2 id="res-h" ref={resRef} className="scroll-mt-4 font-display text-xl font-bold">Варіанти</h2>
          <div role="radiogroup" aria-label="Що на фото" className="flex flex-wrap gap-2">
            {ORGANS.map((o) => (
              <button key={o.id} role="radio" aria-checked={organ === o.id} disabled={state.kind === 'loading'}
                onClick={() => { setOrgan(o.id); run(o.id) }}
                className={`btn min-h-10 text-sm ${organ === o.id ? 'btn-primary' : 'btn-soft'}`}>{o.label}</button>
            ))}
          </div>
          {state.kind === 'loading' && <p role="status" className="flex items-center gap-2 font-semibold"><Loader2 className="animate-spin" size={20} /> Розпізнаю…</p>}
          {state.kind === 'error' && (
            <div role="alert" className="space-y-2 rounded-xl bg-clay/15 p-3 text-[#8f3f18]">
              <p className="flex items-start gap-2 font-semibold"><AlertTriangle size={20} className="shrink-0" /> {state.msg}</p>
              <button className="btn btn-soft min-h-10 text-sm" onClick={() => run()}>Спробувати ще раз</button>
            </div>
          )}
          {state.kind === 'done' && state.results.length === 0 && (
            <p role="status" className="rounded-xl bg-leaf-50 p-3">Рослину не впізнано. Спробуйте чіткіше фото листка чи квітки крупним планом або оберіть вручну.</p>
          )}
          {state.kind === 'done' && state.results.length > 0 && (
            <>
              {state.results[0].score < 0.25 && <p role="status" className="rounded-xl bg-clay/15 p-3 text-sm font-semibold text-[#8f3f18]">Сервіс не впевнений у результаті — уважно перевірте варіанти або оберіть вручну.</p>}
              <ul className="space-y-3" aria-label="Запропоновані рослини">
                {state.results.map((s) => (
                  <li key={s.scientificName} className="rounded-2xl border-2 border-leaf-100 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-display text-lg font-bold">{s.entry && s.match === 'species' ? s.entry.commonNameUk : (s.commonNames[0] ?? s.scientificName)}</p>
                        <p className="break-words text-sm italic text-leaf-800/80">{s.scientificName}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-leaf-100 px-3 py-1 text-sm font-bold" aria-label={`Оцінка сервісу ${Math.round(s.score * 100)} відсотків`}>{Math.round(s.score * 100)}%</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-leaf-50" aria-hidden><div className="h-full bg-leaf-500" style={{ width: `${Math.round(s.score * 100)}%` }} /></div>
                    <p className="mt-2 text-sm text-leaf-800/80">
                      {s.match === 'species' ? '✓ Є в каталозі — підказки для цього виду.'
                        : s.match === 'genus' ? `≈ Схожа рослина того ж роду — догляд як для «${s.entry!.commonNameUk}».`
                          : 'Немає в демо-каталозі — буде загальна картка «Інша рослина».'}
                    </p>
                    <button className="btn btn-primary mt-3 w-full" disabled={adding} onClick={() => add(s)}><Plus size={20} /> Додати в колекцію</button>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-leaf-800/70">Розпізнавання: {state.source}. Відсоток — оцінка сервісу, а не гарантія; перевірте перед додаванням.</p>
            </>
          )}
          <p className="text-xs text-leaf-800/70">Фото надсилається сервісу розпізнавання лише для визначення виду. У застосунку воно зберігається тільки на вашому пристрої.</p>
          <button className="btn btn-soft w-full" disabled={adding} onClick={() => add()}>Немає правильного варіанту — обрати вручну</button>
        </section>
      )}
    </div>
  )
}
