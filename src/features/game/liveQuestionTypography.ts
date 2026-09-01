export type ContentDensity = 'short' | 'medium' | 'long' | 'extra-long'

function normalisedText(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

export function questionTextDensity(prompt: string, hasVisualMedia: boolean): ContentDensity {
  const text = normalisedText(prompt)
  const thresholds = hasVisualMedia
    ? [48, 92, 150]
    : [76, 145, 230]

  if (text.length <= thresholds[0]) return 'short'
  if (text.length <= thresholds[1]) return 'medium'
  if (text.length <= thresholds[2]) return 'long'
  return 'extra-long'
}

export function answerTextDensity(label: string): ContentDensity {
  const text = normalisedText(label)
  const longestWord = text.split(/\s+/).reduce((longest, word) => Math.max(longest, word.length), 0)

  if (longestWord > 24 || text.length > 72) return 'extra-long'
  if (longestWord > 18 || text.length > 44) return 'long'
  if (longestWord > 13 || text.length > 28) return 'medium'
  return 'short'
}

export function hasExtraLongAnswer(labels: readonly string[]): boolean {
  return labels.some((label) => answerTextDensity(label) === 'extra-long')
}
