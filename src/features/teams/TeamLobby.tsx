import type { CSSProperties } from 'react'
import type { GameTeam, Player } from '../../types/domain'

export function TeamLobby({ teams, players, onAssign, disabled = false }: {
  teams: readonly GameTeam[]; players: readonly Player[]; onAssign?(playerId: string, teamId: string): void; disabled?: boolean
}) {
  const accents = ['--sky', '--coral', '--mint', '--yellow', '--purple', '--sky', '--coral', '--mint']
  const groups = [...teams].sort((a, b) => a.displayOrder - b.displayOrder).map((team) => ({ ...team, members: players.filter((player) => player.teamId === team.id) }))
  const unassigned = players.filter((player) => !teams.some((team) => team.id === player.teamId))
  if (unassigned.length) groups.push({ id: '', sessionId: '', name: 'Unassigned', displayOrder: 8, members: unassigned })
  return <div className="team-lobby" aria-label="Teams">{groups.map((team) => <section className="team-group" key={team.id} aria-label={`${team.name} members`} style={{ '--team-accent': `var(${accents[team.displayOrder % 8]})` } as CSSProperties}>
    <h3>{team.name} <span>· {team.members.length}</span></h3>
    {team.members.length ? <ul>{team.members.map((player) => <li key={player.id}><span>{player.nickname}</span>{onAssign && <select aria-label={`Team for ${player.nickname}`} value={player.teamId ?? ''} disabled={disabled} onChange={(event) => onAssign(player.id, event.target.value)}>
      {!player.teamId && <option value="" disabled>Unassigned</option>}{teams.map((destination) => <option value={destination.id} key={destination.id}>{destination.name}</option>)}
    </select>}</li>)}</ul> : <p>Waiting for players…</p>}
  </section>)}</div>
}
