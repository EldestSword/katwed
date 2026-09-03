import { useId, useRef, useState, type PointerEvent } from 'react'
import type { PinpointPoint, PinpointQuestion, PinpointTarget } from '../../types/domain'
import { PinpointSurface } from '../game/PinpointSurface'
import { imagePoint } from '../game/pinpointGeometry'
import { isPinpointTarget, MAX_PINPOINT_VERTICES, simplifyPinpointPath } from '../game/pinpointTargets'

type Tool = PinpointTarget['kind']
const labels: Record<Tool, string> = { circle: 'Circle', rectangle: 'Rectangle', polygon: 'Freehand' }
const instructions: Record<Tool, string> = {
  circle: 'Drag from the centre to the edge of the accepted area.',
  rectangle: 'Drag from one corner to the opposite corner of the accepted area.',
  polygon: 'Draw around the accepted area. The outline closes when you release.',
}

function defaultTarget(tool: Tool): PinpointTarget {
  if (tool === 'circle') return { kind: tool, x: 0.5, y: 0.5, radius: 0.1 }
  if (tool === 'rectangle') return { kind: tool, x: 0.25, y: 0.25, width: 0.5, height: 0.5 }
  return { kind: tool, points: [{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.25 }, { x: 0.75, y: 0.75 }, { x: 0.25, y: 0.75 }] }
}

function draggedTarget(tool: Tool, start: PinpointPoint, end: PinpointPoint, points: PinpointPoint[]): PinpointTarget {
  if (tool === 'circle') return { kind: tool, ...start, radius: Math.min(1, Math.hypot(end.x - start.x, end.y - start.y)) }
  if (tool === 'rectangle') return {
    kind: tool, x: Math.min(start.x, end.x), y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y),
  }
  return { kind: tool, points }
}

export function PinpointTargetEditor({ question, onChange }: { question: PinpointQuestion; onChange(target: PinpointTarget | null): void }) {
  const [tool, setTool] = useState<Tool>(question.target?.kind ?? 'circle')
  const [draft, setDraft] = useState<PinpointTarget | null>(null)
  const [message, setMessage] = useState('')
  const stroke = useRef<{ id: number; start: PinpointPoint; points: PinpointPoint[] } | null>(null)
  const helpId = useId()

  function cancel() {
    stroke.current = null
    setDraft(null)
  }

  function point(event: PointerEvent<HTMLDivElement>) {
    return imagePoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect())
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    const active = stroke.current
    if (!active || active.id !== event.pointerId) return null
    event.preventDefault()
    const end = point(event)
    const previous = active.points.at(-1)!
    if (Math.hypot(end.x - previous.x, end.y - previous.y) >= 0.001) active.points.push(end)
    // Bound transient capture too, including exceptionally slow or long gestures.
    if (active.points.length > 512) active.points = active.points.filter((_, i) => i % 2 === 0 || i === active.points.length - 1)
    const next = draggedTarget(tool, active.start, end, [...active.points])
    setDraft(next)
    return next
  }

  const target = question.target
  return <fieldset className="pinpoint-editor" aria-describedby={helpId}>
    <legend>Correct answer area</legend>
    <div className="pinpoint-editor__tools" role="group" aria-label="Drawing tool">
      {(Object.keys(labels) as Tool[]).map((kind) => <button className="button button--secondary" key={kind} type="button" aria-pressed={tool === kind} onClick={() => { cancel(); setTool(kind); setMessage('') }}>{labels[kind]}</button>)}
    </div>
    <p id={helpId}>{instructions[tool]} Choose a tool and draw again to replace the area.</p>
    {question.media.path ? <PinpointSurface path={question.media.path} alt={question.media.altText} mode="author" target={draft ?? target} allowEnlarge={false} drawing={{
      onPointerDown: (event) => {
        if (stroke.current || event.button !== 0 || !event.isPrimary) return
        event.preventDefault()
        event.currentTarget.focus()
        event.currentTarget.setPointerCapture(event.pointerId)
        const start = point(event)
        stroke.current = { id: event.pointerId, start, points: [start] }
        setMessage('')
        setDraft(draggedTarget(tool, start, start, [start]))
      },
      onPointerMove: move,
      onPointerUp: (event) => {
        const next = move(event)
        if (!next) return
        const finished = next.kind === 'polygon' ? { ...next, points: simplifyPinpointPath(next.points) } : next
        if (isPinpointTarget(finished)) { onChange(finished); setMessage('Correct answer area updated.') }
        else setMessage('Draw a larger area with a clear outline that does not cross itself. Your previous area has been kept.')
        cancel()
        event.currentTarget.releasePointerCapture(event.pointerId)
      },
      onPointerCancel: cancel,
      onLostPointerCapture: cancel,
      onKeyDown: (event) => { if (event.key === 'Escape') { cancel(); setMessage('Drawing cancelled.') } },
    }} /> : <p>Upload an image in Media &amp; presentation to draw the correct area.</p>}
    <div className="pinpoint-editor__actions"><button className="button button--secondary" type="button" disabled={!target} onClick={() => { cancel(); onChange(null); setMessage('Area cleared. Draw a new area before saving.') }}>Clear area</button>
      <span>{target ? `${labels[target.kind]} area configured` : 'No area configured'}</span></div>
    <p role="status" className="pinpoint-editor__status">{message}</p>
    <details>
      <summary>Advanced settings · keyboard and precise editing</summary>
      <p>Values run from 0 to 1 across and down the image. Circle radius uses this normalised scale, so circles may appear oval on wide or tall images. Rectangle coordinates mark the top-left corner.</p>
      <button className="button button--secondary" type="button" onClick={() => { cancel(); onChange(defaultTarget(tool)); setMessage('Area created. Adjust its values below.') }}>Create {labels[tool].toLowerCase()} area with keyboard</button>
      {target && target.kind !== 'polygon' && <div className="pinpoint-editor__numbers">
        {(target.kind === 'circle' ? ['x', 'y', 'radius'] as const : ['x', 'y', 'width', 'height'] as const).map((field) => <label key={field}>
          <span>{({ x: 'Horizontal position', y: 'Vertical position', radius: 'Radius', width: 'Width', height: 'Height' })[field]}</span>
          <input type="number" min="0" max="1" step="0.001" value={target[field as keyof typeof target]} onChange={(event) => onChange({ ...target, [field]: event.target.value === '' ? 0 : Number(event.target.value) })} />
        </label>)}
      </div>}
      {target?.kind === 'polygon' && <>
        <p>Edit vertices in outline order. Use at least three points; the final point connects to the first.</p>
        {target.points.map((p, index) => <div className="pinpoint-editor__vertex" key={index}>
          {(['x', 'y'] as const).map((axis) => <label key={axis}><span>Point {index + 1} {axis === 'x' ? 'horizontal' : 'vertical'}</span><input type="number" min="0" max="1" step="0.001" value={p[axis]} onChange={(event) => onChange({ ...target, points: target.points.map((v, i) => i === index ? { ...v, [axis]: Number(event.target.value) } : v) })} /></label>)}
          <button className="button button--secondary" type="button" aria-label={`Remove point ${index + 1}`} disabled={target.points.length <= 3} onClick={() => onChange({ ...target, points: target.points.filter((_, i) => i !== index) })}>Remove</button>
          <button className="button button--secondary" type="button" aria-label={`Insert point after ${index + 1}`} disabled={target.points.length >= MAX_PINPOINT_VERTICES} onClick={() => {
            const next = target.points[(index + 1) % target.points.length]
            const points = [...target.points]
            points.splice(index + 1, 0, { x: (p.x + next.x) / 2, y: (p.y + next.y) / 2 })
            onChange({ ...target, points })
          }}>Insert</button>
        </div>)}
      </>}
      {target && !isPinpointTarget(target) && <p role="alert">This area is invalid. Keep it within the image and give it a non-zero size and an outline that does not cross itself.</p>}
    </details>
  </fieldset>
}
