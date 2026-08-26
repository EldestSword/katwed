export const DARK_ANSWER_TEXT = '#111827'
export const LIGHT_ANSWER_TEXT = '#FFFFFF'

export function normaliseHexColour(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!match) return null
  const digits = match[1].length === 3
    ? [...match[1]].map((digit) => `${digit}${digit}`).join('')
    : match[1]
  return `#${digits.toUpperCase()}`
}

function rgb(hex: string): readonly [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ]
}

function linearChannel(channel: number): number {
  const value = channel / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

export function relativeLuminance(value: string): number | null {
  const hex = normaliseHexColour(value)
  if (!hex) return null
  const [red, green, blue] = rgb(hex).map(linearChannel)
  return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue)
}

export function contrastRatio(first: string, second: string): number | null {
  const firstLuminance = relativeLuminance(first)
  const secondLuminance = relativeLuminance(second)
  if (firstLuminance === null || secondLuminance === null) return null
  const lighter = Math.max(firstLuminance, secondLuminance)
  const darker = Math.min(firstLuminance, secondLuminance)
  return (lighter + 0.05) / (darker + 0.05)
}

export function getContrastingTextColour(backgroundHex: string): string | null {
  const background = normaliseHexColour(backgroundHex)
  if (!background) return null
  const darkRatio = contrastRatio(background, DARK_ANSWER_TEXT) ?? 0
  const lightRatio = contrastRatio(background, LIGHT_ANSWER_TEXT) ?? 0
  return darkRatio >= lightRatio ? DARK_ANSWER_TEXT : LIGHT_ANSWER_TEXT
}
