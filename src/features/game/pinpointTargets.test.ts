import { describe, expect, it } from 'vitest'
import type { PinpointTarget } from '../../types/domain'
import { imagePoint, containedImageBounds } from './pinpointGeometry'
import { isPinpointTarget, normalisePinpointTarget, pinpointContains, polygonArea, simplifyPinpointPath } from './pinpointTargets'

const circle: PinpointTarget = { kind: 'circle', x: .5, y: .5, radius: .1 }
const rectangle: PinpointTarget = { kind: 'rectangle', x: .2, y: .3, width: .4, height: .3 }
// Concave L, so a point in the bounding box can still miss.
const polygon: PinpointTarget = { kind: 'polygon', points: [
  { x: .1, y: .1 }, { x: .9, y: .1 }, { x: .9, y: .4 },
  { x: .4, y: .4 }, { x: .4, y: .9 }, { x: .1, y: .9 },
] }

describe('Pinpoint target geometry', () => {
  it('normalises legacy circles exactly and refuses malformed new keys', () => {
    const legacy = { targetX: .5, targetY: .5, targetRadius: .1 }
    expect(normalisePinpointTarget(legacy)).toEqual(circle)
    expect(normalisePinpointTarget({ ...legacy, target: null })).toBeNull()
    expect(normalisePinpointTarget({ ...legacy, target: { kind: 'unknown' } })).toBeNull()
    expect(normalisePinpointTarget({ target: polygon })).toEqual(polygon)
    expect(normalisePinpointTarget({ target: polygon })).not.toBe(polygon)
    expect(isPinpointTarget({ kind: 'circle', x: 0, y: 1, radius: .000001 })).toBe(true)
  })

  it.each([
    [circle, { x: .6, y: .5 }, { x: .61, y: .5 }],
    [rectangle, { x: .6, y: .6 }, { x: .61, y: .6 }],
    [polygon, { x: .4, y: .7 }, { x: .7, y: .7 }],
    [{ ...polygon, points: [...polygon.points].reverse() }, { x: .2, y: .7 }, { x: .7, y: .7 }],
  ] as const)('scores inclusive %s boundaries and misses', (target, hit, miss) => {
    expect(pinpointContains(target, hit)).toBe(true)
    expect(pinpointContains(target, miss)).toBe(false)
    expect(pinpointContains(target, { x: NaN, y: .5 })).toBe(false)
    expect(pinpointContains(target, { x: 1.01, y: .5 })).toBe(false)
  })

  it.each([
    null, {}, { ...circle, radius: 0 }, { ...circle, radius: Infinity }, { ...circle, x: NaN },
    { ...circle, radius: '0.1' }, { ...circle, secret: true }, { ...rectangle, width: 0 },
    { ...rectangle, width: .9 }, { kind: 'polygon', points: [] },
    { kind: 'polygon', points: [{ x: 0, y: 0 }, { x: .5, y: .5 }, { x: 1, y: 1 }] },
    { kind: 'polygon', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 0 }] },
    { kind: 'polygon', points: [{ x: 0, y: 0 }, { x: .001, y: 0 }, { x: 0, y: .001 }] },
    { ...polygon, points: [...polygon.points, polygon.points[0]] },
    { ...polygon, points: Array.from({ length: 65 }, (_, i) => ({ x: .5 + .4 * Math.cos(i / 65 * 2 * Math.PI), y: .5 + .4 * Math.sin(i / 65 * 2 * Math.PI) })) },
  ])('rejects malformed and degenerate target %#', (target) => expect(isPinpointTarget(target)).toBe(false))

  it('maps the actual contained image independently of container size', () => {
    for (const [w, h, nw, nh] of [[800, 400, 400, 400], [300, 700, 1600, 900], [400, 400, 400, 800]]) {
      const bounds = containedImageBounds(w, h, nw, nh)
      expect(imagePoint(bounds.left + bounds.width * .25, bounds.top + bounds.height * .75, bounds)).toEqual({ x: .25, y: .75 })
      expect(imagePoint(-100, 2000, bounds)).toEqual({ x: 0, y: 1 })
    }
  })

  it('simplifies a closed sampled ring deterministically within the vertex bound', () => {
    const samples = Array.from({ length: 400 }, (_, i) => ({ x: .5 + .3 * Math.cos(i / 399 * 2 * Math.PI), y: .5 + .3 * Math.sin(i / 399 * 2 * Math.PI) }))
    const points = simplifyPinpointPath(samples)
    expect(points.length).toBeGreaterThanOrEqual(3)
    expect(points.length).toBeLessThanOrEqual(64)
    expect(points).toEqual(simplifyPinpointPath(samples))
    expect(polygonArea(points)).toBeCloseTo(Math.PI * .3 ** 2, 2)
    expect(isPinpointTarget({ kind: 'polygon', points })).toBe(true)
    expect(simplifyPinpointPath([{ x: .5, y: .5 }, { x: .501, y: .5 }, { x: .5, y: .501 }])).toEqual([])
    expect(simplifyPinpointPath([{ x: -1, y: .5 }])).toEqual([])
  })
})
