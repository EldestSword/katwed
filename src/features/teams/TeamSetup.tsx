import type { LaunchGameSettings, TeamAssignmentMode } from '../../types/domain'
import { validateTeamLaunch } from './teams'

export function TeamSetup({ settings, onChange }: { settings: LaunchGameSettings; onChange(settings: LaunchGameSettings): void }) {
  const names = settings.teamNames ?? ['Team 1', 'Team 2']
  const error = validateTeamLaunch(settings, 'standard')
  const updateNames = (teamNames: string[]) => onChange({ ...settings, teamNames })
  return <fieldset className="team-setup"><legend>Play as</legend>
    <div className="team-choice-grid">{(['individual', 'teams'] as const).map((mode) => <button type="button" key={mode} aria-pressed={(settings.playMode ?? 'individual') === mode} onClick={() => onChange({ ...settings, playMode: mode })}>{mode === 'teams' ? 'Teams' : 'Individuals'}</button>)}</div>
    {settings.playMode === 'teams' && <>
      <h3>Team setup</h3><p>Combined scores from every member. Balance teams in the lobby if needed.</p>
      <label>Team assignment<select value={settings.teamAssignmentMode ?? 'player-choice'} onChange={(event) => onChange({ ...settings, teamAssignmentMode: event.target.value as TeamAssignmentMode })}>
        <option value="player-choice">Player choice</option><option value="balanced-random">Balanced random</option><option value="host">Host assigns</option>
      </select></label>
      {names.map((name, index) => <div className="team-name-row" key={index}>
        <label>Team {index + 1} name<input maxLength={30} value={name} onChange={(event) => updateNames(names.map((old, i) => i === index ? event.target.value : old))} /></label>
        <button type="button" disabled={names.length <= 2} aria-label={`Remove team ${index + 1}`} onClick={() => updateNames(names.filter((_, i) => i !== index))}>Remove</button>
        <button type="button" disabled={index === 0} aria-label={`Move team ${index + 1} up`} onClick={() => { const next = [...names]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; updateNames(next) }}>↑</button>
      </div>)}
      <button type="button" disabled={names.length >= 8} onClick={() => updateNames([...names, `Team ${names.length + 1}`])}>Add team</button>
      {error && <p role="alert">{error}</p>}
    </>}
  </fieldset>
}
