export interface ImageBounds {
  left: number
  top: number
  width: number
  height: number
}

export function containedImageBounds(
  containerWidth: number,
  containerHeight: number,
  naturalWidth: number,
  naturalHeight: number,
): ImageBounds {
  if (containerWidth <= 0 || containerHeight <= 0 || naturalWidth <= 0 || naturalHeight <= 0) {
    return { left: 0, top: 0, width: containerWidth, height: containerHeight }
  }
  const scale = Math.min(containerWidth / naturalWidth, containerHeight / naturalHeight)
  const width = naturalWidth * scale
  const height = naturalHeight * scale
  return {
    left: (containerWidth - width) / 2,
    top: (containerHeight - height) / 2,
    width,
    height,
  }
}
