import type { PinpointTarget } from '../../types/domain'

export function PinpointTargetOverlay({ target }: { target: PinpointTarget }) {
  return <svg className="pinpoint-target-overlay" viewBox="0 0 1 1" preserveAspectRatio="none" role="img" aria-label="Correct target area" data-testid="pinpoint-correct-target" data-shape={target.kind}>
    <title>Correct target area</title>
    {target.kind === 'circle' && <circle cx={target.x} cy={target.y} r={target.radius} />}
    {target.kind === 'rectangle' && <rect x={target.x} y={target.y} width={target.width} height={target.height} />}
    {target.kind === 'polygon' && <polygon points={target.points.map((p) => `${p.x},${p.y}`).join(' ')} />}
  </svg>
}
