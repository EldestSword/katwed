import type {
  CompetitionMode,
  GameSessionSettings,
  LeaderboardEntry,
  Player,
  TieBreakerResultEntry,
} from '../../types/domain'

export const TIE_BREAKER_TIME_LIMIT_SECONDS = 20
export const TIE_BREAKER_MAX_ABSOLUTE_VALUE = 1_000_000_000_000_000

const DECIMAL_PATTERN = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/

export function normaliseTieBreakerValue(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 64 || !DECIMAL_PATTERN.test(trimmed)) return null
  const numeric = Number(trimmed)
  if (!Number.isFinite(numeric) || Math.abs(numeric) > TIE_BREAKER_MAX_ABSOLUTE_VALUE) return null
  const negative = trimmed.startsWith('-')
  const unsigned = negative ? trimmed.slice(1) : trimmed
  const [wholeRaw, fractionRaw = ''] = unsigned.split('.')
  const whole = (wholeRaw || '0').replace(/^0+(?=\d)/, '')
  const fraction = fractionRaw.replace(/0+$/, '')
  const canonical = `${negative && (whole !== '0' || fraction) ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`
  return canonical
}

interface Decimal {
  coefficient: bigint
  scale: number
}

function decimal(value: string): Decimal {
  const canonical = normaliseTieBreakerValue(value)
  if (!canonical) throw new Error('Invalid tie-breaker decimal.')
  const negative = canonical.startsWith('-')
  const unsigned = negative ? canonical.slice(1) : canonical
  const [whole, fraction = ''] = unsigned.split('.')
  const coefficient = BigInt(`${whole}${fraction}`) * (negative ? -1n : 1n)
  return { coefficient, scale: fraction.length }
}

function power10(exponent: number): bigint {
  return 10n ** BigInt(exponent)
}

function absoluteDifference(left: Decimal, right: Decimal): Decimal {
  const scale = Math.max(left.scale, right.scale)
  const a = left.coefficient * power10(scale - left.scale)
  const b = right.coefficient * power10(scale - right.scale)
  return { coefficient: a >= b ? a - b : b - a, scale }
}

function compareDecimals(left: Decimal, right: Decimal): number {
  const scale = Math.max(left.scale, right.scale)
  const a = left.coefficient * power10(scale - left.scale)
  const b = right.coefficient * power10(scale - right.scale)
  return a < b ? -1 : a > b ? 1 : 0
}

function decimalText(value: Decimal): string {
  const digits = value.coefficient.toString().padStart(value.scale + 1, '0')
  if (!value.scale) return digits
  const whole = digits.slice(0, -value.scale)
  const fraction = digits.slice(-value.scale).replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole
}

export function winningTiePlayerIds(
  players: readonly Pick<Player, 'id' | 'totalScore' | 'survivorLivesRemaining' | 'survivorEliminatedAtQuestion'>[],
  competitionMode: CompetitionMode,
): string[] {
  if (players.length < 2) return []
  if (competitionMode === 'points') {
    const highest = Math.max(...players.map((player) => player.totalScore))
    const tied = players.filter((player) => player.totalScore === highest).map((player) => player.id)
    return tied.length > 1 ? tied : []
  }
  const alive = players.filter((player) => (player.survivorLivesRemaining ?? 0) > 0)
  if (alive.length) {
    const mostLives = Math.max(...alive.map((player) => player.survivorLivesRemaining ?? 0))
    const tied = alive.filter((player) => player.survivorLivesRemaining === mostLives).map((player) => player.id)
    return tied.length > 1 ? tied : []
  }
  const latest = Math.max(...players.map((player) => player.survivorEliminatedAtQuestion ?? 0))
  const tied = players.filter((player) => (player.survivorEliminatedAtQuestion ?? 0) === latest).map((player) => player.id)
  return tied.length > 1 ? tied : []
}

export function automaticTieBreakersSupported(
  settings: Pick<GameSessionSettings, 'playMode' | 'automaticTieBreakersEnabled'> | null | undefined,
  quizType: 'standard' | 'head-to-head' | undefined,
): boolean {
  return quizType === 'standard' && settings?.playMode !== 'teams' && settings?.automaticTieBreakersEnabled === true
}

export interface TieBreakerAnswerForResolution {
  playerId: string
  nickname: string
  value: string | null
  responseTimeMs: number | null
}

export function resolveTieBreakerAnswers(
  answers: readonly TieBreakerAnswerForResolution[],
  correctAnswer: string,
): { winnerPlayerId: string | null; unresolvedPlayerIds: string[]; results: TieBreakerResultEntry[] } {
  const target = decimal(correctAnswer)
  const results = answers.map((answer) => {
    const valid = answer.value === null ? null : normaliseTieBreakerValue(answer.value)
    const error = valid === null ? null : absoluteDifference(decimal(valid), target)
    return {
      playerId: answer.playerId,
      nickname: answer.nickname,
      value: valid,
      absoluteError: error ? decimalText(error) : null,
      responseTimeMs: valid === null || !Number.isInteger(answer.responseTimeMs) || answer.responseTimeMs! < 0
        ? null
        : answer.responseTimeMs,
    } satisfies TieBreakerResultEntry
  })
  const submitted = results.filter((entry) => entry.value !== null && entry.responseTimeMs !== null)
  if (!submitted.length) return { winnerPlayerId: null, unresolvedPlayerIds: results.map((entry) => entry.playerId), results }
  const bestError = submitted.reduce((best, entry) => {
    const candidate = decimal(entry.absoluteError!)
    return compareDecimals(candidate, best) < 0 ? candidate : best
  }, decimal(submitted[0].absoluteError!))
  const closest = submitted.filter((entry) => compareDecimals(decimal(entry.absoluteError!), bestError) === 0)
  const fastestMs = Math.min(...closest.map((entry) => entry.responseTimeMs!))
  const best = closest.filter((entry) => entry.responseTimeMs === fastestMs)
  return best.length === 1
    ? { winnerPlayerId: best[0].playerId, unresolvedPlayerIds: [], results }
    : { winnerPlayerId: null, unresolvedPlayerIds: best.map((entry) => entry.playerId), results }
}

export function applyTieBreakerWinner<T extends LeaderboardEntry>(entries: readonly T[], winnerPlayerId: string | null | undefined): T[] {
  const ordered = [...entries].sort((left, right) => left.rank - right.rank)
  if (!winnerPlayerId) return ordered.map((entry, index) => ({ ...entry, rank: index + 1 }))
  const winner = ordered.find((entry) => entry.playerId === winnerPlayerId)
  if (!winner) return ordered.map((entry, index) => ({ ...entry, rank: index + 1 }))
  return [winner, ...ordered.filter((entry) => entry.playerId !== winnerPlayerId)]
    .map((entry, index) => ({ ...entry, rank: index + 1 }))
}

/** Reconstructs the ordinary quiz-stat ranking used by Final Awards after the
 * resolved winner has been moved to first for the podium. */
export function leaderboardBeforeTieBreaker<T extends LeaderboardEntry>(entries: readonly T[]): T[] {
  return [...entries].sort((left, right) =>
    right.totalScore - left.totalScore ||
    right.correctAnswerCount - left.correctAnswerCount ||
    left.totalCorrectResponseMs - right.totalCorrectResponseMs ||
    left.nickname.localeCompare(right.nickname, 'en-GB', { sensitivity: 'base' }) ||
    left.playerId.localeCompare(right.playerId),
  ).map((entry, index) => ({ ...entry, rank: index + 1 }))
}
