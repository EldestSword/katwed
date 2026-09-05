import { useCallback, useEffect, useRef, useState, type HTMLAttributes } from 'react'
import type { PinpointTarget } from '../../types/domain'
import { PinpointTargetOverlay } from './PinpointTargetOverlay'
import { QuestionImage } from '../../components/QuestionImage'
import { ImageViewer } from '../../components/ImageViewer'
import { containedImageBounds, imagePoint, type ImageBounds } from './pinpointGeometry'

export interface PinpointMarker {
  x: number
  y: number
  kind: 'player' | 'response'
  label: string
}

export function PinpointSurface({
  path,
  alt,
  mode,
  markers = [],
  target,
  onSelect,
  drawing,
  allowEnlarge = true,
}: {
  path: string
  alt: string
  mode: 'answer' | 'player-reveal' | 'presentation-reveal' | 'author'
  markers?: PinpointMarker[]
  target?: PinpointTarget | null
  drawing?: Pick<HTMLAttributes<HTMLDivElement>, 'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel' | 'onLostPointerCapture' | 'onKeyDown'>
  onSelect?(point: { x: number; y: number }): void
  allowEnlarge?: boolean
}) {
  const root = useRef<HTMLDivElement>(null)
  const [bounds, setBounds] = useState<ImageBounds | null>(null)
  const [viewerOpen, setViewerOpen] = useState(false)

  const updateBounds = useCallback(() => {
    const container = root.current
    const image = container?.querySelector('img')
    if (!container || !image || !image.complete || !image.naturalWidth || !image.naturalHeight) { setBounds(null); return }
    setBounds(containedImageBounds(
      container.clientWidth,
      container.clientHeight,
      image.naturalWidth,
      image.naturalHeight,
    ))
  }, [])

  useEffect(() => {
    const container = root.current
    if (!container) return
    const handleLoad = () => updateBounds()
    container.addEventListener('load', handleLoad, true)
    container.addEventListener('error', handleLoad, true)
    window.addEventListener('resize', updateBounds)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateBounds)
    observer?.observe(container)
    updateBounds()
    return () => {
      container.removeEventListener('load', handleLoad, true)
      container.removeEventListener('error', handleLoad, true)
      window.removeEventListener('resize', updateBounds)
      observer?.disconnect()
    }
  }, [updateBounds, path])

  const surface = (
    <div className={`pinpoint-coordinate-surface pinpoint-coordinate-surface--${mode}`} ref={root}>
      <QuestionImage key={path} path={path} alt={alt} />
      {bounds && (
        <div
          className={`pinpoint-coordinate-layer ${onSelect ? 'is-interactive' : ''} ${drawing ? 'is-drawing' : ''}`}
          data-testid="pinpoint-coordinate-layer"
          role={drawing ? 'group' : onSelect ? 'button' : 'img'}
          tabIndex={drawing || onSelect ? 0 : undefined}
          aria-label={drawing ? 'Draw the correct answer area; Advanced settings offers keyboard editing' : onSelect ? 'Select a location on the image' : 'Pinpoint answer overlay'}
          style={bounds}
          {...drawing}
          onClick={onSelect ? (event) => {
            const imageRect = event.currentTarget.getBoundingClientRect()
            onSelect(imagePoint(event.clientX, event.clientY, imageRect))
          } : undefined}
        >
          {target && <PinpointTargetOverlay target={target} />}
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
