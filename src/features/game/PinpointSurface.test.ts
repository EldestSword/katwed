import { describe, expect, it } from 'vitest'
import { containedImageBounds } from './pinpointGeometry'

describe('containedImageBounds', () => {
  it('tracks the displayed image box through landscape, portrait and resized containers', () => {
    expect(containedImageBounds(1000, 500, 1000, 1000)).toEqual({
      left: 250, top: 0, width: 500, height: 500,
    })
    expect(containedImageBounds(400, 800, 1600, 900)).toEqual({
      left: 0, top: 287.5, width: 400, height: 225,
    })
    expect(containedImageBounds(800, 400, 1600, 900)).toEqual({
      left: 44.44444444444446, top: 0, width: 711.1111111111111, height: 400,
    })
  })
})
