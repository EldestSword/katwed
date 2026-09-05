import type { PinpointPoint, PinpointTarget, Question } from '../../types/domain'

export const MAX_PINPOINT_VERTICES = 64
export const MIN_PINPOINT_POLYGON_AREA = 0.0001
const EPSILON = 1e-10

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function keys(value: Record<string, unknown>, expected: string[]): boolean {
  return Object.keys(value).length === expected.length && expected.every((key) => key in value)
}

export function isNormalisedCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
}

function isPoint(value: unknown): value is PinpointPoint {
  return record(value) && keys(value, ['x', 'y']) && isNormalisedCoordinate(value.x) && isNormalisedCoordinate(value.y)
}

function cross(a: PinpointPoint, b: PinpointPoint, p: PinpointPoint): number {
  return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
}

function onSegment(p: PinpointPoint, a: PinpointPoint, b: PinpointPoint): boolean {
  return Math.abs(cross(a, b, p)) <= EPSILON &&
    p.x >= Math.min(a.x, b.x) - EPSILON && p.x <= Math.max(a.x, b.x) + EPSILON &&
    p.y >= Math.min(a.y, b.y) - EPSILON && p.y <= Math.max(a.y, b.y) + EPSILON
}

function intersects(a: PinpointPoint, b: PinpointPoint, c: PinpointPoint, d: PinpointPoint): boolean {
  return (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) ||
    onSegment(c, a, b) || onSegment(d, a, b) || onSegment(a, c, d) || onSegment(b, c, d)
}

export function polygonArea(points: readonly PinpointPoint[]): number {
  return Math.abs(points.reduce((sum, p, i) => {
    const next = points[(i + 1) % points.length]
    return sum + p.x * next.y - next.x * p.y
  }, 0)) / 2
}

export function isPinpointTarget(value: unknown): value is PinpointTarget {
  if (!record(value)) return false
  switch (value.kind) {
    case 'circle':
      // Retain the historical minimum radius and allow clipping at image edges.
      return keys(value, ['kind', 'x', 'y', 'radius']) && isNormalisedCoordinate(value.x) &&
        isNormalisedCoordinate(value.y) && isNormalisedCoordinate(value.radius) && value.radius >= 0.000001
    case 'rectangle':
      return keys(value, ['kind', 'x', 'y', 'width', 'height']) && isNormalisedCoordinate(value.x) &&
        isNormalisedCoordinate(value.y) && isNormalisedCoordinate(value.width) && isNormalisedCoordinate(value.height) &&
        value.width > 0 && value.height > 0 && value.x + value.width <= 1 + EPSILON && value.y + value.height <= 1 + EPSILON
    case 'polygon': {
      if (!keys(value, ['kind', 'points']) || !Array.isArray(value.points) || value.points.length < 3 ||
        value.points.length > MAX_PINPOINT_VERTICES || !value.points.every(isPoint)) return false
      const points = value.points
      if (polygonArea(points) < MIN_PINPOINT_POLYGON_AREA) return false
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length]
        for (let j = i + 1; j < points.length; j++) {
          if (Math.hypot(a.x - points[j].x, a.y - points[j].y) < 0.000001) return false
          if (j === i + 1 || (i === 0 && j === points.length - 1)) continue
          if (intersects(a, b, points[j], points[(j + 1) % points.length])) return false
        }
        // Reject an adjacent edge doubling back over itself.
        const c = points[(i + 2) % points.length]
        if (Math.abs(cross(a, b, c)) <= EPSILON && (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) < 0) return false
      }
      return true
    }
    default: return false
  }
}

/** A present but invalid new target must never silently fall back to a legacy key. */
export function normalisePinpointTarget(value: unknown): PinpointTarget | null {
  if (!record(value)) return null
  const target = 'target' in value ? value.target : {
    kind: 'circle', x: value.targetX, y: value.targetY, radius: value.targetRadius,
  }
  return isPinpointTarget(target) ? structuredClone(target) : null
}

export function normalisePinpointQuestion(question: Question): Question {
  if (question.type !== 'pinpoint') return question
  const result = { ...question, target: normalisePinpointTarget(question) }
  for (const key of ['targetX', 'targetY', 'targetRadius']) Reflect.deleteProperty(result, key)
  return result
}

/** Inclusive edges, with the same fixed arithmetic tolerance as PostgreSQL. */
export function pinpointContains(target: PinpointTarget | null, point: PinpointPoint): boolean {
  if (!isPinpointTarget(target) || !isNormalisedCoordinate(point.x) || !isNormalisedCoordinate(point.y)) return false
  if (target.kind === 'circle') return Math.hypot(point.x - target.x, point.y - target.y) <= target.radius + EPSILON
  if (target.kind === 'rectangle') return point.x >= target.x - EPSILON && point.x <= target.x + target.width + EPSILON &&
    point.y >= target.y - EPSILON && point.y <= target.y + target.height + EPSILON
  let inside = false
  for (let i = 0, j = target.points.length - 1; i < target.points.length; j = i++) {
    const a = target.points[j], b = target.points[i]
    if (onSegment(point, a, b)) return true
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** Deterministic closed-ring simplification: remove the least significant vertex
 * until every retained bend exceeds tolerance and the storage bound is met. */
export function simplifyPinpointPath(samples: readonly PinpointPoint[], tolerance = 0.002): PinpointPoint[] {
  if (samples.some((p) => !isPoint(p))) return []
  const points = samples.filter((p, i) => i === 0 || Math.hypot(p.x - samples[i - 1].x, p.y - samples[i - 1].y) >= 0.001)
    .map((p) => ({ ...p }))
  if (points.length > 1 && Math.hypot(points[0].x - points.at(-1)!.x, points[0].y - points.at(-1)!.y) < 0.003) points.pop()
  while (points.length > 3) {
    let least = Infinity, index = 0
    for (let i = 0; i < points.length; i++) {
      const a = points[(i + points.length - 1) % points.length], b = points[(i + 1) % points.length], p = points[i]
      const dx = b.x - a.x, dy = b.y - a.y
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
      const distance = Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
      if (distance < least) { least = distance; index = i }
    }
    if (points.length <= MAX_PINPOINT_VERTICES && least > tolerance) break
    points.splice(index, 1)
  }
  return isPinpointTarget({ kind: 'polygon', points }) ? points : []
}
