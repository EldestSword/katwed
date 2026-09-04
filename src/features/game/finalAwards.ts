import type { LeaderboardEntry } from '../../types/domain'

export type FinalAwardsBaseline = ReadonlyMap<string, number>
export interface AwardPlayer { playerId: string; nickname: string }
export type FinalAward =
  | { kind: 'most-correct'; winners: AwardPlayer[]; correctAnswerCount: number }
  | { kind: 'quickest-thinker'; winners: AwardPlayer[]; averageResponseMs: number }
  | { kind: 'biggest-climber'; winners: (AwardPlayer & { firstRank: number; finalRank: number })[]; places: number }

const awardPlayer = ({ playerId, nickname }: LeaderboardEntry): AwardPlayer => ({ playerId, nickname })
const validCount = (count: number) => Number.isSafeInteger(count) && count >= 1

/** Uses authoritative rows as supplied: never changes standings or breaks an award tie. */
export function calculateFinalAwards(entries: readonly LeaderboardEntry[], baseline: FinalAwardsBaseline | null = null): FinalAward[] {
  const awards: FinalAward[] = []
  const correct = entries.filter((entry) => validCount(entry.correctAnswerCount))
  if (correct.length) {
    const count = Math.max(...correct.map((entry) => entry.correctAnswerCount))
    awards.push({ kind: 'most-correct', correctAnswerCount: count,
      winners: correct.filter((entry) => entry.correctAnswerCount === count).map(awardPlayer) })
  }

  const quick = correct.filter((entry) => entry.correctAnswerCount >= 3 &&
    Number.isSafeInteger(entry.totalCorrectResponseMs) && entry.totalCorrectResponseMs >= 0)
  if (quick.length) {
    // Compare exact fractions before formatting seconds, so display rounding cannot create a tie.
    const compare = (a: LeaderboardEntry, b: LeaderboardEntry) =>
      BigInt(a.totalCorrectResponseMs) * BigInt(b.correctAnswerCount) - BigInt(b.totalCorrectResponseMs) * BigInt(a.correctAnswerCount)
    const fastest = quick.reduce((best, entry) => compare(entry, best) < 0n ? entry : best)
    awards.push({ kind: 'quickest-thinker', averageResponseMs: fastest.totalCorrectResponseMs / fastest.correctAnswerCount,
      winners: quick.filter((entry) => compare(entry, fastest) === 0n).map(awardPlayer) })
  }

  const climbers = entries.flatMap((entry) => {
    const firstRank = baseline?.get(entry.playerId)
    return firstRank !== undefined && Number.isInteger(firstRank) && firstRank > entry.rank &&
      Number.isInteger(entry.rank) && entry.rank > 0
      ? [{ ...awardPlayer(entry), firstRank, finalRank: entry.rank, places: firstRank - entry.rank }] : []
  })
  if (climbers.length) {
    const places = Math.max(...climbers.map((player) => player.places))
    awards.push({ kind: 'biggest-climber', places, winners: climbers.filter((player) => player.places === places)
      .map(({ playerId, nickname, firstRank, finalRank }) => ({ playerId, nickname, firstRank, finalRank })) })
  }
  return awards
}
