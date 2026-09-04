import { useRef, useState } from 'react'
import type { TextItem } from '../../types/domain'

export function PlayerOrderingAnswer({ items, value, disabled = false, onChange }: {
  items: TextItem[]; value: string[] | null; disabled?: boolean; onChange(ids: string[]): void
}) {
  const ids = value ?? items.map((item) => item.id)
  const drag = useRef<{ id: string; pointer: number } | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const move = (id: string, target: number) => {
    if (disabled || target < 0 || target >= ids.length) return
    const next = ids.filter((candidate) => candidate !== id)
    next.splice(target, 0, id)
    onChange(next)
    setAnnouncement(`${items.find((item) => item.id === id)?.label ?? 'Item'} moved to position ${target + 1}.`)
  }
  return <div className="ordering-answer">
    <p>Put the items in order. Drag the handle or use Move up and Move down.</p>
    <ol className="ordering-cards" aria-label="Your order">{ids.map((id, index) => {
      const label = items.find((item) => item.id === id)?.label ?? 'Unavailable item'
      return <li key={id} data-order-item={id}>
        <span className="arrangement-marker" aria-label={`Position ${index + 1}`}>{index + 1}</span><strong>{label}</strong>
        <div className="ordering-card-controls">
          <button type="button" className="ordering-drag" disabled={disabled} aria-label={`Drag ${label}`}
            onClick={() => { if (!disabled) onChange([...ids]) }}
            onPointerDown={(event) => {
              if (disabled || event.button !== 0) return
              drag.current = { id, pointer: event.pointerId }
              event.currentTarget.setPointerCapture?.(event.pointerId)
              onChange([...ids])
            }}
            onPointerMove={(event) => {
              if (disabled || drag.current?.pointer !== event.pointerId) return
              const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-order-item]')?.getAttribute('data-order-item')
              if (target && target !== id && ids.includes(target)) move(id, ids.indexOf(target))
            }}
            onPointerUp={(event) => { drag.current = null; if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }}
            onPointerCancel={() => { drag.current = null }}>↕</button>
          <button type="button" disabled={disabled || index === 0} aria-label={`Move ${label} up`} onClick={() => move(id, index - 1)}>↑</button>
          <button type="button" disabled={disabled || index === ids.length - 1} aria-label={`Move ${label} down`} onClick={() => move(id, index + 1)}>↓</button>
        </div>
      </li>
    })}</ol>
    <p className="sr-only" aria-live="polite">{announcement}</p>
  </div>
}
