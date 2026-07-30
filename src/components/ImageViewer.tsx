import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { QuestionImage } from './QuestionImage'

export function ImageViewer({
  path,
  alt,
  onClose,
}: {
  path: string
  alt: string
  onClose(): void
}) {
  const dialog = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const root = dialog.current
    root?.querySelector<HTMLButtonElement>('button')?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab' || !root) return
      const focusable = [...root.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])')]
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', keydown)
    return () => {
      document.removeEventListener('keydown', keydown)
      previous?.focus()
    }
  }, [onClose])

  return createPortal(
    <div className="image-viewer" role="dialog" aria-modal="true" aria-label="Enlarged question image" ref={dialog}>
      <button className="image-viewer__close" type="button" onClick={onClose}>Close</button>
      <QuestionImage path={path} alt={alt} />
    </div>,
    document.body,
  )
}
