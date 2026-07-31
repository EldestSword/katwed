import { useCallback, useEffect, useRef, useState } from 'react'
import { QuestionImage } from '../../components/QuestionImage'
import { ImageViewer } from '../../components/ImageViewer'
import { containedImageBounds, type ImageBounds } from './pinpointGeometry'

export interface PinpointMarker {
  x: number
  y: number
  kind: 'player' | 'response'
  label: string
}

interface PinpointTarget {
  x: number
  y: number
  radius: number
}

export function PinpointSurface({
  path,
  alt,
  mode,
  markers = [],
  target,
  onSelect,
  allowEnlarge = true,
}: {
  path: string
  alt: string
  mode: 'answer' | 'player-reveal' | 'presentation-reveal'
  markers?: PinpointMarker[]
  target?: PinpointTarget
  onSelect?(point: { x: number; y: number }): void
  allowEnlarge?: boolean
}) {
  const root = useRef<HTMLDivElement>(null)
  const [bounds, setBounds] = useState<ImageBounds | null>(null)
  const [viewerOpen, setViewerOpen] = useState(false)

  const updateBounds = useCallback(() => {
    const container = root.current
    const image = container?.querySelector('img')
    if (!container || !image) return
    const containerRect = container.getBoundingClientRect()
    setBounds(containedImageBounds(
      containerRect.width,
      containerRect.height,
      image.naturalWidth,
      image.naturalHeight,
    ))
  }, [])

  useEffect(() => {
    const container = root.current
    if (!container) return
    const handleLoad = () => updateBounds()
    container.addEventListener('load', handleLoad, true)
    window.addEventListener('resize', updateBounds)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateBounds)
    observer?.observe(container)
    updateBounds()
    return () => {
      container.removeEventListener('load', handleLoad, true)
      window.removeEventListener('resize', updateBounds)
      observer?.disconnect()
    }
  }, [updateBounds])

  const surface = (
    <div className={`pinpoint-coordinate-surface pinpoint-coordinate-surface--${mode}`} ref={root}>
      <QuestionImage path={path} alt={alt} />
      {bounds && (
        <div
          className={`pinpoint-coordinate-layer ${onSelect ? 'is-interactive' : ''}`}
          data-testid="pinpoint-coordinate-layer"
          role={onSelect ? 'button' : 'img'}
          tabIndex={onSelect ? 0 : undefined}
          aria-label={onSelect ? 'Select a location on the image' : 'Pinpoint answer overlay'}
          style={bounds}
          onClick={onSelect ? (event) => {
            const imageRect = event.currentTarget.getBoundingClientRect()
            onSelect({
              x: Math.max(0, Math.min(1, (event.clientX - imageRect.left) / imageRect.width)),
              y: Math.max(0, Math.min(1, (event.clientY - imageRect.top) / imageRect.height)),
            })
          } : undefined}
        >
          {markers.map((marker, index) => (
            <span
              key={`${marker.kind}-${index}`}
              className={`pinpoint-marker pinpoint-marker--${marker.kind}`}
              data-testid={`pinpoint-${marker.kind}-marker`}
              style={{ left: `${marker.x * 100}%`, top: `${marker.y * 100}%` }}
            >
              <span className="sr-only">{marker.label}</span>
            </span>
          ))}
          {target && (
            <span
              className="pinpoint-target"
              data-testid="pinpoint-correct-target"
              style={{
                left: `${target.x * 100}%`,
                top: `${target.y * 100}%`,
                width: `${target.radius * 200}%`,
                height: `${target.radius * 200}%`,
              }}
            >
              <span className="pinpoint-target__centre" aria-hidden="true" />
              <span className="sr-only">Correct target area</span>
            </span>
          )}
        </div>
      )}
      {allowEnlarge && (
        <button className="enlarge-button" type="button" onClick={() => setViewerOpen(true)}>
          Enlarge image
        </button>
      )}
    </div>
  )

  return (
    <>
      {surface}
      {viewerOpen && (
        <ImageViewer path={path} alt={alt} onClose={() => setViewerOpen(false)}>
          <PinpointSurface
            path={path}
            alt={alt}
            mode={mode}
            markers={markers}
            target={target}
            onSelect={onSelect}
            allowEnlarge={false}
          />
        </ImageViewer>
      )}
    </>
  )
}
