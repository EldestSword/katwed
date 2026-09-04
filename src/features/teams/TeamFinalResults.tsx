import type { SafeGameState } from '../../types/domain'
import { FinalResults } from '../game/FinalResults'
import { FinalAwardCards } from '../game/FinalAwardCards'
import { calculateFinalAwards } from '../game/finalAwards'
import { teamDisplayEntries, teamStandings } from './teams'

export function TeamFinalResults({ state, currentPlayerId, variant }: { state: SafeGameState; currentPlayerId?: string; variant: 'player' | 'presentation' }) {
  const entries = teamDisplayEntries(teamStandings(state.teams ?? [], state.players, state.leaderboard))
  const teamId = state.players.find((player) => player.id === currentPlayerId)?.teamId ?? undefined
  return <div className="team-final-results"><FinalResults entries={entries} currentPlayerId={teamId} variant={variant}
    heading={entries[0]?.nickname ?? 'Team results'} standingsLabel="Team winners"
    awardContent={<FinalAwardCards awards={calculateFinalAwards(state.leaderboard, null)} currentPlayerId={currentPlayerId} heading="Individual honours" />} /></div>
}
