import type { GameTeam, LaunchGameSettings, LeaderboardEntry, Player, QuizType, SafeGameState, SessionPlayMode, TeamAssignmentMode, TeamLeaderboardEntry } from '../../types/domain'
import { isSurvivorGame, survivorStandings } from '../game/survivor'

export const normalisePlayMode = (value: unknown): SessionPlayMode => value === 'teams' ? 'teams' : 'individual'
export const normaliseTeamAssignment = (value: unknown): TeamAssignmentMode => value === 'host' || value === 'balanced-random' ? value : 'player-choice'
export const isTeamGame = (state: SafeGameState | null): boolean => state?.quizType !== 'head-to-head' && state?.sessionSettings?.playMode === 'teams'

export function validateTeamLaunch(settings: Partial<LaunchGameSettings> | undefined, quizType: QuizType): string | null {
  if (normalisePlayMode(settings?.playMode) !== 'teams') return null
  if (quizType === 'head-to-head') return 'Head-to-Head cannot use Teams.'
  if (!['player-choice', 'balanced-random', 'host'].includes(settings?.teamAssignmentMode ?? 'player-choice')) return 'Choose a valid team assignment mode.'
  const names = settings?.teamNames ?? ['Team 1', 'Team 2']
  if (!Array.isArray(names) || names.length < 2 || names.length > 8) return 'Choose between 2 and 8 teams.'
  if (names.some((name) => typeof name !== 'string' || !name.trim() || name.trim().length > 30)) return 'Team names must contain 1–30 characters.'
  if (new Set(names.map((name) => name.trim().toLowerCase())).size !== names.length) return 'Team names must be unique.'
  return null
}

/** Only permitted leaderboard rows contribute; player totals are never read here. */
export function teamStandings(teams: readonly GameTeam[], players: readonly Pick<Player, 'id' | 'teamId'>[], entries: readonly LeaderboardEntry[]): TeamLeaderboardEntry[] {
  const membership = new Map(players.map((player) => [player.id, player.teamId]))
  const totals = new Map(teams.map((team) => [team.id, { teamId: team.id, name: team.name, displayOrder: team.displayOrder,
    memberCount: players.filter((player) => player.teamId === team.id).length, totalScore: 0, correctAnswerCount: 0, totalCorrectResponseMs: 0 }]))
  for (const entry of entries) {
    const team = totals.get(membership.get(entry.playerId) ?? '')
    if (!team) continue
    team.totalScore += entry.totalScore
    team.correctAnswerCount += entry.correctAnswerCount
    team.totalCorrectResponseMs += entry.totalCorrectResponseMs
  }
  return [...totals.values()].sort((a, b) => b.totalScore - a.totalScore || b.correctAnswerCount - a.correctAnswerCount ||
    a.totalCorrectResponseMs - b.totalCorrectResponseMs || a.displayOrder - b.displayOrder || a.name.localeCompare(b.name, 'en-GB') || a.teamId.localeCompare(b.teamId))
    .map(({ displayOrder: _order, ...entry }, index) => ({ ...entry, rank: index + 1 }))
}

/** Adapter to the existing ranked display engine. Identity is the team ID, never its name. */
export function teamDisplayEntries(entries: readonly TeamLeaderboardEntry[]): LeaderboardEntry[] {
  return entries.map(({ teamId, name, ...entry }) => ({ ...entry, playerId: teamId, nickname: name }))
}

export function competitionState(state: SafeGameState | null): SafeGameState | null {
  if (!state) return state
  if (isTeamGame(state)) return { ...state, sessionId: `${state.sessionId}:teams`, leaderboard: ['leaderboard', 'finished'].includes(state.phase)
    ? teamDisplayEntries(teamStandings(state.teams ?? [], state.players, state.leaderboard)) : [] }
  if (isSurvivorGame(state)) return { ...state, sessionId: `${state.sessionId}:survivor`, leaderboard: ['leaderboard', 'finished'].includes(state.phase)
    ? survivorStandings(state.players) : [] }
  return state
}

export function smallestTeam(teams: readonly GameTeam[], players: readonly Pick<Player, 'teamId'>[], random = Math.random): string {
  const counts = teams.map((team) => ({ id: team.id, count: players.filter((player) => player.teamId === team.id).length }))
  const smallest = counts.filter((team) => team.count === Math.min(...counts.map((candidate) => candidate.count)))
  if (!smallest.length) throw new Error('This room has no teams.')
  return smallest[Math.floor(random() * smallest.length) % smallest.length].id
}
