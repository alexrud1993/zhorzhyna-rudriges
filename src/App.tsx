import { CalendarDays, Camera, Home as HomeIcon, Leaf, Settings as Cog } from 'lucide-react'
import { StoreProvider, useStore } from './store'
import { cityById } from './cities'
import { useWeather } from './weather'
import { CalendarPage, Home, IdentifyPage, PlantDetail, PlantForm, PlantsPage, SettingsPage, WxCtx } from './pages'
import { CaptureProvider, useCapture } from './capture'
import { go, useRoute } from './ui'

const NAV = [
  { path: '/', label: 'Головна', Icon: HomeIcon },
  { path: '/plants', label: 'Рослини', Icon: Leaf },
  { path: '/calendar', label: 'Календар', Icon: CalendarDays },
  { path: '/settings', label: 'Параметри', title: 'Налаштування', Icon: Cog },
]

function Shell() {
  const { ready, settings, storageError, clearStorageError } = useStore()
  const { openCamera } = useCapture()
  const route = useRoute()
  const wx = useWeather(cityById(settings.selectedCityId))
  const [path, qs] = route.split('?')
  const query = new URLSearchParams(qs ?? '')
  const active = (p: string) => (p === '/' ? path === '/' : path.startsWith(p))

  let page
  const m = path.match(/^\/plants\/([^/]+)(\/edit)?$/)
  if (path === '/') page = <Home />
  else if (path === '/identify') page = <IdentifyPage />
  else if (path === '/plants') page = <PlantsPage key={qs} query={query} />
  else if (path === '/plants/new') page = <PlantForm key="new" />
  else if (m && m[2]) page = <PlantForm key={m[1]} id={m[1]} />
  else if (m) page = <PlantDetail id={m[1]} />
  else if (path === '/calendar') page = <CalendarPage />
  else if (path === '/settings') page = <SettingsPage />
  else page = <Home />

  const navLink = ({ path: p, label, title, Icon }: (typeof NAV)[number]) => (
    <a key={p} href={`#${p}`} aria-current={active(p) ? 'page' : undefined} aria-label={title}
      className={`flex min-h-16 min-w-0 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold max-[359px]:text-[10px] max-[359px]:tracking-tight ${active(p) ? 'text-leaf-700' : 'text-leaf-800/60'}`}>
      <Icon size={24} strokeWidth={active(p) ? 2.6 : 2} /><span className="max-w-full truncate">{label}</span>
    </a>
  )

  return (
    <WxCtx.Provider value={wx}>
      {/* Hash-маршрутизація: посилання «До змісту» лише переводить фокус, а не змінює адресу */}
      <a href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus() }}
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-3">До змісту</a>
      <div className="mx-auto flex min-h-dvh max-w-6xl">
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-2 p-5 md:flex">
          <button onClick={() => go('/')} className="mb-4 rounded-2xl" aria-label="Жоржина Рудрігес — головна">
            <img src="./logo-256.png" alt="Жоржина Рудрігес" width={200} height={200} className="w-full rounded-2xl" />
          </button>
          <button onClick={openCamera} className="btn btn-primary mb-2 w-full"><Camera size={20} /> Розпізнати за фото</button>
          <nav aria-label="Основна навігація" className="flex flex-col gap-1">
            {NAV.map(({ path: p, title, label, Icon }) => (
              <a key={p} href={`#${p}`} aria-current={active(p) ? 'page' : undefined}
                className={`flex min-h-12 items-center gap-3 rounded-2xl px-4 font-semibold ${active(p) ? 'bg-leaf-700 text-white' : 'hover:bg-leaf-100'}`}><Icon size={20} /> {title ?? label}</a>
            ))}
          </nav>
          <p className="mt-auto text-xs text-leaf-800/60">Демо-прототип. Рекомендації загальні, не є агрономічною порадою.</p>
        </aside>
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-4 pb-32 pt-5 outline-none md:px-8 md:pb-10 md:pt-8">
          <button onClick={() => go('/')} className="mb-4 flex items-center gap-3 text-left font-display text-xl font-bold text-leaf-800 md:hidden" aria-label="Жоржина Рудрігес — головна">
            <img src="./logo-256.png" alt="" width={64} height={64} className="size-16 rounded-xl" />
            <span>Жоржина Рудрігес</span>
          </button>
          {storageError && (
            <div role="alert" className="mb-4 flex items-start justify-between gap-3 rounded-2xl bg-clay/15 p-4 font-semibold text-[#8f3f18]">
              <span>{storageError}</span>
              <button onClick={clearStorageError} className="btn btn-soft min-h-10 shrink-0 text-sm">Закрити</button>
            </div>
          )}
          {!ready ? <p role="status">Завантаження…</p> : page}
        </main>
      </div>
      <nav aria-label="Основна навігація" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-leaf-100 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {navLink(NAV[0])}
        {navLink(NAV[1])}
        <div className="flex flex-col items-center">
          <button onClick={openCamera} aria-label="Розпізнати рослину за фото"
            className="-mt-7 grid size-16 place-items-center rounded-full bg-leaf-700 text-white shadow-lg ring-4 ring-cream active:scale-95">
            <Camera size={30} />
          </button>
          <span className="mt-0.5 text-[11px] font-bold text-leaf-700" aria-hidden>Фото</span>
        </div>
        {navLink(NAV[2])}
        {navLink(NAV[3])}
      </nav>
    </WxCtx.Provider>
  )
}

export default function App() {
  return <StoreProvider><CaptureProvider><Shell /></CaptureProvider></StoreProvider>
}
