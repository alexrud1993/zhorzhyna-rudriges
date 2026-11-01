import { createContext, useContext, useRef, type ReactNode } from 'react'
import { go } from './ui'

/* Передача фото та чернетки між екранами без запису у сховище.
   Читаємо через peek у ініціалізаторі стану, очищаємо в ефекті — безпечно для StrictMode. */
let identifyPhoto: File | null = null
export const peekIdentifyPhoto = () => identifyPhoto
export const clearIdentifyPhoto = () => { identifyPhoto = null }

export interface FormDraft {
  photo?: Blob
  catalogId?: string
  customName?: string
  scientificName?: string
  /** Розпізнаний вид відсутній у каталозі — треба обрати тип «Інша …» */
  needsCategory?: boolean
}
let formDraft: FormDraft | null = null
export const setFormDraft = (d: FormDraft) => { formDraft = d }
export const peekFormDraft = () => formDraft
export const clearFormDraft = () => { formDraft = null }

const Ctx = createContext<{ openCamera(): void; openGallery(): void }>({ openCamera() {}, openGallery() {} })
export const useCapture = () => useContext(Ctx)

/** Глобальні приховані поля вибору фото: камера (capture) і галерея/файл. Після вибору — екран розпізнавання. */
export function CaptureProvider({ children }: { children: ReactNode }) {
  const cam = useRef<HTMLInputElement>(null)
  const gal = useRef<HTMLInputElement>(null)
  const onPick = (input: HTMLInputElement | null) => {
    const f = input?.files?.[0]
    if (input) input.value = ''
    if (!f) return
    identifyPhoto = f
    if (location.hash === '#/identify') dispatchEvent(new Event('identify-photo'))
    else go('/identify')
  }
  return (
    <Ctx.Provider value={{ openCamera: () => cam.current?.click(), openGallery: () => gal.current?.click() }}>
      {children}
      <input ref={cam} id="identify-cam" type="file" accept="image/*" capture="environment" tabIndex={-1} aria-hidden className="sr-only" onChange={(e) => onPick(e.currentTarget)} />
      <input ref={gal} id="identify-file" type="file" accept="image/*" tabIndex={-1} aria-hidden className="sr-only" onChange={(e) => onPick(e.currentTarget)} />
    </Ctx.Provider>
  )
}
