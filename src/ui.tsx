import { useEffect, useRef, useState, type ReactNode } from 'react'
import { catalogById } from './catalog'
import type { UserPlant } from './types'

/* ---------- Hash-маршрутизація ---------- */
export function useRoute() {
  const [h, setH] = useState(() => location.hash.slice(1) || '/')
  useEffect(() => {
    const f = () => { setH(location.hash.slice(1) || '/'); window.scrollTo(0, 0) }
    addEventListener('hashchange', f)
    return () => removeEventListener('hashchange', f)
  }, [])
  return h
}
export const go = (path: string) => { location.hash = path }

/* ---------- Фото ---------- */
export function useObjectUrl(blob?: Blob) {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!blob) { setUrl(undefined); return }
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url
}

export const plantName = (p: UserPlant) => p.customName?.trim() || catalogById(p.catalogId)?.commonNameUk || 'Рослина'

export function PlantImage({ plant, className = '' }: { plant: UserPlant; className?: string }) {
  const url = useObjectUrl(plant.imageBlob)
  const c = catalogById(plant.catalogId)
  if (url) return <img src={url} alt={plantName(plant)} className={`object-cover ${className}`} />
  return (
    <div role="img" aria-label={`Без фото: ${plantName(plant)}`} className={`grid place-items-center bg-gradient-to-br from-leaf-100 to-leaf-200 ${className}`}>
      <span className="text-5xl" aria-hidden>{c?.emoji ?? '🌱'}</span>
    </div>
  )
}

/* ---------- Діалог підтвердження ---------- */
export function Confirm({ title, children, confirmLabel, danger, onYes, onNo }: {
  title: string; children?: ReactNode; confirmLabel: string; danger?: boolean; onYes(): void; onNo(): void
}) {
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    ref.current?.focus()
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onNo()
    addEventListener('keydown', k)
    return () => removeEventListener('keydown', k)
  }, [onNo])
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onNo}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="dlg-t" className="card w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <h2 id="dlg-t" className="font-display text-xl font-bold">{title}</h2>
        <div className="mt-2 text-leaf-800/80">{children}</div>
        <div className="mt-5 flex gap-3">
          <button ref={ref} className="btn btn-soft flex-1" onClick={onNo}>Скасувати</button>
          <button className={`btn flex-1 ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onYes}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

/* ---------- Тост ---------- */
export function Toast({ msg, action, onClose }: { msg: string; action?: { label: string; run(): void }; onClose(): void }) {
  useEffect(() => { const t = setTimeout(onClose, 6000); return () => clearTimeout(t) }, [msg, onClose])
  return (
    <div role="status" aria-live="polite" className="fixed inset-x-4 bottom-24 z-40 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl bg-leaf-900 px-4 py-3 text-white shadow-xl md:bottom-6">
      <span>{msg}</span>
      {action && <button className="rounded-lg px-3 py-2 font-bold text-leaf-200 underline" onClick={() => { action.run(); onClose() }}>{action.label}</button>}
    </div>
  )
}

export const fmtDate = (d: Date | string) =>
  new Date(d).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })
export const fmtDateTime = (d: Date | string) =>
  new Date(d).toLocaleString('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export function relDay(n: number) {
  if (n === 0) return 'сьогодні'
  if (n === 1) return 'завтра'
  if (n === -1) return 'вчора'
  return n > 0 ? `через ${n} дн.` : `${-n} дн. тому`
}
