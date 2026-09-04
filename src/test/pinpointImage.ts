import { fireEvent, screen } from '@testing-library/react'

/** jsdom does not load images or lay out their content boxes. */
export async function loadPinpointImage(alt: string, width = 800, height = 400, naturalWidth = 400, naturalHeight = 400) {
  const image = await screen.findByAltText(alt)
  Object.defineProperties(image, {
    complete: { configurable: true, value: true },
    naturalWidth: { configurable: true, value: naturalWidth },
    naturalHeight: { configurable: true, value: naturalHeight },
  })
  Object.defineProperties(image.parentElement!, {
    clientWidth: { configurable: true, value: width },
    clientHeight: { configurable: true, value: height },
  })
  fireEvent.load(image)
  return image
}
