import { positionMarkerNames } from './positionMarkers'

const markerShapes = [
  <circle key="circle" cx="12" cy="12" r="7" />,
  <path key="triangle" d="M12 4 20 19H4Z" />,
  <rect key="square" x="5" y="5" width="14" height="14" rx="1" />,
  <path key="diamond" d="m12 3 9 9-9 9-9-9Z" />,
  <path key="pentagon" d="m12 3 8.6 6.2-3.3 10.1H6.7L3.4 9.2Z" />,
  <path key="hexagon" d="m7 3 10 0 5 9-5 9H7l-5-9Z" />,
  <path key="star" d="m12 2.8 2.7 5.7 6.3.8-4.6 4.5 1.2 6.4-5.6-3.1-5.6 3.1 1.2-6.4L3 9.3l6.3-.8Z" />,
  <path key="cross" d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z" />,
] as const

export function PositionMarker({ position }: { position: number }) {
  const index = ((position % markerShapes.length) + markerShapes.length) % markerShapes.length
  return (
    <span className="position-marker" data-marker={positionMarkerNames[index]} aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">{markerShapes[index]}</svg>
    </span>
  )
}
