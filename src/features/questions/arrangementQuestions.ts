import type { MatchingPair, MatchingQuestion, OrderingQuestion, TextItem } from '../../types/domain'

export function onlyFields(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    Object.keys(value).length === fields.length && Object.keys(value).every((key) => fields.includes(key))
}

export function validTextItems(value: unknown): value is TextItem[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 8) return false
  const ids = new Set<string>(), labels = new Set<string>()
  return value.every((item: unknown) => {
    if (!onlyFields(item, ['id', 'label']) || typeof item.id !== 'string' || !item.id || item.id.length > 128 ||
      typeof item.label !== 'string' || !item.label.trim() || item.label.trim().length > 120) return false
    const label = item.label.trim().toLowerCase()
    if (ids.has(item.id) || labels.has(label)) return false
    ids.add(item.id); labels.add(label)
    return true
  })
}

export function validPermutation(value: unknown, ids: readonly string[]): value is string[] {
  return Array.isArray(value) && value.length === ids.length && new Set(value).size === ids.length &&
    value.every((id: unknown) => typeof id === 'string' && ids.includes(id))
}

export function validMatchingPairs(value: unknown, leftIds: readonly string[], rightIds: readonly string[]): value is MatchingPair[] {
  if (!Array.isArray(value) || value.length !== leftIds.length || leftIds.length !== rightIds.length) return false
  if (!value.every((pair: unknown) => onlyFields(pair, ['leftId', 'rightId']) && typeof pair.leftId === 'string' && typeof pair.rightId === 'string')) return false
  const pairs = value as MatchingPair[]
  return validPermutation(pairs.map((pair) => pair.leftId), leftIds) && validPermutation(pairs.map((pair) => pair.rightId), rightIds)
}

export function arrangementValidation(question: OrderingQuestion | MatchingQuestion): string[] {
  if (question.type === 'ordering') {
    if (!validTextItems(question.items)) return ['Ordering needs 2–8 text items with unique IDs and distinct labels of 1–120 characters.']
    return validPermutation(question.correctItemIds, question.items.map((item) => item.id)) ? [] : ['The correct order must contain every item exactly once.']
  }
  if (!validTextItems(question.leftItems) || !validTextItems(question.rightItems) || question.leftItems.length !== question.rightItems.length ||
    new Set([...question.leftItems, ...question.rightItems].map((item) => item.id)).size !== question.leftItems.length + question.rightItems.length) {
    return ['Matching needs 2–8 pairs with unique IDs and distinct text labels of 1–120 characters on each side.']
  }
  if (question.scoringMode !== 'exact' && question.scoringMode !== 'partial') return ['Choose Exact or Partial matching scoring.']
  return validMatchingPairs(question.correctPairs, question.leftItems.map((item) => item.id), question.rightItems.map((item) => item.id)) ? [] : ['Every left and right item must appear in exactly one correct pair.']
}

/** Seed/ID-only order: authored positions and answer keys never contribute.
 * Coincidences are allowed; forcing a wrong two-item order would reveal its inverse.
 * SQL uses its own deterministic hash; every surface consumes the serialised order.
 */
export function shuffledTextItems(items: readonly TextItem[], seed: string): TextItem[] {
  const hash = (id: string) => {
    let value = 2166136261
    for (const char of `${seed}:${id}`) value = Math.imul(value ^ char.charCodeAt(0), 16777619)
    value ^= value >>> 16; value = Math.imul(value, 0x85ebca6b)
    value ^= value >>> 13; value = Math.imul(value, 0xc2b2ae35)
    return (value ^ (value >>> 16)) >>> 0
  }
  return items.map(({ id, label }) => ({ id, label: label.trim() })).sort((a, b) => hash(a.id) - hash(b.id) || a.id.localeCompare(b.id))
}

export function remapArrangementItems(question: OrderingQuestion | MatchingQuestion, createId: () => string = () => crypto.randomUUID()): OrderingQuestion | MatchingQuestion {
  const ids = new Map<string, string>()
  const remap = (items: TextItem[]) => items.map((item) => { const id = createId(); ids.set(item.id, id); return { ...item, id } })
  const idFor = (id: string) => { const mapped = ids.get(id); if (!mapped) throw new Error('Invalid item reference.'); return mapped }
  if (question.type === 'ordering') {
    const items = remap(question.items)
    return { ...question, items, correctItemIds: question.correctItemIds.map(idFor) }
  }
  const leftItems = remap(question.leftItems), rightItems = remap(question.rightItems)
  return { ...question, leftItems, rightItems, correctPairs: question.correctPairs.map((pair) => ({ leftId: idFor(pair.leftId), rightId: idFor(pair.rightId) })) }
}

export const itemLabel = (items: readonly TextItem[], id: string) => items.find((item) => item.id === id)?.label ?? 'Unavailable item'
export const matchingLabels = (question: Pick<MatchingQuestion, 'leftItems' | 'rightItems'>, pairs: readonly MatchingPair[]) =>
  pairs.map((pair) => `${itemLabel(question.leftItems, pair.leftId)} → ${itemLabel(question.rightItems, pair.rightId)}`)
