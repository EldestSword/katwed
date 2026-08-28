import type { AudioAssetVariant, GameAudioCue, SoundPackDefinition } from './soundPacks'

const STORAGE_KEY = 'katwed.audio.variant-selections.v1'
const MAX_SESSION_PACKS = 20
const MAX_EVENT_SELECTIONS = 512

interface ShuffleBagState {
  order: number[]
  cursor: number
  lastIndex: number | null
}

interface SessionPackState {
  updatedAt: number
  bags: Partial<Record<GameAudioCue, ShuffleBagState>>
  selections: Record<string, number>
}

interface PersistedVariantState {
  sessionPacks: Record<string, SessionPackState>
}

type RandomSource = () => number

function cryptoRandom(): number {
  const value = new Uint32Array(1)
  crypto.getRandomValues(value)
  return value[0] / 0x1_0000_0000
}

export function shuffledVariantIndices(
  size: number,
  previousIndex: number | null = null,
  random: RandomSource = cryptoRandom,
): number[] {
  const order = Array.from({ length: Math.max(0, size) }, (_, index) => index)
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    ;[order[index], order[swap]] = [order[swap], order[index]]
  }
  if (order.length > 1 && order[0] === previousIndex) {
    const swap = 1 + Math.floor(random() * (order.length - 1))
    ;[order[0], order[swap]] = [order[swap], order[0]]
  }
  return order
}

function emptyState(): PersistedVariantState {
  return { sessionPacks: {} }
}

function validOrder(order: unknown, size: number): order is number[] {
  return Array.isArray(order) && order.length === size &&
    new Set(order).size === size && order.every((index) => Number.isInteger(index) && index >= 0 && index < size)
}

export class AudioVariantSelectionStore {
  constructor(
    private readonly storage: Storage | null = typeof localStorage === 'undefined' ? null : localStorage,
    private readonly random: RandomSource = cryptoRandom,
  ) {}

  select(
    sessionId: string,
    pack: SoundPackDefinition,
    cue: GameAudioCue,
    eventKey: string,
    authoritativeIndex?: number,
  ): AudioAssetVariant | null {
    const variants = pack.assets?.[cue]
    if (!variants?.length) return null
    const state = this.read()
    const namespace = `${sessionId}:${pack.id}`
    const sessionPack = state.sessionPacks[namespace] ?? { updatedAt: Date.now(), bags: {}, selections: {} }
    const selectionKey = `${cue}:${eventKey}`
    let index = sessionPack.selections[selectionKey]

    if (!Number.isInteger(index) || index < 0 || index >= variants.length) {
      if (Number.isInteger(authoritativeIndex) && authoritativeIndex! >= 0 && authoritativeIndex! < variants.length) {
        index = authoritativeIndex!
      } else {
        let bag = sessionPack.bags[cue]
        if (!bag || !validOrder(bag.order, variants.length) || bag.cursor >= bag.order.length) {
          const previous = bag?.lastIndex ?? null
          bag = { order: shuffledVariantIndices(variants.length, previous, this.random), cursor: 0, lastIndex: previous }
        }
        index = bag.order[bag.cursor]
        bag.cursor += 1
        bag.lastIndex = index
        sessionPack.bags[cue] = bag
      }
      sessionPack.selections[selectionKey] = index
    }

    sessionPack.updatedAt = Date.now()
    const selectionEntries = Object.entries(sessionPack.selections)
    if (selectionEntries.length > MAX_EVENT_SELECTIONS) {
      sessionPack.selections = Object.fromEntries(selectionEntries.slice(-MAX_EVENT_SELECTIONS))
    }
    state.sessionPacks[namespace] = sessionPack
    this.prune(state)
    this.write(state)
    return variants[index] ?? variants[0]
  }

  private read(): PersistedVariantState {
    if (!this.storage) return emptyState()
    try {
      const parsed: unknown = JSON.parse(this.storage.getItem(STORAGE_KEY) ?? '')
      if (typeof parsed === 'object' && parsed !== null &&
        typeof (parsed as PersistedVariantState).sessionPacks === 'object') return parsed as PersistedVariantState
    } catch {
      // Restricted or malformed storage falls back to an in-memory selection for this transition.
    }
    return emptyState()
  }

  private write(state: PersistedVariantState): void {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // Audio playback must remain safe when durable browser storage is unavailable.
    }
  }

  private prune(state: PersistedVariantState): void {
    const entries = Object.entries(state.sessionPacks).sort((left, right) => right[1].updatedAt - left[1].updatedAt)
    state.sessionPacks = Object.fromEntries(entries.slice(0, MAX_SESSION_PACKS))
  }
}
